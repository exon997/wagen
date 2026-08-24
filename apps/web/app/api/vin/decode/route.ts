import { NextResponse } from 'next/server';
import { createServiceClient } from '@wagen/supabase';
import { decodeVinLocally, isStructurallyValidVin } from '@wagen/domain';
import { VindataVinAdapter } from '@wagen/adapters/vin';

/**
 * G4: Server-side VIN dekodiranje sa cacheom (3.2).
 *
 * Tok: JWT provjera -> E1 validacija -> cache lookup (vehicles po VIN-u) ->
 * Outvin (E2, kad stignu krediti) -> lokalni ISO fallback.
 *
 * Vozilo se PERZISTIRA samo iz Outvin odgovora (potpuni podaci); lokalni
 * fallback vraca grubi decode bez zapisa - vehicles.make/model su not null,
 * a fallback zna samo proizvodjaca. Vozilo tada nastaje kod predaje oglasa
 * s rucno unesenim podacima.
 */
export async function POST(request: Request) {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const secretKey = process.env['SUPABASE_SECRET_KEY'];
  if (!url || !secretKey) {
    return NextResponse.json({ error: 'Server nije konfiguriran' }, { status: 500 });
  }
  const service = createServiceClient(url, secretKey);

  // Aplikacija salje svoj access token - anonimna sesija je dovoljna (4.3),
  // ali NEKI identitet mora postojati (anon kljuc sam po sebi nije dosta).
  const authHeader = request.headers.get('authorization');
  const jwt = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!jwt) {
    return NextResponse.json({ error: 'Nedostaje autorizacija' }, { status: 401 });
  }
  const {
    data: { user },
    error: authError,
  } = await service.auth.getUser(jwt);
  if (authError || !user) {
    return NextResponse.json({ error: 'Neispravna sesija' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { vin?: string } | null;
  const vin = body?.vin?.trim().toUpperCase();
  if (!vin) {
    return NextResponse.json({ error: 'VIN je obavezan' }, { status: 400 });
  }

  const local = decodeVinLocally(vin);
  if (!isStructurallyValidVin(vin)) {
    return NextResponse.json(
      {
        error: local.likelyOldtimer
          ? 'Nestandardni broj sasije - rucni unos podataka'
          : 'Neispravan VIN',
        likelyOldtimer: local.likelyOldtimer,
      },
      { status: 422 },
    );
  }

  // 1) Cache: vozilo vec postoji (15.1 - vozilo postoji jednom, zauvijek)
  const { data: cached } = await service
    .from('vehicles')
    .select('id, vin, make, model, trim, engine_label, model_year, vin_decoded_source')
    .eq('vin', vin)
    .maybeSingle();
  if (cached) {
    return NextResponse.json({ source: 'cache', vehicle: cached });
  }

  // 2) Vanjski decode kroz adapter (E2). Dobavljac po env varijabli -
  // odluka Outvin vs vindata je otvorena, sucelje ih izjednacava.
  const vindataKey = process.env['VINDATA_API_KEY'];
  if (vindataKey) {
    try {
      const adapter = new VindataVinAdapter(vindataKey);
      const decoded = await adapter.decode(vin);
      if (decoded.found && decoded.make && decoded.model) {
        const { data: vehicle, error: vehicleError } = await service
          .from('vehicles')
          .insert({
            vin,
            make: decoded.make,
            model: decoded.model,
            trim: decoded.trim,
            engine_label: decoded.engineLabel,
            model_year: decoded.modelYear,
            vin_decoded_source: 'vindata',
            decode_data: decoded.raw as never,
            decode_fetched_at: new Date().toISOString(),
          })
          .select('id, vin, make, model, trim, engine_label, model_year, vin_decoded_source')
          .single();
        if (!vehicleError && vehicle) {
          await persistEquipment(service, vehicle.id, decoded.make, decoded.equipment);
          return NextResponse.json({ source: 'vindata', vehicle });
        }
      }
    } catch (e) {
      // 3.2: pad vanjskog API-ja NIKAD ne rusi flow - neprimjetni fallback
      console.warn('vindata decode pao, fallback na ISO:', e);
    }
  }

  // 3) Lokalni ISO fallback (E1): grubi proizvodjac + godina, bez zapisa.
  return NextResponse.json({
    source: 'iso_fallback',
    vehicle: null,
    decoded: {
      manufacturer: local.manufacturer,
      year: local.year,
      wmi: local.wmi,
    },
  });
}

/**
 * Oprema iz decode odgovora -> equipment_codes rjecnik (13.4, status
 * untranslated - Claude prijevod ide asinkrono kroz E3 mehanizam) +
 * vehicle_equipment veze (na VOZILU, 15.5).
 */
async function persistEquipment(
  service: ReturnType<typeof createServiceClient>,
  vehicleId: string,
  manufacturer: string,
  equipment: { code: string | null; name: string }[],
) {
  const withCodes = equipment.filter((e): e is { code: string; name: string } => !!e.code);
  if (withCodes.length === 0) return;

  await service.from('equipment_codes').upsert(
    withCodes.map((e) => ({
      manufacturer,
      code: e.code,
      name_en: e.name,
      translation_status: 'untranslated' as const,
    })),
    { onConflict: 'manufacturer,code', ignoreDuplicates: true },
  );

  const { data: codes } = await service
    .from('equipment_codes')
    .select('id, code')
    .eq('manufacturer', manufacturer)
    .in(
      'code',
      withCodes.map((e) => e.code),
    );
  if (codes && codes.length > 0) {
    await service.from('vehicle_equipment').upsert(
      codes.map((c) => ({ vehicle_id: vehicleId, equipment_code_id: c.id })),
      { onConflict: 'vehicle_id,equipment_code_id', ignoreDuplicates: true },
    );
  }
}
