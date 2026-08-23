/**
 * G3: VIN prepoznavanje iz fotografije (3.2).
 *
 * Tok: expo-camera slika still -> ML Kit text recognition (on-device) ->
 * kandidati iz prepoznatog teksta -> E1 validacija (packages/domain).
 * Bez mreze - Outvin poziv ide tek nakon validacije, server-side (G4).
 */
import { decodeVinLocally, isStructurallyValidVin } from '@wagen/domain';

/** Cesta OCR zamjena: I/O/Q se u VIN-u ne pojavljuju (ISO 3779). */
function normalizeOcrCandidate(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/I/g, '1')
    .replace(/[OQ]/g, '0')
    .replace(/[^A-Z0-9]/g, '');
}

export interface VinScanResult {
  vin: string | null;
  /** Svi 17-znakovni kandidati, za rucni odabir kad ih je vise. */
  candidates: string[];
}

/** Izvuce VIN kandidate iz slike. Vraca prvi strukturno valjan VIN. */
/** OCR je dostupan samo u dev/preview buildovima - Expo Go nema nativni modul. */
export async function isOcrAvailable(): Promise<boolean> {
  try {
    await import('@react-native-ml-kit/text-recognition');
    return true;
  } catch {
    return false;
  }
}

export async function scanVinFromImage(imageUri: string): Promise<VinScanResult> {
  // Lijeni import: Expo Go (iOS bez Developer racuna) nema ML Kit -
  // ekran se ne smije srusiti, gumb za sken se sakrije (isOcrAvailable).
  const { default: TextRecognition } = await import('@react-native-ml-kit/text-recognition');
  const result = await TextRecognition.recognize(imageUri);

  const candidates: string[] = [];
  for (const block of result.blocks) {
    for (const line of block.lines) {
      const normalized = normalizeOcrCandidate(line.text);
      // VIN moze biti okruzen drugim tekstom - trazi 17-znakovni prozor
      for (let i = 0; i + 17 <= normalized.length; i++) {
        const window = normalized.slice(i, i + 17);
        if (isStructurallyValidVin(window) && !candidates.includes(window)) {
          candidates.push(window);
        }
      }
    }
  }

  // Preferiraj kandidata s poznatim proizvodjacem (E1 WMI tablica)
  const withMake = candidates.find((c) => decodeVinLocally(c).manufacturer !== null);
  return { vin: withMake ?? candidates[0] ?? null, candidates };
}
