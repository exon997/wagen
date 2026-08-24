// E2: VIN decode za mobilnu aplikaciju tijekom Faze 0 (3.2).
//
// Zasto edge funkcija: telefon ne vidi lokalni Next, a javni web jos ne
// postoji (4.5 gate) - funkcija zivi na vec postojecem wagen-dev projektu.
// Next ruta /api/vin/decode ostaje kanonska za web; obje dijele adapter
// logiku (mapper je kopija iz packages/adapters/src/vin - sync rucno dok
// deploy bundler ne podrzi workspace import).
//
// Tok identican Next ruti: JWT -> cache (vehicles) -> vindata -> ISO signal.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { mapVindataResponse } from './mapper.ts';

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

  // 1) Nas cache (15.1)
  const { data: cached } = await service
    .from('vehicles')
    .select('id, vin, make, model, trim, engine_label, model_year, vin_decoded_source')
    .eq('vin', vin)
    .maybeSingle();
  if (cached) {
    return Response.json({ source: 'cache', vehicle: cached });
  }

  // 2) vindata (dobavljac po env varijabli - odluka otvorena)
  if (vindataKey) {
    try {
      const response = await fetch(
        `https://gxvtafqbraaifsnthsyj.supabase.co/functions/v1/api-vin-decode?vin=${encodeURIComponent(vin)}`,
        { headers: { 'x-api-key': vindataKey } },
      );
      if (response.ok) {
        const raw = await response.json();
        const decoded = mapVindataResponse(raw);
        if (decoded.found && decoded.make && decoded.model) {
          const { data: vehicle } = await service
            .from('vehicles')
            .insert({
              vin,
              make: decoded.make,
              model: decoded.model,
              trim: decoded.trim,
              engine_label: decoded.engineLabel,
              model_year: decoded.modelYear,
              vin_decoded_source: 'vindata',
              decode_data: raw,
              decode_fetched_at: new Date().toISOString(),
            })
            .select('id, vin, make, model, trim, engine_label, model_year, vin_decoded_source')
            .single();
          if (vehicle) {
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
                .in('code', withCodes.map((e) => e.code));
              if (codes && codes.length > 0) {
                await service.from('vehicle_equipment').upsert(
                  codes.map((c) => ({ vehicle_id: vehicle.id, equipment_code_id: c.id })),
                  { onConflict: 'vehicle_id,equipment_code_id', ignoreDuplicates: true },
                );
              }
            }
            return Response.json({ source: 'vindata', vehicle });
          }
        }
      }
    } catch (e) {
      console.warn('vindata pao, fallback:', e);
    }
  }

  // 3) Signal aplikaciji da koristi lokalni ISO decode (E1 je on-device)
  return Response.json({ source: 'iso_fallback', vehicle: null });
});
