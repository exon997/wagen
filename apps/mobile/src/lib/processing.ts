/**
 * I2 orkestracija: obrada fotografija sesije kroz wagen-photo nativni modul.
 *
 * Obradjuje se SAMO eksterijer (4.4 - segmentacija subjekta + blur pozadine);
 * interijer i detalji ostaju netaknuti (nema pozadine za zamutiti).
 * Original se cuva - obrada pise novu datoteku i pamti processedUri po fotki,
 * pa je povratak na original uvijek moguc.
 */
import { detectProcessingCapability } from '@/lib/capabilities';
import type { LocalPhoto, LocalSession } from '@/lib/sessions';

export interface ProcessResult {
  processed: number;
  skipped: number;
  failed: number;
}

export async function processSessionPhotos(
  session: LocalSession,
  onProgress?: (done: number, total: number) => void,
): Promise<{ photos: LocalPhoto[]; result: ProcessResult }> {
  const capability = await detectProcessingCapability();
  if (capability !== 'full') {
    // blur_only degradacija dolazi s I4/I5 iteracijom; bez segmentacije
    // nista se ne mijenja - postene informacije umjesto lose obrade
    return {
      photos: session.photos,
      result: { processed: 0, skipped: session.photos.length, failed: 0 },
    };
  }

  const { WagenPhoto } = await import('../../modules/wagen-photo');
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
      const processedUri = await WagenPhoto.processPhoto(photo.uri);
      const idx = photos.findIndex((p) => p.id === photo.id);
      if (idx >= 0) photos[idx] = { ...photos[idx]!, processedUri };
      result.processed += 1;
    } catch (e) {
      console.warn(`Obrada fotke ${photo.id} pala:`, e);
      result.failed += 1;
    }
    done += 1;
    onProgress?.(done, targets.length);
  }

  return { photos, result };
}
