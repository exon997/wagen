import { NextResponse } from 'next/server';
import { createServiceClient } from '@wagen/supabase';
import { decodeVinLocally, isStructurallyValidVin } from '@wagen/domain';

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

  // 2) Outvin (E2) - sjeda ovdje kad stignu krediti; do tada fallback.
  // if (process.env['OUTVIN_API_KEY']) { ... }

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
