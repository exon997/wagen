/**
 * J2: Crosspost iz aplikacije - photo_session postaje pending oglas (4.2, 4.5).
 *
 * Ide direktno kroz Supabase pod RLS-om (vlasnistvo + telefon gate iz
 * migracije 20260824120000); server ruta /api/crosspost radi isto za
 * buduce web scenarije. Cijena ISKLJUCIVO kroz price_events (15.4).
 *
 * OTP upgrade anonimne sesije: updateUser({phone}) salje SMS, verifyOtp
 * (type phone_change) potvrdjuje - ISTI korisnik (anonimni id prezivljava,
 * 4.3), pa sve sesije i fotke ostaju njegove.
 */
import { decodeVinLocally } from '@wagen/domain';
import { getSupabase } from '@/lib/supabase';
import type { LocalSession } from '@/lib/sessions';

export interface CrosspostInput {
  priceEur: number | null;
  mileageKm: number | null;
  firstRegistrationYear: number | null;
  ownersCount: number | null;
  serviceBook: 'da' | 'ne' | 'djelomicno' | null;
  condition: 'bez-stete' | 'popravljena-steta' | 'osteceno' | null;
  isNew: boolean;
  description: string | null;
  /** Obavezno samo kad vozilo nije u Outvin cacheu. */
  make?: string | undefined;
  model?: string | undefined;
}

export async function isPhoneVerified(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user?.phone && !!user.phone_confirmed_at;
}

/**
 * Nacin potvrde: 'phone_change' veze broj uz postojeceg anonimnog korisnika
 * (prvi put); 'sms' prijavljuje U POSTOJECI racun kad broj vec pripada
 * nekome - tipicno reinstalacija ili drugi uredjaj (terenski slucaj
 * 2026-08-26: "korisnik vec registriran").
 */
export type PhoneOtpChannel = 'phone_change' | 'sms';

/** Posalje OTP; vraca kanal kojim se kasnije potvrdjuje. */
export async function startPhoneVerification(phone: string): Promise<PhoneOtpChannel> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Nema veze s posluziteljem');
  const { error } = await supabase.auth.updateUser({ phone });
  if (!error) return 'phone_change';
  // Broj vec pripada racunu -> prijava u taj racun (zamjenjuje anonimnu sesiju)
  const { error: signInError } = await supabase.auth.signInWithOtp({ phone });
  if (signInError) throw new Error(signInError.message);
  return 'sms';
}

export async function confirmPhoneVerification(
  phone: string,
  token: string,
  channel: PhoneOtpChannel = 'phone_change',
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Nema veze s posluziteljem');
  const { error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: channel === 'sms' ? 'sms' : 'phone_change',
  });
  if (error) throw new Error(error.message);
}

export async function crosspostSession(
  session: LocalSession,
  input: CrosspostInput,
): Promise<{ listingId: string }> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Nema veze s posluziteljem');
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sesija nije uspostavljena');

  // Vozilo: cache po VIN-u (15.1) ili novi zapis
  let vehicleId: string | null = null;
  if (session.vin) {
    const { data: cached } = await supabase
      .from('vehicles')
      .select('id')
      .eq('vin', session.vin)
      .maybeSingle();
    if (cached) vehicleId = cached.id;
  }
  if (!vehicleId) {
    const decoded = session.vin ? decodeVinLocally(session.vin) : null;
    const make = input.make?.trim() || decoded?.manufacturer;
    const model = input.model?.trim();
    if (!make || !model) throw new Error('MAKE_MODEL_REQUIRED');
    const { data: vehicle, error } = await supabase
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
    if (error) throw new Error(`Vozilo: ${error.message}`);
    vehicleId = vehicle.id;
  }

  const { data: category, error: categoryError } = await supabase
    .from('categories')
    .select('id')
    .eq('slug', 'osobna-vozila')
    .single();
  if (categoryError) throw new Error(`Kategorija: ${categoryError.message}`);

  const { data: listing, error: listingError } = await supabase
    .from('listings')
    .insert({
      market: 'HR',
      category_id: category.id,
      vehicle_id: vehicleId,
      user_id: user.id,
      status: 'pending',
      mileage_km: input.mileageKm,
      first_registration_year: input.firstRegistrationYear,
      description: input.description,
      attributes: {
        ...(input.condition ? { condition: input.condition } : {}),
        ...(input.ownersCount != null ? { owners_count: input.ownersCount } : {}),
        ...(input.serviceBook ? { service_book: input.serviceBook } : {}),
        ...(input.isNew ? { is_new: true } : {}),
      },
    })
    .select('id')
    .single();
  if (listingError) throw new Error(`Oglas: ${listingError.message}`);

  if (input.priceEur != null) {
    await supabase.from('price_events').insert({ listing_id: listing.id, price: input.priceEur });
  }

  // Fotke: session zapisi -> listing_photos (kut prezivljava, 13.3)
  const { data: sessionPhotos } = await supabase
    .from('photo_session_photos')
    .select('storage_path, angle_category, sort_order')
    .eq('session_id', session.id)
    .order('sort_order');
  if (sessionPhotos && sessionPhotos.length > 0) {
    await supabase.from('listing_photos').insert(
      sessionPhotos.map((p) => ({
        listing_id: listing.id,
        storage_path: p.storage_path,
        angle_category: p.angle_category,
        sort_order: p.sort_order,
      })),
    );
  }

  await supabase
    .from('photo_sessions')
    .update({
      crosspost_consented: true,
      status: 'completed',
      listing_id: listing.id,
      vehicle_id: vehicleId,
    })
    .eq('id', session.id);

  return { listingId: listing.id };
}
