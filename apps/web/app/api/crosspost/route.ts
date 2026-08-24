import { NextResponse } from 'next/server';
import { createServiceClient } from '@wagen/supabase';
import { decodeVinLocally } from '@wagen/domain';

/**
 * J2: Crosspost (4.2, 4.5) - photo_session postaje pending oglas.
 *
 * Uvjeti: pozivatelj je vlasnik sesije I ima verificiran telefon (SMS OTP
 * upgrade anonimne sesije vec obavljen u aplikaciji, 4.3). Rezultat:
 * vehicle (iz cachea po VIN-u ili novi), listing status=pending (pending
 * pool za launch dan, 4.5), listing_photos iz photo_session_photos.
 *
 * Fotke zasad referenciraju session-photos bucket - preseljenje u javni
 * bucket dolazi s aktivacijom oglasa (Sprint 3/4), pending nije javan.
 */
export async function POST(request: Request) {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const secretKey = process.env['SUPABASE_SECRET_KEY'];
  if (!url || !secretKey) {
    return NextResponse.json({ error: 'Server nije konfiguriran' }, { status: 500 });
  }
  const service = createServiceClient(url, secretKey);

  const authHeader = request.headers.get('authorization');
  const jwt = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!jwt) return NextResponse.json({ error: 'Nedostaje autorizacija' }, { status: 401 });

  const {
    data: { user },
    error: authError,
  } = await service.auth.getUser(jwt);
  if (authError || !user) {
    return NextResponse.json({ error: 'Neispravna sesija' }, { status: 401 });
  }
  // 3.2/4.3: objava trazi verificiran telefon - jedina vratarnica u proizvodu
  if (!user.phone || !user.phone_confirmed_at) {
    return NextResponse.json(
      { error: 'Telefon nije verificiran', code: 'PHONE_REQUIRED' },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    sessionId?: string;
    priceEur?: number | null;
    mileageKm?: number | null;
    firstRegistrationYear?: number | null;
    make?: string;
    model?: string;
  } | null;
  if (!body?.sessionId) {
    return NextResponse.json({ error: 'sessionId je obavezan' }, { status: 400 });
  }

  const { data: session } = await service
    .from('photo_sessions')
    .select('id, user_id, vin, listing_id')
    .eq('id', body.sessionId)
    .maybeSingle();
  if (!session || session.user_id !== user.id) {
    return NextResponse.json({ error: 'Sesija ne postoji' }, { status: 404 });
  }
  if (session.listing_id) {
    return NextResponse.json({ listingId: session.listing_id, alreadyExists: true });
  }

  // Vozilo: cache po VIN-u (15.1 - postoji jednom) ili novi zapis
  let vehicleId: string | null = null;
  if (session.vin) {
    const { data: cached } = await service
      .from('vehicles')
      .select('id')
      .eq('vin', session.vin)
      .maybeSingle();
    if (cached) vehicleId = cached.id;
  }
  if (!vehicleId) {
    const decoded = session.vin ? decodeVinLocally(session.vin) : null;
    const make = body.make?.trim() || decoded?.manufacturer;
    const model = body.model?.trim();
    if (!make || !model) {
      return NextResponse.json(
        {
          error: 'Marka i model su obavezni za vozilo bez Outvin zapisa',
          code: 'MAKE_MODEL_REQUIRED',
        },
        { status: 422 },
      );
    }
    const { data: vehicle, error: vehicleError } = await service
      .from('vehicles')
      .insert({
        vin: session.vin,
        make,
        model,
        model_year: decoded?.year ?? null,
        vin_decoded_source: session.vin ? 'iso_fallback' : 'manual',
      })
      .select('id')
      .single();
    if (vehicleError) {
      return NextResponse.json(
        { error: `Vozilo nije kreirano: ${vehicleError.message}` },
        { status: 500 },
      );
    }
    vehicleId = vehicle.id;
  }

  const { data: category } = await service
    .from('categories')
    .select('id')
    .eq('slug', 'osobna-vozila')
    .single();
  if (!category) {
    return NextResponse.json({ error: 'Kategorija ne postoji' }, { status: 500 });
  }

  // Pending oglas (4.5: pool za launch dan). Cijena ide kroz price_events
  // (15.4 - jedini put), trigger puni price_current.
  const { data: listing, error: listingError } = await service
    .from('listings')
    .insert({
      market: 'HR',
      category_id: category.id,
      vehicle_id: vehicleId,
      user_id: user.id,
      status: 'pending',
      mileage_km: body.mileageKm ?? null,
      first_registration_year: body.firstRegistrationYear ?? null,
      attributes: {},
    })
    .select('id')
    .single();
  if (listingError) {
    return NextResponse.json(
      { error: `Oglas nije kreiran: ${listingError.message}` },
      { status: 500 },
    );
  }

  if (body.priceEur != null && Number.isInteger(body.priceEur) && body.priceEur >= 0) {
    await service.from('price_events').insert({ listing_id: listing.id, price: body.priceEur });
  }

  // Fotke sesije -> listing_photos (kategorija kuta prezivljava, 13.3)
  const { data: sessionPhotos } = await service
    .from('photo_session_photos')
    .select('storage_path, angle_category, sort_order')
    .eq('session_id', session.id)
    .order('sort_order');
  if (sessionPhotos && sessionPhotos.length > 0) {
    await service.from('listing_photos').insert(
      sessionPhotos.map((p) => ({
        listing_id: listing.id,
        storage_path: p.storage_path,
        angle_category: p.angle_category,
        sort_order: p.sort_order,
      })),
    );
  }

  await service
    .from('photo_sessions')
    .update({
      crosspost_consented: true,
      status: 'completed',
      listing_id: listing.id,
      vehicle_id: vehicleId,
    })
    .eq('id', session.id);

  return NextResponse.json({ listingId: listing.id, photos: sessionPhotos?.length ?? 0 });
}
