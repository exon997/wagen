// E2: VIN decode za mobilnu aplikaciju tijekom Faze 0 (3.2).
//
// Zasto edge funkcija: telefon ne vidi lokalni Next, a javni web jos ne
// postoji (4.5 gate) - funkcija zivi na vec postojecem wagen-dev projektu.
// Next ruta /api/vin/decode ostaje kanonska za web; obje dijele adapter
// logiku (mapper je kopija iz packages/adapters/src/vin - sync rucno dok
// deploy bundler ne podrzi workspace import).
//
// Tok: JWT -> cache (vehicles) -> vindata -> OCR varijante -> ISO signal.
//
// OCR varijante (terenski slucaj 2026-08-25): sken je procitao '2' kao 'Z'
// (WMWZD3104FWSZ1518 umjesto ...FWS21518) - a 'Z' je legalan VIN znak pa
// validacija to ne vidi. Vindata promasaje NE naplacuje, pa na 404
// besplatno isprobamo varijante s tipicnim OCR zamjenama (jedna pozicija
// po varijanti). Pogodak se vraca s corrected_from - app trazi od
// korisnika potvrdu prepoznatog vozila.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { mapVindataResponse } from './mapper.ts';

const OCR_CONFUSIONS: Record<string, string> = {
  Z: '2',
  '2': 'Z',
  S: '5',
  '5': 'S',
  B: '8',
  '8': 'B',
  G: '6',
  '6': 'G',
  D: '0',
  '0': 'D',
};

function ocrVariants(vin: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < vin.length; i++) {
    const sub = OCR_CONFUSIONS[vin[i]!];
    if (sub) out.push(vin.slice(0, i) + sub + vin.slice(i + 1));
  }
  return out;
}

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const vindataKey = Deno.env.get('VINDATA_API_KEY');
  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Platforma vec verificira JWT (verify_jwt); dohvat korisnika za svaki slucaj
  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  const {
    data: { user },
  } = await service.auth.getUser(jwt);
  if (!user) {
    return Response.json({ error: 'Neispravna sesija' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { vin?: string } | null;
  const vin = body?.vin?.trim().toUpperCase();
  if (!vin || !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
    return Response.json({ error: 'Neispravan VIN' }, { status: 422 });
  }

  const vehicleColumns = 'id, vin, make, model, trim, engine_label, model_year, vin_decoded_source';

  // 1) Nas cache (15.1)
  const { data: cached } = await service
    .from('vehicles')
    .select(vehicleColumns)
    .eq('vin', vin)
    .maybeSingle();
  if (cached) {
    return Response.json({ source: 'cache', vehicle: cached });
  }

  // 2) vindata (dobavljac po env varijabli - odluka otvorena)
  if (vindataKey) {
    // 'miss' = 404 (besplatno kod dobavljaca), null = greska/nedostupno
    const fetchVindata = async (v: string): Promise<Record<string, unknown> | 'miss' | null> => {
      const response = await fetch(
        `https://gxvtafqbraaifsnthsyj.supabase.co/functions/v1/api-vin-decode?vin=${encodeURIComponent(v)}`,
        { headers: { 'x-api-key': vindataKey } },
      );
      if (response.ok) return (await response.json()) as Record<string, unknown>;
      return response.status === 404 ? 'miss' : null;
    };

    // Upis vozila + opreme; correctedFrom putuje do aplikacije
    const persistAndRespond = async (
      raw: Record<string, unknown>,
      canonicalVin: string,
      correctedFrom: string | null,
    ): Promise<Response | null> => {
      const decoded = mapVindataResponse(raw);
      if (!decoded.found || !decoded.make || !decoded.model) return null;
      // upsert: istovremeni pozivi (accept + samoizljecenje) ne smiju
      // jedan drugome srusiti upis na unique(vin)
      const { data: vehicle } = await service
        .from('vehicles')
        .upsert(
          {
            vin: canonicalVin,
            make: decoded.make,
            model: decoded.model,
            trim: decoded.trim,
            engine_label: decoded.engineLabel,
            model_year: decoded.modelYear,
            vin_decoded_source: 'vindata',
            decode_data: raw,
            decode_fetched_at: new Date().toISOString(),
          },
          { onConflict: 'vin' },
        )
        .select(vehicleColumns)
        .single();
      if (!vehicle) return null;

      // Oprema -> rjecnik (untranslated, 13.4) + veze na vozilu (15.5)
      const withCodes = decoded.equipment.filter((e) => e.code);
      if (withCodes.length > 0) {
        await service.from('equipment_codes').upsert(
          withCodes.map((e) => ({
            manufacturer: decoded.make,
            code: e.code,
            name_en: e.name,
            translation_status: 'untranslated',
          })),
          { onConflict: 'manufacturer,code', ignoreDuplicates: true },
        );
        const { data: codes } = await service
          .from('equipment_codes')
          .select('id, code')
          .eq('manufacturer', decoded.make)
          .in(
            'code',
            withCodes.map((e) => e.code),
          );
        if (codes && codes.length > 0) {
          await service.from('vehicle_equipment').upsert(
            codes.map((c) => ({ vehicle_id: vehicle.id, equipment_code_id: c.id })),
            { onConflict: 'vehicle_id,equipment_code_id', ignoreDuplicates: true },
          );
        }
      }
      return Response.json({
        source: 'vindata',
        vehicle,
        ...(correctedFrom ? { corrected_from: correctedFrom } : {}),
      });
    };

    try {
      const raw = await fetchVindata(vin);
      if (raw && raw !== 'miss') {
        const response = await persistAndRespond(raw, vin, null);
        if (response) return response;
      } else if (raw === 'miss') {
        // 2b) OCR varijante: prvo nas cache (jedan upit), pa dobavljac
        const variants = ocrVariants(vin);
        if (variants.length > 0) {
          const { data: cachedVariant } = await service
            .from('vehicles')
            .select(vehicleColumns)
            .in('vin', variants)
            .limit(1);
          if (cachedVariant && cachedVariant.length > 0) {
            return Response.json({
              source: 'cache',
              vehicle: cachedVariant[0],
              corrected_from: vin,
            });
          }
          // Sekvencijalno: dobavljac rate-limita paralelne pozive (terenski
          // potvrdjeno - paralelni chunk je vracao greske umjesto pogodaka)
          for (const v of variants) {
            let raw = await fetchVindata(v);
            if (raw === null) {
              await new Promise((resolve) => setTimeout(resolve, 500));
              raw = await fetchVindata(v);
            }
            if (raw && raw !== 'miss') {
              const response = await persistAndRespond(raw, v, vin);
              if (response) return response;
            }
          }
        }
        // Legitiman promasaj (cesto starija vozila) - jasan signal
        // aplikaciji da NE ponavlja pokusaje za ovaj VIN
        return Response.json({ source: 'not_found', vehicle: null });
      }
    } catch (e) {
      console.warn('vindata pao, fallback:', e);
    }
  }

  // 3) Signal aplikaciji da koristi lokalni ISO decode (E1 je on-device)
  return Response.json({ source: 'iso_fallback', vehicle: null });
});
