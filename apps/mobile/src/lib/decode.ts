/**
 * E2 (app strana): server-side VIN decode kroz edge funkciju vin-decode.
 * Server drzi vindata kljuc i cache (15.1); app dobiva kanonski rezultat.
 * Neuspjeh (offline, promasaj) vraca null - flow NIKAD ne staje (3.2),
 * lokalni E1 decode na ekranu ostaje kao gruba informacija.
 */
import { getSupabase } from '@/lib/supabase';
import type { VehicleInfo } from '@/lib/sessions';

export interface RemoteDecode extends VehicleInfo {
  vehicleId: string;
}

export async function decodeVinRemote(vin: string): Promise<RemoteDecode | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.functions.invoke('vin-decode', { body: { vin } });
    if (error) return null;
    const vehicle = (data as { vehicle?: Record<string, unknown> | null } | null)?.vehicle;
    if (
      !vehicle ||
      typeof vehicle['id'] !== 'string' ||
      typeof vehicle['make'] !== 'string' ||
      typeof vehicle['model'] !== 'string'
    ) {
      return null;
    }
    return {
      vehicleId: vehicle['id'],
      make: vehicle['make'],
      model: vehicle['model'],
      engineLabel: typeof vehicle['engine_label'] === 'string' ? vehicle['engine_label'] : null,
      modelYear: typeof vehicle['model_year'] === 'number' ? vehicle['model_year'] : null,
    };
  } catch {
    return null;
  }
}
