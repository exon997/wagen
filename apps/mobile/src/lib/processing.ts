/**
 * I2/I4 orkestracija: obrada fotografija po postavkama iz Pripreme (2. korak
 * flowa): pozadina Original/Diskretna(blur)/Studio(predlozak), sakrivanje
 * registarskih oznaka, automatska dorada. Original se uvijek cuva.
 *
 * Studio predlosci postoje za 6 eksterijernih kadrova cijelog auta;
 * ostali kadrovi u studio modu dobivaju blur (kotac izbliza i interijer
 * nemaju smislen predlozak).
 */
import { Asset } from 'expo-asset';
import { detectProcessingCapability } from '@/lib/capabilities';
import { findPlateRegions } from '@/lib/plates';
import {
  DEFAULT_LOOK,
  type LocalPhoto,
  type LocalSession,
  type LookSettings,
} from '@/lib/sessions';

export interface ProcessResult {
  processed: number;
  skipped: number;
  failed: number;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TEMPLATE_MODULES: Record<string, number> = {
  'ext-front-left': require('../../assets/backgrounds/ext-front-left.jpg') as number,
  'ext-front': require('../../assets/backgrounds/ext-front.jpg') as number,
  'ext-front-right': require('../../assets/backgrounds/ext-front-right.jpg') as number,
  'ext-rear-right': require('../../assets/backgrounds/ext-rear-right.jpg') as number,
  'ext-rear': require('../../assets/backgrounds/ext-rear.jpg') as number,
  'ext-rear-left': require('../../assets/backgrounds/ext-rear-left.jpg') as number,
};

function shotKeyFromUri(uri: string): string | null {
  const match = /\/([a-z-]+)-[0-9a-f]{8}\.jpg$/.exec(uri);
  return match?.[1] ?? null;
}

async function templateUriFor(photo: LocalPhoto): Promise<string | null> {
  const key = shotKeyFromUri(photo.uri);
  if (!key || !(key in TEMPLATE_MODULES)) return null;
  const asset = Asset.fromModule(TEMPLATE_MODULES[key]!);
  await asset.downloadAsync();
  return asset.localUri ?? asset.uri;
}

async function processOne(
  photo: LocalPhoto,
  look: LookSettings,
  capability: 'full' | 'blur_only',
): Promise<string | null> {
  const { WagenPhoto } = await import('../../modules/wagen-photo');

  // I4: sakrij registarske oznake (radi na svim uredjajima)
  let workingUri = photo.uri;
  if (look.hidePlates) {
    try {
      const plates = await findPlateRegions(photo.uri);
      if (plates.length > 0) {
        workingUri = await WagenPhoto.blurRegions(photo.uri, plates);
      }
    } catch (e) {
      console.warn('Detekcija tablica preskocena:', e);
    }
  }

  // Pozadina se obradjuje samo na eksterijeru cijelog auta
  const isCarShot = photo.angleCategory === 'exterior';
  const wantsBackground = look.background !== 'original' && isCarShot && capability === 'full';

  if (!wantsBackground) {
    if (!look.enhance && workingUri === photo.uri) return null; // nista za raditi
    return WagenPhoto.processPhoto(workingUri, { mode: 'none', enhance: look.enhance });
  }

  const templateUri = look.background === 'studio' ? await templateUriFor(photo) : null;
  return WagenPhoto.processPhoto(workingUri, {
    mode: templateUri ? 'template' : 'blur',
    ...(templateUri ? { templateUri } : {}),
    enhance: look.enhance,
  });
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

  const look = session.look ?? DEFAULT_LOOK;
  const targets = session.photos.filter((p) => !p.processedUri);
  const result: ProcessResult = {
    processed: 0,
    skipped: session.photos.length - targets.length,
    failed: 0,
  };

  const photos = [...session.photos];
  let done = 0;
  for (const photo of targets) {
    try {
      const processedUri = await processOne(photo, look, capability);
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
