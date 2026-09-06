'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface PageData {
  slug: string;
  is_published: boolean;
  about: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  working_hours: string | null;
  website: string | null;
}

function suggestSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[čć]/g, 'c')
    .replace(/đ/g, 'd')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function StranicaForma({
  dealerId,
  displayName,
  initial,
}: {
  dealerId: string;
  displayName: string;
  initial: PageData | null;
}) {
  const [slug, setSlug] = useState(initial?.slug ?? suggestSlug(displayName));
  const [published, setPublished] = useState(initial?.is_published ?? false);
  const [about, setAbout] = useState(initial?.about ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [hours, setHours] = useState(initial?.working_hours ?? '');
  const [website, setWebsite] = useState(initial?.website ?? '');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setNote(null);
    const supabase = createClient();
    const { error } = await supabase.from('dealer_pages').upsert({
      dealer_id: dealerId,
      slug,
      is_published: published,
      about: about || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      city: city || null,
      working_hours: hours || null,
      website: website || null,
    });
    setBusy(false);
    if (error) {
      setNote(
        error.message.includes('slug')
          ? 'Adresa (slug) nije dopustena ili je zauzeta - probaj drugu.'
          : `Greska: ${error.message}`,
      );
    } else {
      setNote('Spremljeno ✓');
    }
  };

  const url = `https://wagen.hr/${slug}`;

  return (
    <main style={{ maxWidth: 680, margin: '0 auto', fontFamily: 'system-ui', padding: 24 }}>
      <p>
        <Link href="/kokpit">← Kokpit</Link>
      </p>
      <h1 style={{ fontSize: 24 }}>Javna stranica salona</h1>
      <p style={{ color: '#555' }}>
        Ovo je stranica koju kupci vide i koju mozes staviti u Google Business profil.
      </p>

      <label style={field}>
        Web adresa stranice
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#555' }}>wagen.hr/</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            style={{ ...input, flex: 1 }}
          />
        </div>
        {published && (
          <small>
            Uzivo:{' '}
            <a href={url} target="_blank" rel="noreferrer">
              {url}
            </a>
          </small>
        )}
      </label>

      <label style={field}>
        O salonu
        <textarea value={about} onChange={(e) => setAbout(e.target.value)} rows={4} style={input} />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label style={field}>
          Telefon
          <input value={phone} onChange={(e) => setPhone(e.target.value)} style={input} />
        </label>
        <label style={field}>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} style={input} />
        </label>
        <label style={field}>
          Adresa
          <input value={address} onChange={(e) => setAddress(e.target.value)} style={input} />
        </label>
        <label style={field}>
          Grad
          <input value={city} onChange={(e) => setCity(e.target.value)} style={input} />
        </label>
        <label style={field}>
          Radno vrijeme
          <input
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="Pon-Pet 8-18, Sub 9-13"
            style={input}
          />
        </label>
        <label style={field}>
          Postojeca web stranica (ako postoji)
          <input value={website} onChange={(e) => setWebsite(e.target.value)} style={input} />
        </label>
      </div>

      <label style={{ ...field, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
        Stranica je objavljena (javno vidljiva)
      </label>

      <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
        <button onClick={() => void save()} disabled={busy || slug.length < 3} style={primaryBtn}>
          {busy ? 'Spremam…' : 'Spremi'}
        </button>
        {note && <span>{note}</span>}
      </div>

      <p style={{ color: '#777', fontSize: 13, marginTop: 20 }}>
        Na stranici se prikazuju vozila sa statusom <strong>Spremno</strong> — status mijenjas na
        detalju vozila u Kokpitu.
      </p>
    </main>
  );
}

const field: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 14,
  marginBottom: 12,
};
const input: React.CSSProperties = { padding: 10, fontSize: 15, border: '1px solid #ccc', borderRadius: 6 };
const primaryBtn: React.CSSProperties = {
  padding: '10px 22px',
  fontSize: 15,
  fontWeight: 700,
  background: '#1EDCE8',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
};
