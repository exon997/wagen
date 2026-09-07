'use client';

import { useState } from 'react';
import type { PDFFont, PDFPage, RGB } from 'pdf-lib';

/**
 * Izlog (18.1) i Ekspoze (19.3) - generiranje u pregledniku (pdf-lib),
 * isti princip kao video/carousel: nula infrastrukture. DejaVu fontovi
 * (public/fonts) zbog hrvatskih dijakritika - standardni PDF fontovi ih
 * nemaju. QR vodi na javnu stranicu salona; kad web oglasnik dobije
 * stranice oglasa, cilj postaje oglas (4.7 short link).
 */

const A4: [number, number] = [595.28, 841.89];
const CYAN = { r: 0x1e / 255, g: 0xdc / 255, b: 0xe8 / 255 };

export interface DokumentiProps {
  photos: { url: string | null }[];
  title: string;
  subtitle: string;
  priceLabel: string;
  facts: { label: string; value: string }[];
  equipment: string[];
  description: string | null;
  dealerName: string;
  dealerPhone: string | null;
  dealerCity: string | null;
  pageUrl: string | null;
}

async function loadKit() {
  const [{ PDFDocument, rgb }, fontkitModule, qrcode] = await Promise.all([
    import('pdf-lib'),
    import('@pdf-lib/fontkit'),
    import('qrcode'),
  ]);
  const doc = await PDFDocument.create();
  doc.registerFontkit((fontkitModule.default ?? fontkitModule) as Parameters<typeof doc.registerFontkit>[0]);
  const fetchFont = async (name: string) =>
    doc.embedFont(await (await fetch(`/fonts/${name}`)).arrayBuffer(), { subset: true });
  const [regular, bold, boldItalic] = await Promise.all([
    fetchFont('DejaVuSans.ttf'),
    fetchFont('DejaVuSans-Bold.ttf'),
    fetchFont('DejaVuSans-BoldOblique.ttf'),
  ]);
  return { doc, rgb, regular, bold, boldItalic, qrcode };
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function drawPricePill(
  page: PDFPage,
  rgb: (r: number, g: number, b: number) => RGB,
  font: PDFFont,
  priceLabel: string,
  x: number,
  y: number,
  size: number,
) {
  const w = font.widthOfTextAtSize(priceLabel, size);
  const padX = size * 0.45;
  const h = size * 1.55;
  page.drawRectangle({ x, y, width: w + padX * 2, height: h, color: rgb(CYAN.r, CYAN.g, CYAN.b) });
  page.drawText(priceLabel, { x: x + padX, y: y + (h - size) / 2 + size * 0.08, size, font, color: rgb(0, 0, 0) });
  return h;
}

async function fetchJpgBytes(url: string): Promise<ArrayBuffer> {
  return (await fetch(url)).arrayBuffer();
}

function download(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function Dokumenti(props: DokumentiProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const urls = props.photos.map((p) => p.url).filter((u): u is string => !!u);

  const makeIzlog = async () => {
    setBusy('izlog');
    setNote(null);
    try {
      const { doc, rgb, regular, bold, boldItalic, qrcode } = await loadKit();
      const page = doc.addPage(A4);
      const [W, H] = A4;
      const margin = 48;
      let y = H - margin - 8;

      page.drawText(props.dealerName, { x: margin, y, size: 15, font: bold, color: rgb(0.2, 0.2, 0.2) });
      y -= 14;
      page.drawLine({ start: { x: margin, y }, end: { x: W - margin, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
      y -= 56;
      // Dvoredni naslov (13.1)
      page.drawText(props.title, { x: margin, y, size: 32, font: bold });
      y -= 26;
      page.drawText(props.subtitle, { x: margin, y, size: 16, font: regular, color: rgb(0.35, 0.35, 0.35) });
      y -= 92;
      drawPricePill(page, rgb, boldItalic, props.priceLabel, margin, y, 44);
      y -= 40;
      // Kljucne cinjenice
      const factW = (W - margin * 2) / Math.max(props.facts.length, 1);
      props.facts.forEach((f, i) => {
        const x = margin + i * factW;
        page.drawText(f.label.toUpperCase(), { x, y, size: 9, font: regular, color: rgb(0.45, 0.45, 0.45) });
        page.drawText(f.value, { x, y: y - 18, size: 15, font: bold });
      });
      y -= 62;
      page.drawLine({ start: { x: margin, y }, end: { x: W - margin, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
      y -= 28;
      // Oprema u dva stupca
      page.drawText('Istaknuta oprema', { x: margin, y, size: 13, font: bold });
      y -= 22;
      const items = props.equipment.slice(0, 18);
      const colW = (W - margin * 2) / 2;
      items.forEach((item, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const lines = wrapText(`•  ${item}`, regular, 11, colW - 16);
        page.drawText(lines[0]!, { x: margin + col * colW, y: y - row * 20, size: 11, font: regular });
      });
      y -= Math.ceil(items.length / 2) * 20 + 30;

      // QR + link (dno)
      const target = props.pageUrl ?? 'https://wagen.hr';
      const qrData = await qrcode.toDataURL(target, { margin: 0, width: 240 });
      const qrImage = await doc.embedPng(qrData);
      const qrSize = 118;
      page.drawImage(qrImage, { x: margin, y: 64, width: qrSize, height: qrSize });
      page.drawText('Sve fotografije, oprema i aktualna cijena:', { x: margin + qrSize + 18, y: 140, size: 12, font: regular, color: rgb(0.3, 0.3, 0.3) });
      page.drawText(target.replace(/^https?:\/\//, ''), { x: margin + qrSize + 18, y: 118, size: 16, font: bold });
      page.drawText('wagen.hr', { x: W - margin - bold.widthOfTextAtSize('wagen.hr', 12), y: 44, size: 12, font: bold, color: rgb(0.4, 0.4, 0.4) });

      download(await doc.save(), `${props.title.replace(/\s+/g, '-')}-izlog.pdf`);
      setNote('Izlog preuzet ✓ (A4 za vjetrobran)');
    } catch (e) {
      setNote(`Izlog nije uspio: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const makeEkspoze = async () => {
    setBusy('ekspoze');
    setNote(null);
    try {
      const { doc, rgb, regular, bold, boldItalic, qrcode } = await loadKit();
      const [W, H] = A4;
      const margin = 48;

      // 1. stranica: hero + naslov + cijena + cinjenice
      const p1 = doc.addPage(A4);
      if (urls[0]) {
        const img = await doc.embedJpg(await fetchJpgBytes(urls[0]));
        const targetH = H * 0.46;
        const scale = Math.max((W - margin * 2) / img.width, targetH / img.height);
        const dw = Math.min(img.width * scale, W - margin * 2);
        const dh = (img.height / img.width) * dw;
        p1.drawImage(img, { x: margin, y: H - margin - dh, width: dw, height: dh });
      }
      let y = H * 0.44;
      p1.drawText(props.title, { x: margin, y, size: 30, font: bold });
      y -= 24;
      p1.drawText(props.subtitle, { x: margin, y, size: 15, font: regular, color: rgb(0.35, 0.35, 0.35) });
      y -= 78;
      drawPricePill(p1, rgb, boldItalic, props.priceLabel, margin, y, 36);
      y -= 40;
      const factW = (W - margin * 2) / Math.max(props.facts.length, 1);
      props.facts.forEach((f, i) => {
        const x = margin + i * factW;
        p1.drawText(f.label.toUpperCase(), { x, y, size: 9, font: regular, color: rgb(0.45, 0.45, 0.45) });
        p1.drawText(f.value, { x, y: y - 17, size: 14, font: bold });
      });
      p1.drawText(`${props.dealerName}${props.dealerCity ? ` · ${props.dealerCity}` : ''}`, { x: margin, y: 52, size: 12, font: bold, color: rgb(0.3, 0.3, 0.3) });

      // 2. stranica: oprema + opis
      const p2 = doc.addPage(A4);
      let y2 = H - margin - 10;
      p2.drawText('Oprema', { x: margin, y: y2, size: 18, font: bold });
      y2 -= 28;
      const colW = (W - margin * 2) / 2;
      let maxRow = 0;
      props.equipment.slice(0, 44).forEach((item, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        maxRow = Math.max(maxRow, row);
        const lines = wrapText(`•  ${item}`, regular, 10.5, colW - 14);
        p2.drawText(lines[0]!, { x: margin + col * colW, y: y2 - row * 17, size: 10.5, font: regular });
      });
      y2 -= (maxRow + 1) * 17 + 34;
      if (props.description) {
        p2.drawText('Opis', { x: margin, y: y2, size: 18, font: bold });
        y2 -= 26;
        for (const line of wrapText(props.description, regular, 11, W - margin * 2).slice(0, 28)) {
          p2.drawText(line, { x: margin, y: y2, size: 11, font: regular, lineHeight: 15 });
          y2 -= 16;
        }
      }

      // Foto stranice: 2x3 grid
      const rest = urls.slice(1);
      for (let start = 0; start < rest.length; start += 6) {
        const pg = doc.addPage(A4);
        const chunk = rest.slice(start, start + 6);
        const cw = (W - margin * 2 - 12) / 2;
        const ch = (H - margin * 2 - 24) / 3;
        for (let i = 0; i < chunk.length; i++) {
          const img = await doc.embedJpg(await fetchJpgBytes(chunk[i]!));
          const col = i % 2;
          const row = Math.floor(i / 2);
          const scale = Math.min(cw / img.width, ch / img.height);
          const dw = img.width * scale;
          const dh = img.height * scale;
          pg.drawImage(img, {
            x: margin + col * (cw + 12) + (cw - dw) / 2,
            y: H - margin - (row + 1) * (ch + 12) + (ch - dh) / 2,
            width: dw,
            height: dh,
          });
        }
      }

      // Kontakt blok na zadnjoj stranici
      const last = doc.getPage(doc.getPageCount() - 1);
      const target = props.pageUrl ?? 'https://wagen.hr';
      const qrData = await qrcode.toDataURL(target, { margin: 0, width: 240 });
      const qrImage = await doc.embedPng(qrData);
      last.drawRectangle({ x: margin, y: 40, width: W - margin * 2, height: 96, color: rgb(0.96, 0.96, 0.96) });
      last.drawImage(qrImage, { x: margin + 12, y: 52, width: 72, height: 72 });
      last.drawText(props.dealerName, { x: margin + 100, y: 104, size: 14, font: bold });
      last.drawText(
        [props.dealerPhone, props.dealerCity].filter(Boolean).join(' · ') || 'wagen.hr',
        { x: margin + 100, y: 84, size: 12, font: regular, color: rgb(0.3, 0.3, 0.3) },
      );
      last.drawText(`Aktualna cijena i status: ${target.replace(/^https?:\/\//, '')}`, { x: margin + 100, y: 62, size: 11, font: regular, color: rgb(0.3, 0.3, 0.3) });

      download(await doc.save(), `${props.title.replace(/\s+/g, '-')}-ekspoze.pdf`);
      setNote('Ekspoze preuzet ✓ (dossier za kupca)');
    } catch (e) {
      setNote(`Ekspoze nije uspio: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section style={{ marginTop: 24 }}>
      <strong>Dokumenti</strong>
      <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        <button onClick={() => void makeIzlog()} disabled={busy !== null} style={btn}>
          {busy === 'izlog' ? '🖨 Slazem…' : '🖨 Izlog (A4 za vjetrobran)'}
        </button>
        <button onClick={() => void makeEkspoze()} disabled={busy !== null || urls.length === 0} style={btn}>
          {busy === 'ekspoze' ? '📄 Slazem…' : '📄 Ekspoze (dossier za kupca)'}
        </button>
      </div>
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
