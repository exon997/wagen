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
import { logEvent } from '@/lib/events';
import { getSupabase } from '@/lib/supabase';

export interface DealerBackground {
  id: string;
  name: string;
  /** Lokalni thumbnail za picker u Pripremi (null dok se ne skine). */
  localUri: string | null;
}

export interface DealerContext {
  dealerId: string;
  displayName: string;
  studioMonthlyLimit: number;
  studioUsedThisMonth: number;
  hasBrandedBackground: boolean;
  /** Studijske pozadine salona - izbor u Pripremi (zadana = prva). */
  backgrounds: DealerBackground[];
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
    // Idempotentno: preuzmi eventualne nove pozivnice za ovaj telefon.
    // Greske se NE gutaju tiho (lekcija: claim je danima bacao 42P01).
    const { error: claimError } = await supabase.rpc('claim_dealer_invites');
    if (claimError) {
      logEvent('dealer_claim_error', { error: claimError.message.slice(0, 160) });
    }
    const { data, error } = await supabase.rpc('my_dealer');
    if (error) {
      logEvent('dealer_lookup_error', { error: error.message.slice(0, 160) });
      return getCachedDealerContext();
    }
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

    const { data: backgroundRows } = await supabase
      .from('dealer_backgrounds')
      .select('id, name, storage_path')
      .eq('dealer_id', row.dealer_id)
      .order('sort_order');

    // Thumbnaili pozadina za picker (dizajn 2026-09-07) - keširano lokalno
    const backgrounds: DealerBackground[] = [];
    for (const b of backgroundRows ?? []) {
      let localUri: string | null = null;
      try {
        const dest = `${FileSystem.cacheDirectory}dealer-bg-${b.id}.png`;
        const info = await FileSystem.getInfoAsync(dest);
        if (info.exists) {
          localUri = dest;
        } else {
          const { data: signed } = await supabase.storage
            .from('dealer-assets')
            .createSignedUrl(b.storage_path, 3600);
          if (signed?.signedUrl) {
            await FileSystem.downloadAsync(signed.signedUrl, dest);
            localUri = dest;
          }
        }
      } catch {
        // bez thumbnaila - picker pokazuje samo ime
      }
      backgrounds.push({ id: b.id, name: b.name, localUri });
    }

    const ctx: DealerContext = {
      dealerId: row.dealer_id,
      displayName: row.display_name,
      backgrounds,
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
