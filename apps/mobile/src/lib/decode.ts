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
  /** Kanonski VIN iz baze - moze se razlikovati od trazenog (OCR ispravak). */
  vin: string | null;
  /** Postavljen kad je server ispravio OCR zamjenu znaka (npr. Z umjesto 2). */
  correctedFrom: string | null;
}

export interface DecodeOutcome {
  info: RemoteDecode | null;
  error: string | null;
  /** Dobavljac NEMA ovaj VIN (starija vozila) - ne ponavljati pokusaje. */
  miss?: boolean;
}

// Dedup: accept-gumb i samoizljecenje znaju okinuti istovremeno - dijele
// jedan poziv (dvostruki vindata lookup = dvostruki trosak + race na upisu)
const inFlight = new Map<string, Promise<DecodeOutcome>>();

export function decodeVinRemote(vin: string): Promise<DecodeOutcome> {
  const existing = inFlight.get(vin);
  if (existing) return existing;
  const promise = doDecode(vin).finally(() => inFlight.delete(vin));
  inFlight.set(vin, promise);
  return promise;
}

async function doDecode(vin: string): Promise<DecodeOutcome> {
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

    // Provjera OCR varijanti na serveru traje i 15+ s - velikodusan rok,
    // ali konacan (UI stanje "Prepoznajem…" ne smije visjeti zauvijek)
    const invocation = supabase.functions.invoke('vin-decode', { body: { vin } });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('isteklo vrijeme (45 s)')), 45000),
    );
    const { data, error } = await Promise.race([invocation, timeout]);
    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status;
      return fail(`${status ? `HTTP ${status}: ` : ''}${error.message || String(error)}`);
    }

    const payload = data as {
      source?: string;
      vehicle?: Record<string, unknown> | null;
      corrected_from?: string;
    } | null;
    if (payload?.source === 'not_found' || payload?.source === 'iso_fallback') {
      logEvent('vin_decode_miss', { vin, source: payload.source ?? '' });
      return { info: null, error: null, miss: true };
    }

    const vehicle = payload?.vehicle;
    if (
      !vehicle ||
      typeof vehicle['id'] !== 'string' ||
      typeof vehicle['make'] !== 'string' ||
      typeof vehicle['model'] !== 'string'
    ) {
      return fail(`neocekivan odgovor servera: ${JSON.stringify(data ?? null).slice(0, 140)}`);
    }

    if (payload?.corrected_from) {
      logEvent('vin_ocr_corrected', {
        from: payload.corrected_from,
        to: typeof vehicle['vin'] === 'string' ? vehicle['vin'] : '',
      });
    }
    return {
      info: {
        vehicleId: vehicle['id'],
        vin: typeof vehicle['vin'] === 'string' ? vehicle['vin'] : null,
        correctedFrom: payload?.corrected_from ?? null,
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
