/**
 * I2/I4 orkestracija: obrada fotografija po postavkama iz Pripreme (2. korak
 * flowa): pozadina Original/Diskretna(blur)/Studio(AI u oblaku), sakrivanje
 * registarskih oznaka, automatska dorada. Original se uvijek cuva.
 *
 * Studio (odluka 2026-08-25): fotka ide u edge funkciju studio-photo
 * (Gemini) - eksterijer dobiva studio pozadinu, interijer zamjenu pogleda
 * kroz stakla. Tablice se zamucuju NA UREDJAJU prije slanja. Ako oblak
 * padne (offline), eksterijer degradira na nativni pipeline (predlozak/
 * blur) - i to se biljezi, nikad tiho. Kotac izbliza, prtljaznik i
 * znacajke se u studio modu ne diraju.
 */
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { detectProcessingCapability } from '@/lib/capabilities';
import { getCachedDealerContext, type DealerContext } from '@/lib/dealer';
import { logEvent } from '@/lib/events';
import { findPlateRegions } from '@/lib/plates';
import { getSupabase } from '@/lib/supabase';
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

/* eslint-disable @typescript-eslint/no-require-imports -- Metro trazi require() za staticke assete */
const TEMPLATE_MODULES: Record<string, number> = {
  'ext-front-left': require('../../assets/backgrounds/ext-front-left.jpg') as number,
  'ext-front': require('../../assets/backgrounds/ext-front.jpg') as number,
  'ext-front-right': require('../../assets/backgrounds/ext-front-right.jpg') as number,
  'ext-rear-right': require('../../assets/backgrounds/ext-rear-right.jpg') as number,
  'ext-rear': require('../../assets/backgrounds/ext-rear.jpg') as number,
  'ext-rear-left': require('../../assets/backgrounds/ext-rear-left.jpg') as number,
};
/* eslint-enable @typescript-eslint/no-require-imports */

function shotKeyFromUri(uri: string): string | null {
  const match = /\/([a-z-]+)-[0-9a-f]{8}\.jpg$/.exec(uri);
  return match?.[1] ?? null;
}

const STUDIO_CLOUD_TIMEOUT_MS = 90000;

