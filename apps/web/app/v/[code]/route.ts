import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createService } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

/**
 * Kratki link s videa/dossiera (4.7, spec 3.4): wagen.hr/v/{code}.
 * V1: zabiljezi click (samo hashevi, bez sirovog IP/UA - privatnost) i
 * preusmjeri na javnu stranicu salona; kad Blok C donese stranice oglasa
 * cilj postaje /o/{slug}?src={code}, a store + deferred deep link je V2.
 */

function hash(value: string): string {
  const salt = process.env.LINK_HASH_SALT ?? 'wagen-dev-salt';
  return createHash('sha256').update(`${salt}:${value}`).digest('hex').slice(0, 24);
}

function detectPlatform(ua: string): string {
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  return 'web';
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!/^[2-9A-HJ-NP-Za-km-z]{5}$/.test(code)) {
    return NextResponse.redirect('https://wagen.hr', 302);
  }

  const service = createService();
  const { data: link } = await service
    .from('short_links')
    .select('code, listing_id')
    .eq('code', code)
    .maybeSingle();
  if (!link) return NextResponse.redirect('https://wagen.hr', 302);

  const ua = request.headers.get('user-agent') ?? '';
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  // Biljezenje ne smije srusiti redirect
  await service
    .from('link_events')
    .insert({
      code: link.code,
      event: 'click',
      platform: detectPlatform(ua),
      ua_hash: ua ? hash(ua) : null,
      ip_hash: ip ? hash(ip) : null,
    })
    .then(() => undefined);

  // V1 cilj: javna stranica salona ako postoji, inace naslovnica
  const { data: listing } = await service
    .from('listings')
    .select('dealer_id')
    .eq('id', link.listing_id)
    .maybeSingle();
  if (listing?.dealer_id) {
    const { data: page } = await service
      .from('dealer_pages')
      .select('slug, is_published')
      .eq('dealer_id', listing.dealer_id)
      .maybeSingle();
    if (page?.is_published) {
      return NextResponse.redirect(`https://wagen.hr/${page.slug}?src=${code}`, 302);
    }
  }
  return NextResponse.redirect(`https://wagen.hr?src=${code}`, 302);
}
