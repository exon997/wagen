/**
 * I1: Capability detection (4.4 - ODLUCENO "radi na novijim uredjajima").
 *
 * Tri razine:
 *  - 'full'      : ML Kit subject segmentation dostupan -> puni pipeline
 *  - 'blur_only' : stariji/nesposobni uredjaj -> degradacija, uz jasnu
 *                  poruku da puni set trazi noviji uredjaj
 *  - 'none'      : nativni modul nedostupan (Expo Go) -> bez obrade
 *
 * Server-side fallback se NE gradi (4.4). Rezultat se kesira po pokretanju.
 */
export type ProcessingCapability = 'full' | 'blur_only' | 'none';

let cached: ProcessingCapability | null = null;

export async function detectProcessingCapability(): Promise<ProcessingCapability> {
  if (cached) return cached;
  try {
    const { WagenPhoto } = await import('../../modules/wagen-photo');
    const available = await WagenPhoto.isSubjectSegmentationAvailable();
    if (available) {
      cached = 'full';
      return cached;
    }
    // Modul mozda samo jos nije instaliran na uredjaju - zatrazi jednom
    const installed = await WagenPhoto.requestSegmentationModule();
    cached = installed ? 'full' : 'blur_only';
    return cached;
  } catch {
    cached = 'none';
    return cached;
  }
}