/** AI studio u oblaku; null = nije uspjelo (razlog zabiljezen, nikad tih). */
async function studioCloud(
  uri: string,
  kind: 'exterior' | 'interior',
  shotKey: string,
  sessionId: string,
): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const started = Date.now();
  try {
    const image = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    // sessionId nosi dealer kontekst (branding + fair-use) - server je istina
    const invocation = supabase.functions.invoke('studio-photo', {
      body: { image, kind, sessionId },
    });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('isteklo vrijeme (90 s)')), STUDIO_CLOUD_TIMEOUT_MS),
    );
    const { data, error } = await Promise.race([invocation, timeout]);
    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status;
      throw new Error(`${status ? `HTTP ${status}: ` : ''}${error.message || String(error)}`);
    }
    const out = (data as { image?: string } | null)?.image;
    if (!out) throw new Error('prazan odgovor servera');
    const dest = `${FileSystem.cacheDirectory}wagen-studio-${shotKey}-${started}.jpg`;
    await FileSystem.writeAsStringAsync(dest, out, {
      encoding: FileSystem.EncodingType.Base64,
    });
    logEvent('studio_cloud_ok', { shot: shotKey, kind, ms: Date.now() - started });
    return dest;
  } catch (e) {
    logEvent('studio_cloud_failed', {
      shot: shotKey,
      kind,
      error: (e instanceof Error ? e.message : String(e)).slice(0, 160),
    });
    return null;
  }
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
  sessionId: string,
  dealer: DealerContext | null,
): Promise<string | null> {
  const { WagenPhoto } = await import('../../modules/wagen-photo');

  const shotKey = shotKeyFromUri(photo.uri) ?? 'nepoznat';

  // I4: sakrij registarske oznake (radi na svim uredjajima). Salon s
  // grafikom tablice dobiva deterministicki overlay umjesto blura (9).
  let workingUri = photo.uri;
  if (look.hidePlates) {
    const isExterior = photo.angleCategory === 'exterior';
    try {
      const plates = await findPlateRegions(photo.uri);
      if (isExterior) logEvent('plates_detected', { shot: shotKey, count: plates.length });
      if (plates.length > 0) {
        workingUri = dealer?.plateOverlayUri
          ? await WagenPhoto.overlayRegions(photo.uri, plates, dealer.plateOverlayUri)
          : await WagenPhoto.blurRegions(photo.uri, plates);
      }
    } catch (e) {
      if (isExterior) logEvent('plates_error', { shot: shotKey, error: String(e).slice(0, 160) });
      else console.warn('Detekcija tablica preskocena:', e);
    }
  }

  // Studio: AI u oblaku - eksterijer cijelog auta i interijer; kotac
  // izbliza AI zna precrtati pa ga preskacemo (kao i prtljaznik/znacajke)
  if (look.background === 'studio') {
    const cloudKind =
      photo.angleCategory === 'interior'
        ? ('interior' as const)
        : shotKey in TEMPLATE_MODULES
          ? ('exterior' as const)
          : null;
    if (cloudKind) {
      const cloudUri = await studioCloud(workingUri, cloudKind, shotKey, sessionId);
      if (cloudUri) return cloudUri;
      // pad oblaka: eksterijer nastavlja na nativni pipeline ispod
    }
  }

  // Pozadina (nativno) se obradjuje samo na eksterijeru cijelog auta;
  // u studio modu ovo je jos samo fallback za 6 glavnih kadrova
  const isCarShot = photo.angleCategory === 'exterior';
  const wantsBackground =
    look.background !== 'original' &&
    isCarShot &&
    capability === 'full' &&
    (look.background !== 'studio' || shotKey in TEMPLATE_MODULES);

  if (!wantsBackground) {
    if (!look.enhance && workingUri === photo.uri) return null; // nista za raditi
    const res = await WagenPhoto.processPhoto(workingUri, { mode: 'none', enhance: look.enhance });
    return res.uri;
  }

  const templateUri = look.background === 'studio' ? await templateUriFor(photo) : null;
  if (look.background === 'studio' && !templateUri) {
    // Ocekivano za kotac izbliza (nema predloska); za 6 glavnih kadrova = bug
    logEvent('studio_template_missing', { shot: shotKey, uri: photo.uri.slice(-48) });
  }
  const res = await WagenPhoto.processPhoto(workingUri, {
    mode: templateUri ? 'template' : 'blur',
    ...(templateUri ? { templateUri } : {}),
    enhance: look.enhance,
  });
  if (templateUri && !res.templateApplied) {
    logEvent('studio_template_failed', {
      shot: shotKey,
      scheme: templateUri.split(':')[0] ?? '',
      uri: templateUri.slice(0, 80),
    });
  }
  return res.uri;
}

export async function processSessionPhotos(
  session: LocalSession,
  onProgress?: (done: number, total: number) => void,
): Promise<{ photos: LocalPhoto[]; result: ProcessResult }> {
  const detected = await detectProcessingCapability();
  const look = session.look ?? DEFAULT_LOOK;
  // Studio ide u oblak pa radi i na uredjajima bez segmentacije
  if (detected === 'none' && look.background !== 'studio') {
    return {
      photos: session.photos,
      result: { processed: 0, skipped: session.photos.length, failed: 0 },
    };
  }
  const capability = detected === 'none' ? 'blur_only' : detected;
  const dealer = session.dealerId ? await getCachedDealerContext() : null;
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
      const processedUri = await processOne(photo, look, capability, session.id, dealer);
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

  logEvent('photos_processed', {
    background: look.background,
    capability,
    processed: result.processed,
    skipped: result.skipped,
    failed: result.failed,
  });
  return { photos, result };
}
