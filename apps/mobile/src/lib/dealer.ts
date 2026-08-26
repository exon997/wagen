/**
 * Faza A (sekcija 9): dealer kontekst u aplikaciji.
 *
 * Nakon prijave telefonom claim_dealer_invites() preuzme pozivnice za broj
 * iz JWT-a, a my_dealer() vraca salon s brandingom i fair-use stanjem.
 * Grafika tablice se skida u cache (potpisani URL) za deterministicki
 * overlay u Kotlinu. Kontekst se kesira - offline fotograf zadrzava
 * branding od zadnje sinkronizacije.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { getSupabase } from '@/lib/supabase';

export interface DealerContext {
  dealerId: string;
  displayName: string;
  studioMonthlyLimit: number;
  studioUsedThisMonth: number;
  hasBrandedBackground: boolean;
  /** Lokalni file s grafikom reklamne tablice salona (null = obican blur). */
  plateOverlayUri: string | null;
}

const CACHE_KEY = 'wagen.dealer.v1';

export async function getCachedDealerContext(): Promise<DealerContext | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as DealerContext) : null;
  } catch {
    return null;
  }
}

export async function refreshDealerContext(): Promise<DealerContext | null> {
  const supabase = getSupabase();
  if (!supabase) return getCachedDealerContext();
  try {
    // Idempotentno: preuzmi eventualne nove pozivnice za ovaj telefon
    await supabase.rpc('claim_dealer_invites');
    const { data, error } = await supabase.rpc('my_dealer');
    if (error) return getCachedDealerContext();
    const row = (Array.isArray(data) ? data[0] : data) as {
      dealer_id?: string;
      display_name?: string;
      studio_background_path?: string | null;
      plate_overlay_path?: string | null;
      studio_monthly_limit?: number;
      studio_used_this_month?: number;
    } | null;
    if (!row?.dealer_id || !row.display_name) {
      await AsyncStorage.removeItem(CACHE_KEY);
      return null;
    }

    let plateOverlayUri: string | null = null;
    if (row.plate_overlay_path) {
      try {
        const dest = `${FileSystem.cacheDirectory}dealer-plate-${row.dealer_id}.png`;
        const { data: signed } = await supabase.storage
          .from('dealer-assets')
          .createSignedUrl(row.plate_overlay_path, 3600);
        if (signed?.signedUrl) {
          await FileSystem.downloadAsync(signed.signedUrl, dest);
          plateOverlayUri = dest;
        }
      } catch {
        // bez grafike -> tablice dobivaju obican blur, flow ne staje
      }
    }

    const ctx: DealerContext = {
      dealerId: row.dealer_id,
      displayName: row.display_name,
      studioMonthlyLimit: row.studio_monthly_limit ?? 100,
      studioUsedThisMonth: Number(row.studio_used_this_month ?? 0),
      hasBrandedBackground: !!row.studio_background_path,
      plateOverlayUri,
    };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(ctx));
    return ctx;
  } catch {
    return getCachedDealerContext();
  }
}
