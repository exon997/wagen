/**
 * wagen render-worker (4.7, spec 3.1): polling render_jobs svakih ~2 s
 * kroz claim_render_job() (SKIP LOCKED), Remotion render, upload u
 * bucket videos, upis listing_videos. Retry 3x zivi u claim RPC-u
 * (attempts + oporavak zaglavljenih); ovdje se neuspjeh samo vraca u red.
 */
import { readFile } from 'node:fs/promises';
import { templateConfigSchema } from '@wagen/video-templates';
import { env } from './env.js';
import { createService } from './supa.js';
import { buildRenderInput } from './listing-data.js';
import { getServeUrl, renderVideo } from './render.js';

const service = createService();

interface Job {
  id: string;
  listing_id: string;
  template_slug: string;
  template_version: number;
  attempts: number;
}

async function processJob(job: Job): Promise<void> {
  const startedAt = Date.now();

  const { data: template, error: templateError } = await service
    .from('video_templates')
    .select('config')
    .eq('slug', job.template_slug)
    .eq('version', job.template_version)
    .single();
  if (templateError || !template) {
    throw new Error(
      `Template ${job.template_slug} v${job.template_version}: ${templateError?.message ?? 'ne postoji'}`,
    );
  }
  const config = templateConfigSchema.parse(template.config);

  const { input, shortCode } = await buildRenderInput(
    service,
    job.listing_id,
    config,
    env.linkBase,
  );

  const result = await renderVideo(job.template_slug, input);
  try {
    const videoBytes = await readFile(result.videoPath);
    const thumbBytes = await readFile(result.thumbPath);
    const base = `${job.listing_id}/${job.template_slug}-v${job.template_version}`;

    const { error: videoUpErr } = await service.storage
      .from('videos')
      .upload(`${base}.mp4`, videoBytes, { contentType: 'video/mp4', upsert: true });
    if (videoUpErr) throw new Error(`Upload videa: ${videoUpErr.message}`);
    const { error: thumbUpErr } = await service.storage
      .from('videos')
      .upload(`${base}.jpg`, thumbBytes, { contentType: 'image/jpeg', upsert: true });
    if (thumbUpErr) throw new Error(`Upload thumbnaila: ${thumbUpErr.message}`);

    const { data: video, error: rowErr } = await service
      .from('listing_videos')
      .upsert(
        {
          listing_id: job.listing_id,
          template_slug: job.template_slug,
          template_version: job.template_version,
          storage_path: `${base}.mp4`,
          thumb_path: `${base}.jpg`,
          duration_sec: result.durationSec,
          size_bytes: videoBytes.byteLength,
          render_ms: Date.now() - startedAt,
          status: 'ready',
        },
        { onConflict: 'listing_id,template_slug,template_version' },
      )
      .select('id')
      .single();
    if (rowErr) throw new Error(`listing_videos: ${rowErr.message}`);

    await service
      .from('short_links')
      .update({ video_id: video.id })
      .eq('code', shortCode)
      .is('video_id', null);

    console.log(
      `[render] ok ${job.listing_id} ${job.template_slug} v${job.template_version} ` +
        `${(videoBytes.byteLength / 1024 / 1024).toFixed(1)} MB u ${Date.now() - startedAt} ms`,
    );
  } finally {
    await result.cleanup();
  }
}

async function tick(): Promise<boolean> {
  const { data, error } = await service.rpc('claim_render_job');
  if (error) {
    console.error('[claim]', error.message);
    return false;
  }
  const job = (Array.isArray(data) ? data[0] : data) as Job | undefined;
  if (!job) return false;

  try {
    await processJob(job);
    await service
      .from('render_jobs')
      .update({ status: 'done', error: null, locked_at: null })
      .eq('id', job.id);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[render] pao ${job.id} (pokusaj ${job.attempts}):`, message);
    await service
      .from('render_jobs')
      .update({
        status: job.attempts >= 3 ? 'failed' : 'queued',
        error: message.slice(0, 500),
        locked_at: null,
      })
      .eq('id', job.id);
  }
  return true;
}

async function main() {
  console.log('[worker] start; bundlam templatee…');
  await getServeUrl();
  console.log('[worker] spreman, polling svakih', env.pollMs, 'ms');
  for (;;) {
    let hadWork = false;
    try {
      hadWork = await tick();
    } catch (e) {
      console.error('[tick]', e instanceof Error ? e.message : e);
    }
    if (!hadWork) await new Promise((resolve) => setTimeout(resolve, env.pollMs));
  }
}

void main();
