import { NextResponse } from 'next/server';
import { createService } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

/**
 * Faza C (12, outbound): kanonski izvozni XML feed zalihe salona.
 * GET /api/feed/{dealerId}?token={feed_token}
 *
 * Portali (Njuskalo, Index...) povlace feed periodicno; po uspostavi
 * integracije s portalom pise se mapper s ovog kanonskog oblika na
 * njihov format (adapter princip - kanonski model zivi u wagenu).
 * Fotke su potpisani URL-ovi (7 dana) - regeneriraju se pri svakom
 * dohvatu feeda, pa su za portal koji povlaci dnevno uvijek svjezi.
 */

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function tag(name: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return `<${name}/>`;
  return `<${name}>${xmlEscape(String(value))}</${name}>`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ dealerId: string }> },
) {
  const { dealerId } = await params;
  const token = new URL(request.url).searchParams.get('token');
  if (!token || !/^[0-9a-f-]{36}$/.test(token) || !/^[0-9a-f-]{36}$/.test(dealerId)) {
    return NextResponse.json({ error: 'Neispravan zahtjev' }, { status: 400 });
  }

  const service = createService();
  const { data: dealer } = await service
    .from('dealers')
    .select('id, display_name, feed_token, status')
    .eq('id', dealerId)
    .maybeSingle();
  if (!dealer || dealer.feed_token !== token || dealer.status !== 'active') {
    return NextResponse.json({ error: 'Nepoznat feed' }, { status: 404 });
  }

  const { data: listings } = await service
    .from('listings')
    .select(
      'id, price_current, vat_deductible, first_registration_year, mileage_km, location_city, description, attributes, updated_at, vehicles (vin, make, model, engine_label, model_year)',
    )
    .eq('dealer_id', dealer.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(500);

  const items = await Promise.all(
    (listings ?? []).map(async (l) => {
      const { data: session } = await service
        .from('photo_sessions')
        .select('photo_session_photos (storage_path, sort_order)')
        .eq('listing_id', l.id)
        .maybeSingle();
      const photos = [...(session?.photo_session_photos ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order,
      );
      const urls = (
        await Promise.all(
          photos.map(async (p) => {
            const { data: signed } = await service.storage
              .from('session-photos')
              .createSignedUrl(p.storage_path, 7 * 24 * 3600);
            return signed?.signedUrl ?? null;
          }),
        )
      ).filter((u): u is string => !!u);

      const attrs = (l.attributes ?? {}) as Record<string, unknown>;
      const v = l.vehicles;
      return [
        '<vozilo>',
        tag('id', l.id),
        tag('vin', v?.vin ?? null),
        tag('marka', v?.make ?? null),
        tag('model', v?.model ?? null),
        tag('motor', v?.engine_label ?? null),
        tag('modelska_godina', v?.model_year ?? null),
        tag('prva_registracija', l.first_registration_year),
        tag('cijena_eur', l.price_current),
        tag('povrat_pdv', l.vat_deductible ? 'da' : 'ne'),
        tag('kilometraza', l.mileage_km),
        tag('stanje', typeof attrs['condition'] === 'string' ? attrs['condition'] : null),
        tag('grad', l.location_city),
        tag('opis', l.description),
        tag('azurirano', l.updated_at),
        '<fotografije>',
        ...urls.map((u) => tag('url', u)),
        '</fotografije>',
        '</vozilo>',
      ].join('');
    }),
  );

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<wagen_feed verzija="1" generirano="${new Date().toISOString()}">` +
    `<salon>${tag('id', dealer.id)}${tag('naziv', dealer.display_name)}</salon>` +
    `<vozila broj="${items.length}">${items.join('')}</vozila>` +
    `</wagen_feed>`;

  return new NextResponse(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
