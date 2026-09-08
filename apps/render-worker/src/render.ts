/**
 * Remotion render (spec 3.1): bundle jednom pri startu, po poslu
 * selectComposition + renderMedia (H.264, tihi AAC track) + thumbnail,
 * pa ffmpeg -movflags +faststart. Deterministicki: isti input + template
 * verzija = isti video.
 */
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { bundle } from '@remotion/bundler';
import { ensureBrowser, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import ffmpegPathModule from 'ffmpeg-static';

// Paket izvozi putanju binarke kao CJS `export =` string
const ffmpegPath = ffmpegPathModule as unknown as string | null;
import type { RenderInput } from '@wagen/video-templates';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

let serveUrlPromise: Promise<string> | null = null;

/** Bundla template paket (webpack) - jednom po procesu. */
export function getServeUrl(): Promise<string> {
  serveUrlPromise ??= (async () => {
    await ensureBrowser();
    const entryPoint = require.resolve('@wagen/video-templates/entry');
    const publicDir = path.resolve(path.dirname(entryPoint), '..', 'public');
    return bundle({ entryPoint, publicDir });
  })();
  return serveUrlPromise;
}

export interface RenderResult {
  videoPath: string;
  thumbPath: string;
  durationSec: number;
  cleanup: () => Promise<void>;
}

export async function renderVideo(slug: string, input: RenderInput): Promise<RenderResult> {
  const serveUrl = await getServeUrl();
  const inputProps = input as unknown as Record<string, unknown>;
  const composition = await selectComposition({ serveUrl, id: slug, inputProps });

  const workDir = await mkdtemp(path.join(tmpdir(), 'wagen-render-'));
  const rawPath = path.join(workDir, 'raw.mp4');
  const videoPath = path.join(workDir, 'video.mp4');
  const thumbPath = path.join(workDir, 'thumb.jpg');

  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    crf: 24,
    enforceAudioTrack: true, // neki playeri traze audio track (spec 3.1)
    outputLocation: rawPath,
    inputProps,
    timeoutInMilliseconds: 120000,
  });

  // faststart: moov atom na pocetak da streaming krene odmah
  if (!ffmpegPath) throw new Error('ffmpeg-static binarka nije dostupna');
  await execFileAsync(ffmpegPath, [
    '-y',
    '-i',
    rawPath,
    '-c',
    'copy',
    '-movflags',
    '+faststart',
    videoPath,
  ]);

  await renderStill({
    composition,
    serveUrl,
    output: thumbPath,
    inputProps,
    frame: 0,
    imageFormat: 'jpeg',
    jpegQuality: 85,
  });

  return {
    videoPath,
    thumbPath,
    durationSec: composition.durationInFrames / composition.fps,
    cleanup: () => rm(workDir, { recursive: true, force: true }),
  };
}
