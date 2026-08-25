/**
 * E2 (app strana): server-side VIN decode kroz edge funkciju vin-decode.
 * Server drzi vindata kljuc i cache (15.1); app dobiva kanonski rezultat.
 * Neuspjeh (offline, promasaj) vraca info=null - flow NIKAD ne staje (3.2),
 * ali razlog NIKAD nije tih: vraca se pozivatelju i salje u app_events
 * (terenska lekcija: tihi fallback = nedijagnosticiran bug).
 */
import { getSupabase } from '@/lib/supabase';
import { logEvent } from '@/lib/events';
import type { VehicleInfo } from '@/lib/sessions';

export interface RemoteDecode extends VehicleInfo {
  vehicleId: string;
}

export interface DecodeOutcome {
  info: RemoteDecode | null;
  error: string | null;
}

export async function decodeVinRemote(vin: string): Promise<DecodeOutcome> {
  const supabase = getSupabase();
  if (!supabase) return { info: null, error: 'aplikacija nije povezana (konfiguracija)' };

  const fail = (error: string): DecodeOutcome => {
    logEvent('vin_decode_error', { vin, error: error.slice(0, 200) });
    return { info: null, error };
  };

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return fail('sesija nije uspostavljena (anonimna prijava nije prosla)');

    const { data, error } = await supabase.functions.invoke('vin-decode', { body: { vin } });
    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status;
      return fail(`${status ? `HTTP ${status}: ` : ''}${error.message || String(error)}`);
    }

    const vehicle = (data as { vehicle?: Record<string, unknown> | null } | null)?.vehicle;
    if (
      !vehicle ||
      typeof vehicle['id'] !== 'string' ||
      typeof vehicle['make'] !== 'string' ||
      typeof vehicle['model'] !== 'string'
    ) {
      return fail(`neocekivan odgovor servera: ${JSON.stringify(data ?? null).slice(0, 140)}`);
    }

    return {
      info: {
        vehicleId: vehicle['id'],
        make: vehicle['make'],
        model: vehicle['model'],
        engineLabel: typeof vehicle['engine_label'] === 'string' ? vehicle['engine_label'] : null,
        modelYear: typeof vehicle['model_year'] === 'number' ? vehicle['model_year'] : null,
      },
      error: null,
    };
  } catch (e) {
    return fail(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }
}
