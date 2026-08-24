/**
 * I2/I4 orkestracija: obrada fotografija sesije kroz wagen-photo modul.
 *
 * Puni pipeline ('full'):     tablica blur + segmentacija subjekta s
 *                             zamucenom pozadinom - samo eksterijer (4.4).
 * Degradacija ('blur_only'):  SAMO tablica blur (radi svugdje gdje i OCR) -
 *                             stariji uredjaji dobivaju stvarnu vrijednost,
 *                             ne prazan gumb.
 * Original se cuva - obrada pise novu datoteku (processedUri po fotki).
 */
import { detectProcessingCapability } from '@/lib/capabilities';
import { findPlateRegions } from '@/lib/plates';
import type { LocalPhoto, LocalSession } from '@/lib/sessions';

export interface ProcessResult {
  processed: number;
  skipped: number;
  failed: number;
}

async function processOne(uri: string, capability: 'full' | 'blur_only'): Promise<string | null> {
  const { WagenPhoto } = await import('../../modules/wagen-photo');

  // I4: tablica blur na ORIGINALU (koordinate iz OCR-a vrijede za original;
  // kompozit segmentacije cuva geometriju pa redoslijed ne mijenja rezultat,
  // ali blur prije segmentacije znaci da je tablica mutna i u masci subjekta)
  let workingUri = uri;
  try {
    const plates = await findPlateRegions(uri);
    if (plates.length > 0) {
      workingUri = await WagenPhoto.blurRegions(uri, plates);
    }
  } catch (e) {
    console.warn('Detekcija tablica preskocena:', e);
  }

  if (capability === 'blur_only') {
    // Bez segmentacije: vrijednost je samo tablica blur; ako tablice nema,
    // nema ni obrade (null = fotka ostaje original)
    return workingUri === uri ? null : workingUri;
  }

  // I2: segmentacija + blur pozadine
  return WagenPhoto.processPhoto(workingUri);
}

export async function processSessionPhotos(
  session: LocalSession,
  onProgress?: (done: number, total: number) => void,
): Promise<{ photos: LocalPhoto[]; result: ProcessResult }> {
  const capability = await detectProcessingCapability();
  if (capability === 'none') {
    return {
      photos: session.photos,
      result: { processed: 0, skipped: session.photos.length, failed: 0 },
    };
  }

  const targets = session.photos.filter((p) => p.angleCategory === 'exterior' && !p.processedUri);
  const result: ProcessResult = {
    processed: 0,
    skipped: session.photos.length - targets.length,
    failed: 0,
  };

  const photos = [...session.photos];
  let done = 0;
  for (const photo of targets) {
    try {
      const processedUri = await processOne(photo.uri, capability);
      if (processedUri) {
        const idx = photos.findIndex((p) => p.id === photo.id);
        if (idx >= 0) photos[idx] = { ...photos[idx]!, processedUri };
        result.processed += 1;
      } else {
        result.skipped += 1;
      }
    } catch (e) {
      console.warn(`Obrada fotke ${photo.id} pala:`, e);
      result.failed += 1;
    }
    done += 1;
    onProgress?.(done, targets.length);
  }

  return { photos, result };
}
