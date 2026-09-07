/**
 * Dossier (Ekspoze) PDF u aplikaciji (Dodatno 3, 2026-09-07): trgovac
 * preuzima brandirani PDF vozila ravno s telefona i salje kupcu.
 * Isti pdf-lib princip kao Kokpit dokumenti; Exo 2 iz bundlea pokriva
 * hrvatske dijakritike. Izlog (A4 za vjetrobran) ostaje SAMO u Kokpitu.
 * QR izostavljen: app jos ne zna javni URL oglasa (stize s objavom).
 */
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import type { PDFFont } from 'pdf-lib';
import type { LocalSession } from '@/lib/sessions';

const A4: [number, number] = [595.28, 841.89];

/* eslint-disable @typescript-eslint/no-require-imports -- Metro trazi require() za staticke assete */
const FONT_REGULAR = require('../../assets/fonts/Exo2-Regular.ttf') as number;
const FONT_BOLD = require('../../assets/fonts/Exo2-Bold.ttf') as number;
/* eslint-enable @typescript-eslint/no-require-imports */

async function fontBase64(moduleId: number): Promise<string> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error('Font nije dostupan u bundleu');
  return FileSystem.readAsStringAsync(asset.localUri, { encoding: 'base64' });
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

export interface DossierInput {
  session: LocalSession;
  dealerName: string | null;
  /** Oprema iz dekodiranog vozila (tvornicka), vec na hrvatskom. */
  equipment: string[];
}

/** Slozi dossier PDF i vrati file:// URI spreman za dijeljenje. */
export async function generateDossierPdf({
  session,
  dealerName,
  equipment,
}: DossierInput): Promise<string> {
  const [{ PDFDocument, rgb }, fontkitModule] = await Promise.all([
    import('pdf-lib'),
    import('@pdf-lib/fontkit'),
  ]);
  const doc = await PDFDocument.create();
  doc.registerFontkit(
    (fontkitModule.default ?? fontkitModule) as Parameters<typeof doc.registerFontkit>[0],
  );
  const [regular, bold] = await Promise.all([
    fontBase64(FONT_REGULAR).then((b) => doc.embedFont(b, { subset: true })),
    fontBase64(FONT_BOLD).then((b) => doc.embedFont(b, { subset: true })),
  ]);

  const [W, H] = A4;
  const margin = 48;
  const info = session.vehicleInfo;
  const title = info
    ? `${info.modelYear ? `${info.modelYear}. ` : ''}${info.make} ${info.model}`
    : 'Vozilo';
  const subtitle = info?.engineLabel ?? '';

  // Fotke: obradjena verzija ima prednost, sortirane kako ih je slozio korisnik
  const photoUris = [...session.photos]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => p.processedUri ?? p.uri);

  const embedLocalJpg = async (uri: string) =>
    doc.embedJpg(await FileSystem.readAsStringAsync(uri, { encoding: 'base64' }));

  // 1. stranica: hero + naslov + VIN + salon
  const p1 = doc.addPage(A4);
  if (photoUris[0]) {
    try {
      const img = await embedLocalJpg(photoUris[0]);
      const dw = W - margin * 2;
      const dh = (img.height / img.width) * dw;
      p1.drawImage(img, { x: margin, y: H - margin - dh, width: dw, height: dh });
    } catch {
      // hero bez slike - dossier i dalje izlazi
    }
  }
  let y = H * 0.42;
  p1.drawText(title, { x: margin, y, size: 30, font: bold });
  y -= 24;
  if (subtitle) {
    p1.drawText(subtitle, { x: margin, y, size: 15, font: regular, color: rgb(0.35, 0.35, 0.35) });
    y -= 30;
  }
  if (session.vin) {
    p1.drawText(`VIN: ${session.vin}`, {
      x: margin,
      y,
      size: 12,
      font: regular,
      color: rgb(0.45, 0.45, 0.45),
    });
  }
  p1.drawText(dealerName ?? 'wagen.hr', {
    x: margin,
    y: 52,
    size: 13,
    font: bold,
    color: rgb(0.25, 0.25, 0.25),
  });
  p1.drawText('wagen.hr', {
    x: W - margin - bold.widthOfTextAtSize('wagen.hr', 12),
    y: 52,
    size: 12,
    font: bold,
    color: rgb(0.4, 0.4, 0.4),
  });

  // 2. stranica: oprema (tvornicka + naknadno ugradjena, Dodatno 4)
  const retrofit = session.retrofitEquipment ?? [];
  if (equipment.length > 0 || retrofit.length > 0) {
    const p2 = doc.addPage(A4);
    let y2 = H - margin - 10;
    p2.drawText('Oprema', { x: margin, y: y2, size: 18, font: bold });
    y2 -= 28;
    const colW = (W - margin * 2) / 2;
    let maxRow = 0;
    equipment.slice(0, 44).forEach((item, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      maxRow = Math.max(maxRow, row);
      const lines = wrapText(`•  ${item}`, regular, 10.5, colW - 14);
      p2.drawText(lines[0]!, { x: margin + col * colW, y: y2 - row * 17, size: 10.5, font: regular });
    });
    y2 -= (equipment.length > 0 ? maxRow + 1 : 0) * 17 + 34;
    if (retrofit.length > 0) {
      p2.drawText('Naknadno ugrađena oprema', { x: margin, y: y2, size: 15, font: bold });
      y2 -= 24;
      for (const item of retrofit.slice(0, 16)) {
        p2.drawText(`•  ${item}`, { x: margin, y: y2, size: 10.5, font: regular });
        y2 -= 17;
      }
    }
  }

  // Foto stranice: 2x3 grid
  const rest = photoUris.slice(1);
  for (let start = 0; start < rest.length; start += 6) {
    const pg = doc.addPage(A4);
    const chunk = rest.slice(start, start + 6);
    const cw = (W - margin * 2 - 12) / 2;
    const ch = (H - margin * 2 - 24) / 3;
    for (let i = 0; i < chunk.length; i++) {
      try {
        const img = await embedLocalJpg(chunk[i]!);
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
      } catch {
        // preskoci neucitljivu fotku
      }
    }
  }

  const base64 = await doc.saveAsBase64();
  const safeName = title.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'vozilo';
  const dest = `${FileSystem.cacheDirectory}${safeName}-dossier.pdf`;
  await FileSystem.writeAsStringAsync(dest, base64, { encoding: 'base64' });
  return dest;
}
