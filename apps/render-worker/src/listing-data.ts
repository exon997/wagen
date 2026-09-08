/**
 * Slaganje RenderInputa za kompoziciju: listing + vozilo + salon +
 * OBRADJENE fotke (potpisani URL-ovi) + kratki link. Worker dohvaca sve
 * sam (spec 3.1) - posao nosi samo listing_id + template.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { formatPrice, generateListingTitle } from '@wagen/domain';
import type { RenderInput, TemplateConfig } from '@wagen/video-templates';

const MAX_PHOTOS = 8;

export async function buildRenderInput(
  service: SupabaseClient,
  listingId: string,
  config: TemplateConfig,
  linkBase: string,
): Promise<{ input: RenderInput; shortCode: string }> {
  const { data: listing, error } = await service
    .from('listings')
    .select(
      'id, price_current, mileage_km, first_registration_year, dealer_id, vehicles (make, model, engine_label, model_year)',
    )
    .eq('id', listingId)
    .single();
  if (error || !listing) throw new Error(`Oglas ${listingId}: ${error?.message ?? 'ne postoji'}`);
  // Bez generiranih DB tipova supabase-js embed relaciju tipizira kao niz
  const vehicle = (Array.isArray(listing.vehicles) ? listing.vehicles[0] : listing.vehicles) as {
    make: string;
    model: string;
    engine_label: string | null;
    model_year: number | null;
  } | null;
  if (!vehicle) throw new Error(`Oglas ${listingId} nema vozilo`);

  let dealerName: string | null = null;
  if (listing.dealer_id) {
    const { data: dealer } = await service
      .from('dealers')
      .select('display_name')
      .eq('id', listing.dealer_id)
      .maybeSingle();
    dealerName = dealer?.display_name ?? null;
  }

  // Fotke: sesija oglasa, obradjena verzija ima prednost (4.7 preduvjet)
  const { data: session } = await service
    .from('photo_sessions')
    .select('photo_session_photos (storage_path, processed_storage_path, sort_order)')
    .eq('listing_id', listingId)
    .maybeSingle();
  const photoRows = [...(session?.photo_session_photos ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const photos = (
    await Promise.all(
      photoRows.slice(0, MAX_PHOTOS).map(async (p) => {
        const { data: signed } = await service.storage
          .from('session-photos')
          .createSignedUrl(p.processed_storage_path ?? p.storage_path, 3600);
        return signed?.signedUrl ?? null;
      }),
    )
  ).filter((u): u is string => !!u);
  if (photos.length === 0) throw new Error(`Oglas ${listingId} nema dostupnih fotografija`);

  const year = listing.first_registration_year ?? vehicle.model_year ?? null;
  const title = generateListingTitle({
    firstRegistrationYear: year,
    make: vehicle.make,
    model: vehicle.model,
    engineLabel: vehicle.engine_label,
  });

  const shortCode = await ensureShortLink(service, listingId);

  const input: RenderInput = {
    config,
    photos,
    listing: {
      titleLine1: title.line1,
      titleLine2: title.line2 || null,
      priceLabel: listing.price_current != null ? formatPrice(listing.price_current) : null,
      year,
      mileageKm: listing.mileage_km,
      engineLabel: vehicle.engine_label,
      dealerName,
    },
    link: `${linkBase}/${shortCode}`,
  };
  return { input, shortCode };
}

/** Jedan video short link po oglasu; postojeci se ponovno koristi. */
async function ensureShortLink(service: SupabaseClient, listingId: string): Promise<string> {
  const { data: existing } = await service
    .from('short_links')
    .select('code')
    .eq('listing_id', listingId)
    .eq('source', 'video')
    .limit(1)
    .maybeSingle();
  if (existing?.code) return existing.code;

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: code, error: genError } = await service.rpc('gen_short_code');
    if (genError || typeof code !== 'string') {
      throw new Error(`gen_short_code: ${genError?.message ?? 'prazan rezultat'}`);
    }
    const { error } = await service
      .from('short_links')
      .insert({ code, listing_id: listingId, source: 'video' });
    if (!error) return code;
    if (!error.message.includes('duplicate')) throw new Error(`short_links: ${error.message}`);
  }
  throw new Error('Kolizije koda kratkog linka 5x zaredom');
}
