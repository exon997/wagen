import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { KokpitPrijava } from './prijava';

export const dynamic = 'force-dynamic';

/**
 * Faza B (18.1, Kokpit-lite): centralna zaliha salona - sve fotografirane
 * jedinice na jednom mjestu: vozilo, broj fotografija, studio status.
 * Read-only v1; uredjivanje oglasa i objava na portale dolaze u iducim
 * krugovima (Faza C).
 */
export default async function KokpitPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <KokpitPrijava />;

  const { data: dealerRows } = await supabase.rpc('my_dealer');
  const dealer = Array.isArray(dealerRows) ? dealerRows[0] : dealerRows;
  if (!dealer) {
    return (
      <main style={{ maxWidth: 560, margin: '80px auto', fontFamily: 'system-ui', padding: 16 }}>
        <h1>Kokpit</h1>
        <p>
          Prijavljen si, ali ovaj broj nije povezan ni s jednim salonom. Javi se wagenu da te
          dodamo.
        </p>
      </main>
    );
  }

  const { data: sessions } = await supabase
    .from('photo_sessions')
    .select(
      'id, vin, created_at, studio_processed_at, listing_id, listings (status, price_current), vehicles (make, model, engine_label, model_year), photo_session_photos (storage_path, sort_order)',
    )
    .eq('dealer_id', dealer.dealer_id)
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = await Promise.all(
    (sessions ?? []).map(async (s) => {
      const photos = [...(s.photo_session_photos ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order,
      );
      let thumb: string | null = null;
      if (photos[0]) {
        const { data: signed } = await supabase.storage
          .from('session-photos')
          .createSignedUrl(photos[0].storage_path, 3600);
        thumb = signed?.signedUrl ?? null;
      }
      return { ...s, photoCount: photos.length, thumb };
    }),
  );

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', fontFamily: 'system-ui', padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 style={{ fontSize: 26 }}>{dealer.display_name} · Kokpit</h1>
        <p style={{ color: '#555' }}>
          AI studio ovaj mjesec: <strong>{dealer.studio_used_this_month}</strong> /{' '}
          {dealer.studio_monthly_limit} vozila
        </p>
      </header>

      {rows.length === 0 ? (
        <p style={{ color: '#555' }}>
          Jos nema fotografiranih vozila. Fotografiranja iz aplikacije pojavljuju se ovdje.
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={cell}>Fotografija</th>
              <th style={cell}>Vozilo</th>
              <th style={cell}>Cijena</th>
              <th style={cell}>Status</th>
              <th style={cell}>Fotki</th>
              <th style={cell}>Studio</th>
              <th style={cell}>Snimljeno</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const v = r.vehicles;
              const statusLabel =
                r.listings?.status === 'sold'
                  ? 'Prodano'
                  : r.listings?.status === 'active'
                    ? 'Spremno'
                    : r.listing_id
                      ? 'U pripremi'
                      : '—';
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={cell}>
                    {r.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element -- potpisani URL, bez optimizacije u v1
                      <img
                        src={r.thumb}
                        alt=""
                        style={{ width: 96, height: 72, objectFit: 'cover', borderRadius: 6 }}
                      />
                    ) : (
                      <span style={{ color: '#999' }}>—</span>
                    )}
                  </td>
                  <td style={cell}>
                    {r.listing_id ? (
                      <Link href={`/kokpit/vozilo/${r.id}`}>
                        {v
                          ? `${v.make} ${v.model}${v.engine_label ? ` ${v.engine_label}` : ''}${v.model_year ? ` · ${v.model_year}.` : ''}`
                          : 'Neprepoznato vozilo'}
                      </Link>
                    ) : v ? (
                      `${v.make} ${v.model}`
                    ) : (
                      'Neprepoznato vozilo'
                    )}
                    <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#777' }}>
                      {r.vin ?? ''}
                    </div>
                  </td>
                  <td style={{ ...cell, fontWeight: 700 }}>
                    {r.listings?.price_current != null
                      ? `€${r.listings.price_current.toLocaleString('de-DE')},-`
                      : '—'}
                  </td>
                  <td style={cell}>{statusLabel}</td>
                  <td style={cell}>{r.photoCount}</td>
                  <td style={cell}>{r.studio_processed_at ? '✓' : '—'}</td>
                  <td style={cell}>{new Date(r.created_at).toLocaleDateString('hr-HR')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}

const cell: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' };
