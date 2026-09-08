'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * AlphaOne sadrzajni paket (4.5, pre-launch):
 * - 9:16 MP4 video: SERVER render (4.7 V1) - red u render_jobs, worker na
 *   Hetzneru rendera Remotion template, Kokpit preuzme gotov MP4
 * - carousel 4:5 JPG set u pregledniku (Canvas + JSZip)
 * - AI caption (edge fn generate-caption, facts-only)
 */

const CYAN = '#1EDCE8';

export interface MedijiProps {
  /** listings.id - cilj render posla na serveru. */
  listingId: string;
  photos: { url: string | null }[];
  title: string;
  priceLabel: string;
  dealerName: string;
  pageUrl: string | null;
  caption: {
    make: string;
    model: string;
    engineLabel: string | null;
    year: number | null;
    priceEur: number | null;
    mileageKm: number | null;
    city: string | null;
    vehicleId: string;
    /** Naknadno ugradjena oprema (Dodatno 4) - ide u AI caption facts. */
    retrofitEquipment: string[];
  };
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  return img;
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  scale: number,
) {
  const base = Math.max(w / img.width, h / img.height) * scale;
  const dw = img.width * base;
  const dh = img.height * base;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function drawBranding(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  dealerName: string,
  title: string,
  priceLabel: string,
) {
  // gornja traka: salon
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, w, 110);
  ctx.fillStyle = '#fff';
  ctx.font = `600 ${Math.round(w * 0.037)}px system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText(dealerName, 40, 58);
  // donja traka: naslov + cijena
  const bandH = 230;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, h - bandH, w, bandH);
  ctx.fillStyle = '#fff';
  ctx.font = `700 ${Math.round(w * 0.05)}px system-ui, sans-serif`;
  ctx.fillText(title, 40, h - bandH + 70);
  const priceFont = `italic 700 ${Math.round(w * 0.052)}px system-ui, sans-serif`;
  ctx.font = priceFont;
  const priceW = ctx.measureText(priceLabel).width;
  ctx.fillStyle = CYAN;
  const px = 40;
  const py = h - bandH + 115;
  const padX = 26;
  const pillH = 88;
  ctx.beginPath();
  ctx.roundRect(px, py, priceW + padX * 2, pillH, 14);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.fillText(priceLabel, px + padX, py + pillH / 2 + 4);
  // watermark
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = `700 ${Math.round(w * 0.032)}px system-ui, sans-serif`;
  const wm = 'wagen.hr';
  ctx.fillText(wm, w - ctx.measureText(wm).width - 40, h - 44);
}

export function Mediji({
  listingId,
  photos,
  title,
  priceLabel,
  dealerName,
  pageUrl,
  caption,
}: MedijiProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [captionText, setCaptionText] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const urls = photos.map((p) => p.url).filter((u): u is string => !!u);

  // 4.7 V1: server render - red u render_jobs, worker rendera, mi preuzmemo
  const makeVideo = async () => {
    setBusy('video');
    setNote(null);
    try {
      const supabase = createClient();
      const { data: template, error: templateError } = await supabase
        .from('video_templates')
        .select('slug, version')
        .eq('active', true)
        .eq('is_default', true)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (templateError || !template) {
        throw new Error(templateError?.message ?? 'nema aktivnog templatea');
      }

      // Cache: gotov video za ovaj template vec postoji? Preuzmi odmah.
      const findReady = async () => {
        const { data } = await supabase
          .from('listing_videos')
          .select('storage_path, status')
          .eq('listing_id', listingId)
          .eq('template_slug', template.slug)
          .eq('template_version', template.version)
          .maybeSingle();
        return data;
      };

      let video = await findReady();
      if (!video || video.status !== 'ready') {
        const { error: jobError } = await supabase.from('render_jobs').insert({
          listing_id: listingId,
          template_slug: template.slug,
          template_version: template.version,
        });
        if (jobError) throw new Error(jobError.message);
        setProgress('render na serveru…');
        const deadline = Date.now() + 180_000;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 3000));
          video = await findReady();
          if (video?.status === 'ready') break;
          const { data: job } = await supabase
            .from('render_jobs')
            .select('status, error')
            .eq('listing_id', listingId)
            .eq('template_slug', template.slug)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (job?.status === 'failed') throw new Error(job.error ?? 'render pao');
        }
        if (!video || video.status !== 'ready') {
          throw new Error('isteklo cekanje (3 min) - probaj ponovno');
        }
      }

      const { data: signed, error: signError } = await supabase.storage
        .from('videos')
        .createSignedUrl(video.storage_path, 3600, {
          download: `${title.replace(/\s+/g, '-')}-video.mp4`,
        });
      if (signError || !signed) throw new Error(signError?.message ?? 'potpisivanje nije uspjelo');
      const a = document.createElement('a');
      a.href = signed.signedUrl;
      a.click();
      setNote('Video preuzet ✓ (9:16, server render)');
    } catch (e) {
      setNote(`Video nije uspio: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
      setProgress('');
    }
  };

  const makeCarousel = async () => {
    setBusy('carousel');
    setNote(null);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const W = 1080;
      const H = 1350;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d')!;
      const images = await Promise.all(urls.slice(0, 6).map(loadImage));

      const slideToZip = async (name: string) => {
        const blob: Blob = await new Promise((resolve) =>
          canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.92),
        );
        zip.file(name, blob);
      };

      for (let i = 0; i < images.length; i++) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        drawCover(ctx, images[i]!, W, H, 1);
        if (i === 0) {
          drawBranding(ctx, W, H, dealerName, title, priceLabel);
        } else {
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(0, H - 90, W, 90);
          ctx.fillStyle = '#fff';
          ctx.textBaseline = 'middle';
          ctx.font = '600 34px system-ui, sans-serif';
          ctx.fillText(`${title} · ${dealerName}`, 36, H - 45);
        }
        await slideToZip(`${String(i + 1).padStart(2, '0')}.jpg`);
      }
      // CTA slide
      ctx.fillStyle = '#0b0b0b';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.font = '700 58px system-ui, sans-serif';
      ctx.fillText(dealerName, W / 2, H / 2 - 90);
      ctx.font = 'italic 700 54px system-ui, sans-serif';
      const pw = ctx.measureText(priceLabel).width;
      ctx.fillStyle = CYAN;
      ctx.beginPath();
      ctx.roundRect(W / 2 - pw / 2 - 28, H / 2 - 44, pw + 56, 88, 14);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.fillText(priceLabel, W / 2, H / 2 + 4);
      ctx.fillStyle = CYAN;
      ctx.font = '600 40px system-ui, sans-serif';
      ctx.fillText(pageUrl?.replace(/^https?:\/\//, '') ?? 'wagen.hr', W / 2, H / 2 + 120);
      ctx.textAlign = 'left';
      await slideToZip(`${String(images.length + 1).padStart(2, '0')}-cta.jpg`);

      const content = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(content);
      a.download = `${title.replace(/\s+/g, '-')}-carousel.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      setNote('Carousel preuzet ✓ (4:5, spreman za objavu)');
    } catch (e) {
      setNote(`Carousel nije uspio: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const makeCaption = async () => {
    setBusy('caption');
    setNote(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke('generate-caption', {
        body: { ...caption, dealerName, pageUrl },
      });
      if (error) throw new Error(error.message);
      const text = (data as { caption?: string } | null)?.caption;
      if (!text) throw new Error('prazan odgovor');
      setCaptionText(text);
    } catch (e) {
      setNote(`Caption nije uspio: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section style={{ marginTop: 28 }}>
      <strong>Objave za drustvene mreze</strong>
      <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        <button onClick={() => void makeVideo()} disabled={busy !== null || urls.length === 0} style={btn}>
          {busy === 'video' ? `🎬 Renderiram… ${progress}` : '🎬 Video 9:16 (MP4)'}
        </button>
        <button onClick={() => void makeCarousel()} disabled={busy !== null || urls.length === 0} style={btn}>
          {busy === 'carousel' ? '🖼 Slazem…' : '🖼 Carousel (4:5, ZIP)'}
        </button>
        <button onClick={() => void makeCaption()} disabled={busy !== null} style={btn}>
          {busy === 'caption' ? '✍ Pisem…' : '✍ AI caption'}
        </button>
      </div>
      {captionText && (
        <div style={{ marginTop: 10 }}>
          <textarea
            value={captionText}
            onChange={(e) => setCaptionText(e.target.value)}
            rows={6}
            style={{ width: '100%', padding: 10, fontSize: 14, border: '1px solid #ccc', borderRadius: 6 }}
          />
          <button
            onClick={() => {
              void navigator.clipboard.writeText(captionText);
              setNote('Caption kopiran ✓');
            }}
            style={{ ...btn, marginTop: 6 }}
          >
            📋 Kopiraj
          </button>
        </div>
      )}
      {note && <p style={{ marginTop: 8 }}>{note}</p>}
    </section>
  );
}

const btn: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: 14,
  fontWeight: 600,
  background: '#fff',
  border: '1px solid #ccc',
  borderRadius: 8,
  cursor: 'pointer',
};
