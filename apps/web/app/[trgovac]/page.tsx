import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { colors, formatPrice } from '@wagen/domain';
import { createService } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

/**
 * Javna stranica trgovca (18.1, ODLUCENO 2026-09-05): wagen.hr/{slug}.
 * Namjena: Google Business odrediste za salone bez vlastitog weba - od
 * prvog dana koristenja AlphaOne/Kokpita. Prikazuje samo OBJAVLJENE
 * stranice i AKTIVNE oglase (status 'active' = "Spremno" u Kokpitu).
 * Service klijent s eksplicitnim javnim filterima (vidi lib/supabase/
 * service.ts) - staticke Next rute (kokpit, admin...) imaju prednost
 * pred ovim dinamickim segmentom, a baza dodatno brani rezervirane
 * slugove check constraintom.
 */

async function loadPage(slug: string) {
  const service = createService();
  const { data: page } = await service
    .from('dealer_pages')
    .select('dealer_id, slug, about, phone, email, address, city, working_hours, website')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();
  if (!page) return null;

  const { data: dealer } = await service
    .from('dealers')
    .select('display_name, status')
    .eq('id', page.dealer_id)
    .single();
  if (!dealer || dealer.status !== 'active') return null;

  const { data: listings } = await service
    .from('listings')
    .select(
      'id, price_current, first_registration_year, mileage_km, vehicles (make, model, engine_label, model_year)',
    )
    .eq('dealer_id', page.dealer_id)
    .eq('status', 'active')
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(60);

  // Naslovna fotka: prva fotka sesije vezane na oglas
  const rows = await Promise.all(
    (listings ?? []).map(async (l) => {
      const { data: session } = await service
        .from('photo_sessions')
        .select('photo_session_photos (storage_path, processed_storage_path, sort_order)')
        .eq('listing_id', l.id)
        .maybeSingle();
      const first = [...(session?.photo_session_photos ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order,
      )[0];
      let thumb: string | null = null;
      if (first) {
        const { data: signed } = await service.storage
          .from('session-photos')
          .createSignedUrl(first.processed_storage_path ?? first.storage_path, 3600);
        thumb = signed?.signedUrl ?? null;
      }
      return { ...l, thumb };
    }),
  );

  return { page, dealer, listings: rows };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ trgovac: string }>;
}): Promise<Metadata> {
  const { trgovac } = await params;
  const data = await loadPage(trgovac);
  if (!data) return { title: 'wagen.hr' };
  return {
    title: `${data.dealer.display_name} — rabljena vozila | wagen.hr`,
    description:
      data.page.about ??
      `Ponuda vozila salona ${data.dealer.display_name}${data.page.city ? `, ${data.page.city}` : ''}.`,
  };
}

export default async function TrgovacPage({
  params,
}: {
  params: Promise<{ trgovac: string }>;
}) {
  const { trgovac } = await params;
  const data = await loadPage(trgovac);
  if (!data) notFound();
  const { page, dealer, listings } = data;

  return (
    <main style={{ fontFamily: 'system-ui', margin: 0 }}>
      <header style={{ background: '#0b0b0b', color: '#fff', padding: '28px 24px' }}>
        <div style={{ maxWidth: 1040, margin: '0 auto' }}>
          <h1 style={{ margin: 0, fontSize: 30 }}>{dealer.display_name}</h1>
          <p style={{ color: '#bbb', marginTop: 6 }}>
            {[page.address, page.city].filter(Boolean).join(', ')}
            {page.working_hours ? ` · ${page.working_hours}` : ''}
          </p>
          <p style={{ marginTop: 10 }}>
            {page.phone && (
              <a href={`tel:${page.phone.replace(/\s/g, '')}`} style={ctaStyle}>
                📞 {page.phone}
              </a>
            )}
            {page.email && (
              <a href={`mailto:${page.email}`} style={{ ...ctaStyle, background: 'transparent', color: colors.cyan, border: `1px solid ${colors.cyan}` }}>
                ✉ {page.email}
              </a>
            )}
          </p>
        </div>
      </header>

      <div style={{ maxWidth: 1040, margin: '0 auto', padding: 24 }}>
        {page.about && <p style={{ fontSize: 16, lineHeight: 1.6, color: '#333' }}>{page.about}</p>}

        <h2 style={{ fontSize: 20, marginTop: 24 }}>
          Ponuda vozila ({listings.length})
        </h2>
        {listings.length === 0 ? (
          <p style={{ color: '#666' }}>Trenutno nema aktivnih oglasa.</p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 18,
              marginTop: 12,
            }}
          >
            {listings.map((l) => {
              const v = l.vehicles;
              const year = l.first_registration_year ?? v?.model_year;
              return (
                <article
                  key={l.id}
                  style={{ border: '1px solid #e5e5e5', borderRadius: 12, overflow: 'hidden' }}
                >
                  {l.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element -- potpisani URL
                    <img
                      src={l.thumb}
                      alt=""
                      style={{ width: '100%', height: 170, objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <div style={{ height: 170, background: '#f0f0f0' }} />
                  )}
                  <div style={{ padding: 12 }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>
                      {year ? `${year} ` : ''}
                      {v ? `${v.make} ${v.model}` : 'Vozilo'}
                    </p>
                    <p style={{ margin: '2px 0 8px', color: '#666', fontSize: 14 }}>
                      {[v?.engine_label, l.mileage_km ? `${l.mileage_km.toLocaleString('de-DE')} km` : null]
                        .filter(Boolean)
                        .join(' · ') || ' '}
                    </p>
                    <span
                      style={{
                        display: 'inline-block',
                        background: colors.cyan,
                        color: '#000',
                        fontWeight: 700,
                        fontStyle: 'italic',
                        padding: '4px 12px',
                        borderRadius: 6,
                      }}
                    >
                      {formatPrice(l.price_current)}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <footer style={{ marginTop: 40, paddingTop: 16, borderTop: '1px solid #eee', color: '#999', fontSize: 13 }}>
          Stranica salona na <strong>wagen.hr</strong>
          {page.website && (
            <>
              {' · '}
              <a href={page.website} rel="nofollow noopener">
                {page.website.replace(/^https?:\/\//, '')}
              </a>
            </>
          )}
        </footer>
      </div>
    </main>
  );
}

const ctaStyle: React.CSSProperties = {
  display: 'inline-block',
  background: colors.cyan,
  color: '#000',
  fontWeight: 700,
  padding: '10px 18px',
  borderRadius: 8,
  textDecoration: 'none',
  marginRight: 10,
};
