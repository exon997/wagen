'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Dokumenti } from './dokumenti';
import { Mediji } from './mediji';

interface Vehicle {
  id: string;
  make: string;
  model: string;
  engine_label: string | null;
  model_year: number | null;
}

interface Listing {
  id: string;
  status: string;
  price_current: number | null;
  vat_deductible: boolean;
  first_registration_year: number | null;
  mileage_km: number | null;
  location_city: string | null;
  description: string | null;
  attributes: unknown;
}

interface Photo {
  id: string;
  storage_path: string;
  sort_order: number;
  url: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'U pripremi',
  active: 'Spremno',
  sold: 'Prodano',
};

/** Cijeli eurski iznosi, format €X.XXX,- svugdje identican (13.1). */
function formatPrice(price: number | null): string {
  if (price === null) return 'Na upit';
  return `€${price.toLocaleString('de-DE')},-`;
}

export function VoziloDetalj({
  sessionId,
  vin,
  vehicle,
  listing,
  priceHistory,
  equipment,
  photos: initialPhotos,
  dealerName,
  dealerPhone,
  dealerCity,
  pageUrl,
}: {
  sessionId: string;
  vin: string | null;
  vehicle: Vehicle;
  listing: Listing;
  priceHistory: { price: number; created_at: string }[];
  equipment: string[];
  photos: Photo[];
  dealerName: string;
  dealerPhone: string | null;
  dealerCity: string | null;
  pageUrl: string | null;
}) {
  const router = useRouter();
  const attrs = (listing.attributes ?? {}) as Record<string, unknown>;
  const [price, setPrice] = useState(listing.price_current?.toString() ?? '');
  const [mileage, setMileage] = useState(listing.mileage_km?.toString() ?? '');
  const [year, setYear] = useState(listing.first_registration_year?.toString() ?? '');
  const [city, setCity] = useState(listing.location_city ?? '');
  const [vat, setVat] = useState(listing.vat_deductible);
  const [condition, setCondition] = useState((attrs['condition'] as string) ?? 'bez-stete');
  // Naknadno ugradjena oprema (Dodatno 4): rucni unos, odvojeno od VIN opreme
  const [retrofit, setRetrofit] = useState<string[]>(
    Array.isArray(attrs['retrofit_equipment'])
      ? (attrs['retrofit_equipment'] as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
  );
  const [retrofitEntry, setRetrofitEntry] = useState('');
  const [description, setDescription] = useState(listing.description ?? '');
  const [status, setStatus] = useState(listing.status);
  const [photos, setPhotos] = useState(initialPhotos);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const supabase = createClient();

  const save = async () => {
    setBusy('save');
    setNote(null);
    try {
      const { error } = await supabase
        .from('listings')
        .update({
          mileage_km: mileage ? parseInt(mileage, 10) : null,
          first_registration_year: year ? parseInt(year, 10) : null,
          location_city: city || null,
          vat_deductible: vat,
          description: description || null,
          status: status as 'draft' | 'active' | 'sold',
          attributes: { ...attrs, condition, retrofit_equipment: retrofit },
          ...(status === 'sold' ? { sold_at: new Date().toISOString() } : {}),
        })
        .eq('id', listing.id);
      if (error) throw new Error(error.message);
      // Cijena je append-only dogadjaj (15.4) - update ide kroz price_events
      const newPrice = price ? parseInt(price, 10) : null;
      if (newPrice !== null && newPrice !== listing.price_current) {
        const { error: pe } = await supabase
          .from('price_events')
          .insert({ listing_id: listing.id, price: newPrice });
        if (pe) throw new Error(pe.message);
      }
      setNote('Spremljeno ✓');
      router.refresh();
    } catch (e) {
      setNote(`Greska: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const suggestDescription = async () => {
    setBusy('ai');
    setNote(null);
    try {
      const { data, error } = await supabase.functions.invoke('generate-description', {
        body: {
          make: vehicle.make,
          model: vehicle.model,
          engineLabel: vehicle.engine_label,
          firstRegistrationYear: year ? parseInt(year, 10) : vehicle.model_year,
          mileageKm: mileage ? parseInt(mileage, 10) : null,
          condition,
          vehicleId: vehicle.id,
        },
      });
      if (error) throw new Error(error.message);
      const text = (data as { description?: string } | null)?.description;
      if (text) setDescription(text);
      else throw new Error('prazan odgovor');
    } catch (e) {
      setNote(`AI opis nije uspio: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const persistOrder = async (next: Photo[]) => {
    setPhotos(next);
    await Promise.all(
      next.map((p, i) =>
        supabase.from('photo_session_photos').update({ sort_order: i }).eq('id', p.id),
      ),
    );
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= photos.length) return;
    const next = [...photos];
    [next[index], next[target]] = [next[target]!, next[index]!];
    void persistOrder(next);
  };

  const makeCover = (index: number) => {
    if (index === 0) return;
    const next = [photos[index]!, ...photos.filter((_, i) => i !== index)];
    void persistOrder(next);
  };

  const removePhoto = async (photo: Photo) => {
    if (!window.confirm('Obrisati ovu fotografiju?')) return;
    await supabase.from('photo_session_photos').delete().eq('id', photo.id);
    await supabase.storage.from('session-photos').remove([photo.storage_path]);
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
  };

  const uploadPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy('upload');
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('sesija istekla');
      const added: Photo[] = [];
      for (const file of Array.from(files)) {
        const photoId = crypto.randomUUID();
        const path = `${user.id}/${sessionId}/${photoId}.jpg`;
        const { error: up } = await supabase.storage
          .from('session-photos')
          .upload(path, file, { contentType: file.type || 'image/jpeg' });
        if (up) throw new Error(up.message);
        const { data: row, error: ins } = await supabase
          .from('photo_session_photos')
          .insert({ session_id: sessionId, storage_path: path, sort_order: photos.length + added.length })
          .select('id, storage_path, sort_order')
          .single();
        if (ins) throw new Error(ins.message);
        const { data: signed } = await supabase.storage
          .from('session-photos')
          .createSignedUrl(path, 3600);
        added.push({ ...row, url: signed?.signedUrl ?? null });
      }
      setPhotos((prev) => [...prev, ...added]);
      setNote(`${added.length} fotografija dodano ✓`);
    } catch (e) {
      setNote(`Upload nije uspio: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const downloadZip = async () => {
    setBusy('zip');
    setNote(null);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      let index = 1;
      for (const photo of photos) {
        if (!photo.url) continue;
        const blob = await (await fetch(photo.url)).blob();
        zip.file(`${String(index).padStart(2, '0')}.jpg`, blob);
        index += 1;
      }
      const content = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(content);
      a.download = `${vehicle.make}-${vehicle.model}${vin ? `-${vin.slice(-6)}` : ''}.zip`.replace(/\s+/g, '-');
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setNote(`ZIP nije uspio: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', fontFamily: 'system-ui', padding: 24 }}>
      <p>
        <Link href="/kokpit">← Kokpit</Link>
      </p>
      <h1 style={{ fontSize: 24 }}>
        {vehicle.make} {vehicle.model}
        {vehicle.engine_label ? ` ${vehicle.engine_label}` : ''}
        {vehicle.model_year ? ` · ${vehicle.model_year}.` : ''}
      </h1>
      <p style={{ fontFamily: 'monospace', color: '#555' }}>{vin ?? 'bez VIN-a'}</p>

      <section style={grid}>
        <label style={field}>
          Cijena (EUR, bez decimala)
          <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ''))} style={input} />
          <small style={{ color: '#555' }}>
            Trenutno: <strong>{formatPrice(listing.price_current)}</strong>
            {priceHistory.length > 1 &&
              ` · povijest: ${priceHistory.map((p) => formatPrice(p.price)).join(' ← ')}`}
          </small>
        </label>
        <label style={field}>
          Kilometraza
          <input value={mileage} onChange={(e) => setMileage(e.target.value.replace(/[^0-9]/g, ''))} style={input} />
        </label>
        <label style={field}>
          Godina prve registracije
          <input value={year} onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, ''))} style={input} />
        </label>
        <label style={field}>
          Grad
          <input value={city} onChange={(e) => setCity(e.target.value)} style={input} />
        </label>
        <label style={field}>
          Stanje
          <select value={condition} onChange={(e) => setCondition(e.target.value)} style={input}>
            <option value="bez-stete">Bez stete</option>
            <option value="popravljena-steta">Popravljena steta</option>
            <option value="osteceno">Osteceno</option>
          </select>
        </label>
        <label style={field}>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={input}>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ ...field, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={vat} onChange={(e) => setVat(e.target.checked)} />
          Povrat PDV-a moguc
        </label>
      </section>

      <section style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <strong>Opis</strong>
          <button onClick={() => void suggestDescription()} disabled={busy !== null} style={ghostBtn}>
            {busy === 'ai' ? 'Pisem…' : '✨ Predlozi mi'}
          </button>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={7}
          style={{ ...input, width: '100%', resize: 'vertical' }}
        />
      </section>

      {equipment.length > 0 && (
        <section style={{ marginTop: 16 }}>
          <strong>Oprema iz VIN-a ({equipment.length})</strong>
          <p style={{ lineHeight: 1.9 }}>
            {equipment.map((name) => (
              <span key={name} style={chip}>
                {name}
              </span>
            ))}
          </p>
        </section>
      )}

      <section style={{ marginTop: 16 }}>
        <strong>Naknadno ugrađena oprema ({retrofit.length})</strong>
        <p style={{ fontSize: 13, color: '#666', margin: '4px 0 8px' }}>
          Oprema ugrađena nakon kupnje (kuka, glazba, felge…) — prikazuje se odvojeno od tvorničke.
        </p>
        {retrofit.length > 0 && (
          <ul style={{ margin: '0 0 8px', paddingLeft: 20, lineHeight: 1.8 }}>
            {retrofit.map((item, i) => (
              <li key={`${item}-${i}`}>
                {item}{' '}
                <button
                  onClick={() => setRetrofit(retrofit.filter((_, j) => j !== i))}
                  style={tinyBtn}
                  title="Ukloni"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={retrofitEntry}
            onChange={(e) => setRetrofitEntry(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && retrofitEntry.trim()) {
                setRetrofit([...retrofit, retrofitEntry.trim()]);
                setRetrofitEntry('');
              }
            }}
            placeholder="npr. Kuka za prikolicu"
            style={{ ...input, flex: '0 1 320px' }}
          />
          <button
            onClick={() => {
              if (retrofitEntry.trim()) {
                setRetrofit([...retrofit, retrofitEntry.trim()]);
                setRetrofitEntry('');
              }
            }}
            style={ghostBtn}
          >
            + Dodaj
          </button>
        </div>
      </section>

      <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
        <button onClick={() => void save()} disabled={busy !== null} style={primaryBtn}>
          {busy === 'save' ? 'Spremam…' : 'Spremi'}
        </button>
        {note && <span>{note}</span>}
      </div>

      <section style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <strong>Fotografije ({photos.length})</strong>
          <span style={{ display: 'flex', gap: 12 }}>
            <label style={{ ...ghostBtn, cursor: 'pointer' }}>
              {busy === 'upload' ? 'Ucitavam…' : '+ Dodaj fotografije'}
              <input
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => void uploadPhotos(e.target.files)}
              />
            </label>
            <button onClick={() => void downloadZip()} disabled={busy !== null} style={ghostBtn}>
              {busy === 'zip' ? 'Pakiram…' : '⬇ Preuzmi sve (ZIP)'}
            </button>
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginTop: 12 }}>
          {photos.map((photo, i) => (
            <figure key={photo.id} style={{ margin: 0 }}>
              {photo.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- potpisani URL
                <img src={photo.url} alt="" style={{ width: '100%', height: 130, objectFit: 'cover', borderRadius: 8 }} />
              ) : (
                <div style={{ height: 130, background: '#eee', borderRadius: 8 }} />
              )}
              <figcaption style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 4, fontSize: 13 }}>
                {i === 0 ? (
                  <span title="Naslovna">★</span>
                ) : (
                  <button onClick={() => makeCover(i)} style={tinyBtn} title="Postavi kao naslovnu">☆</button>
                )}
                <button onClick={() => move(i, -1)} style={tinyBtn} disabled={i === 0}>←</button>
                <button onClick={() => move(i, 1)} style={tinyBtn} disabled={i === photos.length - 1}>→</button>
                <button onClick={() => void removePhoto(photo)} style={tinyBtn} title="Obrisi">🗑</button>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <Dokumenti
        photos={photos}
        title={`${year || vehicle.model_year ? `${year || vehicle.model_year} ` : ''}${vehicle.make} ${vehicle.model}`}
        subtitle={[
          vehicle.engine_label,
          condition === 'bez-stete'
            ? 'Bez stete'
            : condition === 'popravljena-steta'
              ? 'Popravljena steta'
              : 'Osteceno',
        ]
          .filter(Boolean)
          .join(' · ')}
        priceLabel={formatPrice(price ? parseInt(price, 10) : listing.price_current)}
        facts={[
          { label: 'Godina', value: year || String(vehicle.model_year ?? '—') },
          { label: 'Kilometraza', value: mileage ? `${parseInt(mileage, 10).toLocaleString('de-DE')} km` : '—' },
          { label: 'Povrat PDV-a', value: vat ? 'moguc' : 'ne' },
          { label: 'Grad', value: city || '—' },
        ]}
        equipment={[...equipment, ...retrofit.map((r) => `${r} (naknadno ugrađeno)`)]}
        description={description || null}
        dealerName={dealerName}
        dealerPhone={dealerPhone}
        dealerCity={dealerCity}
        pageUrl={pageUrl}
      />

      <Mediji
        photos={photos}
        title={`${year || vehicle.model_year ? `${year || vehicle.model_year} ` : ''}${vehicle.make} ${vehicle.model}`}
        priceLabel={formatPrice(price ? parseInt(price, 10) : listing.price_current)}
        dealerName={dealerName}
        pageUrl={pageUrl}
        caption={{
          make: vehicle.make,
          model: vehicle.model,
          engineLabel: vehicle.engine_label,
          year: year ? parseInt(year, 10) : vehicle.model_year,
          priceEur: price ? parseInt(price, 10) : listing.price_current,
          mileageKm: mileage ? parseInt(mileage, 10) : null,
          city: city || null,
          vehicleId: vehicle.id,
          retrofitEquipment: retrofit,
        }}
      />
    </main>
  );
}

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: 12,
  marginTop: 16,
};
const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 };
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
const ghostBtn: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: 13,
  background: 'none',
  border: '1px solid #ccc',
  borderRadius: 6,
  cursor: 'pointer',
};
const tinyBtn: React.CSSProperties = { border: 'none', background: 'none', cursor: 'pointer', fontSize: 14 };
const chip: React.CSSProperties = {
  display: 'inline-block',
  border: '1px solid #ddd',
  borderRadius: 12,
  padding: '2px 10px',
  marginRight: 6,
  fontSize: 13,
};
