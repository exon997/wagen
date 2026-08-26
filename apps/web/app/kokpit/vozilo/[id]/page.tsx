import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { VoziloDetalj } from './detalj';

export const dynamic = 'force-dynamic';

/**
 * Kokpit Krug 1 (18.1): detalj vozila - podaci oglasa (cijena kroz
 * price_events, km, godina, stanje, opis s AI prijedlogom), oprema iz
 * VIN-a, upravljanje fotografijama (redoslijed, naslovna, brisanje,
 * upload, ZIP). [id] = photo_sessions.id.
 */
export default async function VoziloPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <main style={{ padding: 24, fontFamily: 'system-ui' }}>
        <p>
          Prijava je istekla - <Link href="/kokpit">natrag na Kokpit</Link>
        </p>
      </main>
    );
  }

  const { data: session } = await supabase
    .from('photo_sessions')
    .select(
      'id, vin, dealer_id, listing_id, vehicles (id, make, model, engine_label, model_year), photo_session_photos (id, storage_path, angle_category, sort_order)',
    )
    .eq('id', id)
    .maybeSingle();

  if (!session?.listing_id || !session.vehicles) {
    return (
      <main style={{ padding: 24, fontFamily: 'system-ui' }}>
        <p>
          Sesija nije pronadjena ili jos nema oglas.{' '}
          <Link href="/kokpit">Natrag na Kokpit</Link>
        </p>
      </main>
    );
  }

  const [{ data: listing }, { data: prices }, { data: equipment }] = await Promise.all([
    supabase
      .from('listings')
      .select(
        'id, status, price_current, vat_deductible, first_registration_year, mileage_km, location_city, description, attributes',
      )
      .eq('id', session.listing_id)
      .single(),
    supabase
      .from('price_events')
      .select('price, created_at')
      .eq('listing_id', session.listing_id)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('vehicle_equipment')
      .select('equipment_codes (code, name_en, name_hr, translation_status)')
      .eq('vehicle_id', session.vehicles.id),
  ]);

  if (!listing) {
    return (
      <main style={{ padding: 24, fontFamily: 'system-ui' }}>
        <p>Oglas nije dostupan.</p>
      </main>
    );
  }

  const photos = await Promise.all(
    [...session.photo_session_photos]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(async (p) => {
        const { data: signed } = await supabase.storage
          .from('session-photos')
          .createSignedUrl(p.storage_path, 3600);
        return { ...p, url: signed?.signedUrl ?? null };
      }),
  );

  const equipmentNames = (equipment ?? [])
    .map((row) => row.equipment_codes)
    .filter((c): c is NonNullable<typeof c> => !!c)
    .map((c) => c.name_hr ?? c.name_en ?? c.code);

  return (
    <VoziloDetalj
      sessionId={session.id}
      vin={session.vin}
      vehicle={session.vehicles}
      listing={listing}
      priceHistory={prices ?? []}
      equipment={equipmentNames}
      photos={photos}
    />
  );
}
