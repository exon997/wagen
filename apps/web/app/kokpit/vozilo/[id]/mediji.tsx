'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * AlphaOne sadrzajni paket (4.5, pre-launch) - sve se generira U
 * PREGLEDNIKU (Canvas + WebCodecs): nula infrastrukture, nula troska po
 * renderu, trgovac klikne i preuzme.
 * - 9:16 MP4 video (Ken Burns slideshow s brandingom i cijenom)
 * - carousel 4:5 JPG set za drustvene mreze (ZIP)
 * - AI caption (edge fn generate-caption, facts-only)
 */

const VIDEO_W = 1080;
const VIDEO_H = 1920;
const FPS = 30;
const SECONDS_PER_PHOTO = 2.4;
const MAX_VIDEO_PHOTOS = 8;
const CYAN = '#1EDCE8';

export interface MedijiProps {
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

export function Mediji({ photos, title, priceLabel, dealerName, pageUrl, caption }: MedijiProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [captionText, setCaptionText] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const urls = photos.map((p) => p.url).filter((u): u is string => !!u);

  const makeVideo = async () => {
    if (typeof window.VideoEncoder === 'undefined') {
      setNote('Ovaj preglednik ne podrzava generiranje videa - koristi Chrome ili Edge.');
      return;
    }
    setBusy('video');
    setNote(null);
    try {
      const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
      const canvas = document.createElement('canvas');
      canvas.width = VIDEO_W;
      canvas.height = VIDEO_H;
      const ctx = canvas.getContext('2d')!;
      const images = await Promise.all(urls.slice(0, MAX_VIDEO_PHOTOS).map(loadImage));

      const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: { codec: 'avc', width: VIDEO_W, height: VIDEO_H },
        fastStart: 'in-memory',
      });
      const encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => {
          throw e;
        },
      });
      encoder.configure({
        codec: 'avc1.640028',
        width: VIDEO_W,
        height: VIDEO_H,
        bitrate: 8_000_000,
        framerate: FPS,
      });

      const framesPerPhoto = Math.round(SECONDS_PER_PHOTO * FPS);
      let t = 0;
      const pushFrame = async () => {
        const frame = new VideoFrame(canvas, {
          timestamp: Math.round((t * 1e6) / FPS),
          duration: Math.round(1e6 / FPS),
        });
        encoder.encode(frame, { keyFrame: t % (FPS * 2) === 0 });
        frame.close();
        t += 1;
        while (encoder.encodeQueueSize > 20) {
          await new Promise((r) => setTimeout(r, 5));
        }
      };

      for (let i = 0; i < images.length; i++) {
        setProgress(`fotka ${i + 1}/${images.length}`);
        for (let f = 0; f < framesPerPhoto; f++) {
          const zoom = 1 + (0.08 * f) / framesPerPhoto;
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, VIDEO_W, VIDEO_H);
          drawCover(ctx, images[i]!, VIDEO_W, VIDEO_H, zoom);
          drawBranding(ctx, VIDEO_W, VIDEO_H, dealerName, title, priceLabel);
          await pushFrame();
        }
      }
      // outro 2 s
      setProgress('zavrsna spica');
      for (let f = 0; f < FPS * 2; f++) {
        ctx.fillStyle = '#0b0b0b';
        ctx.fillRect(0, 0, VIDEO_W, VIDEO_H);
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.font = '700 64px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(dealerName, VIDEO_W / 2, VIDEO_H / 2 - 60);
        ctx.fillStyle = CYAN;
        ctx.font = '600 44px system-ui, sans-serif';
        ctx.fillText(pageUrl?.replace(/^https?:\/\//, '') ?? 'wagen.hr', VIDEO_W / 2, VIDEO_H / 2 + 40);
        ctx.textAlign = 'left';
        await pushFrame();
      }

      await encoder.flush();
      muxer.finalize();
      const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${title.replace(/\s+/g, '-')}-video.mp4`;
      a.click();
      URL.revokeObjectURL(a.href);
      setNote('Video preuzet ✓ (9:16, spreman za Reels/Stories/TikTok)');
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
