/**
 * I4: Detekcija registarskih tablica reciklazom OCR-a (4.4 - on-device).
 *
 * ML Kit nema gotov detektor tablica; umjesto novog modela, text
 * recognition (vec u appu zbog VIN skena) vraca tekstualne blokove s
 * koordinatama - blok koji izgleda kao HR/EU registracija se zamuti.
 * Konzervativno: bolje propustiti tablicu (prodavac je vidi u pregledu)
 * nego zamutiti model auta ili cijenu na izlogu iza.
 */

export interface PlateRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * HR format: 2 slova (grad) + 3-4 znamenke + 1-2 slova, npr. "ZG 1234 AB".
 * OCR zna vratiti crticu/tocku izmedju - normaliziramo prije provjere.
 * Pokriva i cestu EU varijantu s drzavnim prefiksom u istom bloku.
 */
const PLATE_REGEX = /^[A-ZŠĐČĆŽ]{2}[\s·.-]{0,2}\d{3,4}[\s·.-]{0,2}[A-ZŠĐČĆŽ]{1,2}$/;

function looksLikePlate(text: string): boolean {
  const cleaned = text.trim().toUpperCase().replace(/\s+/g, ' ');
  return PLATE_REGEX.test(cleaned);
}

interface OcrFrame {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
}

/** Nadje regije tablica na slici. Prazna lista = nema kandidata. */
export async function findPlateRegions(imageUri: string): Promise<PlateRegion[]> {
  const { default: TextRecognition } = await import('@react-native-ml-kit/text-recognition');
  const result = await TextRecognition.recognize(imageUri);

  const regions: PlateRegion[] = [];
  for (const block of result.blocks) {
    for (const line of block.lines) {
      if (!looksLikePlate(line.text)) continue;
      const frame = (line as { frame?: OcrFrame }).frame ?? (block as { frame?: OcrFrame }).frame;
      if (
        frame?.left !== undefined &&
        frame.top !== undefined &&
        frame.width !== undefined &&
        frame.height !== undefined &&
        frame.width > 0 &&
        frame.height > 0
      ) {
        regions.push({
          left: frame.left,
          top: frame.top,
          width: frame.width,
          height: frame.height,
        });
      }
    }
  }
  return regions;
}
