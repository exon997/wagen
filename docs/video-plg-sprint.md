# Sprint: Video PLG + Dossier za privatne prodavače

Projekt: wagen (Turborepo — Next.js, Expo/React Native, Supabase, Meilisearch)
Repo: github.com/exon997/wagen
Referenca: wagen-hr-projektni-zadatak.md (sekcije o Listing modelu, Izlog PDF, push/SMS)

## 1. Cilj

Svaki objavljeni oglas privatnog prodavača automatski dobiva 9:16 video (TikTok/Reels/Shorts) i PDF dossier. Oba artefakta nose wagen.hr brand i vode natrag u app preko mjerljivih linkova. Video se generira bez ikakvog rada prodavača (0 tapova za render, 1 tap za share).

Ključne odluke (ne otvarati ponovno):
- Render videa isključivo na serveru. Nikad on-device.
- Template = konfiguracija + React komponenta na serveru. Novi template ne smije zahtijevati update aplikacije.
- Video bez glazbe. Zvuk dodaje prodavač u TikToku/Reelsu.
- Cijena je opcionalna u videu (template odlučuje). CTA uvijek vodi na oglas u app-u.
- Sve mjerimo: klik na link, instalacija, otvaranje oglasa iz linka — po videu i po templateu.

## 2. Van scopea (v1)

- AI generiranje slika/videa
- Automatska objava na TikTok/Instagram preko API-ja (koristi se sistemski share sheet)
- Dohvat pregleda s TikToka (mjerimo samo linkove)
- Nagrade za viralne videe (boost) — pripremiti flag, ne implementirati
- Video za dilerske oglase (pipeline mora biti agnostičan, ali UI/nudge samo za privatne)

## 3. Arhitektura

```
[Expo app] --publish listing--> [Supabase]
                                    |  trigger: enqueue render job (default template)
                                    v
                             [render_jobs tabela]
                                    |  polling
                                    v
                        [apps/render-worker (Node)]
                        Remotion render (Chromium) -> mp4
                        ffmpeg post-process (H.264, faststart, <= 10 MB)
                                    |
                                    v
                      [Supabase Storage: bucket "videos"]
                                    |
                      listing_videos.status = ready -> push "Tvoj video je spreman"
                                    |
                                    v
                    [Expo: VideoScreen] preview, promjena templatea, Share
                                    |
                                    v
                 [wagen.hr/v/{code}] short link -> deep link / store + deferred deep link
```

### 3.1 Render worker (`apps/render-worker`)

- Node 22, Remotion (`@remotion/renderer`, `@remotion/bundler`), ffmpeg statički.
- Remotion licenca: besplatna za tvrtke ≤ 3 osobe (Wagen d.o.o. — OK). Zabilježiti u README; alternativa ako se to promijeni: čisti ffmpeg `zoompan` + `drawtext`.
- Deploy: jedan container (Railway/Fly/Hetzner VPS), Dockerfile s Chromium ovisnostima. Concurrency 1–2 po instanci.
- Polling `render_jobs` svakih 2 s, `FOR UPDATE SKIP LOCKED`. Retry 3×, exponential backoff. Timeout 120 s.
- Ulaz: `listing_id`, `template_slug`, `template_version`. Worker sam dohvaća listing + fotke (signed URLs) + spec iz Vehicle (VIN podaci).
- Izlaz: 1080×1920, 30 fps, H.264 high, AAC tišina (neki playeri traže audio track), `-movflags +faststart`, ciljano 15–25 s, ≤ 10 MB (Instagram limit). Thumbnail JPG (prvi kadar).
- Fotke: koristiti već obrađene wagen fotke (s pozadinom). Ken Burns: skala 1.0→1.12 ili pan, po sceni.
- Deterministički: isti input + template version = isti video (za cache).

### 3.2 Template sustav (`packages/video-templates`)

Struktura:
```
packages/video-templates/
  src/
    registry.ts            // slug -> komponenta + default config
    templates/
      price-guess/         // "Koliko bi dao?"
      before-after/        // sirova -> obrađena
      story/               // "Auto s pričom"
    components/            // Hook, PhotoScene, SpecOverlay, EndCard, Watermark
    schema.ts              // zod schema za TemplateConfig
```

`TemplateConfig` (jsonb u bazi, zod validiran):
```ts
{
  slug: string; version: number;
  durationSec: number;                    // ukupno
  hook: { type: "hero"|"text"; text?: string; durationSec: number };
  scenes: Array<{ photoIndex: number|"auto"; durationSec: number; motion: "zoomIn"|"zoomOut"|"panL"|"panR"; overlay?: "spec"|"none" }>;
  price: { show: "always"|"reveal"|"never"; revealAtSec?: number };
  endCard: { headline: string; cta: string; showQr: boolean };
  captionTemplate: string;                // za clipboard, s {make} {model} {year} {link}
  hashtags: string[];
  locale: "hr" | "sl" | "en";             // sada samo hr; ostalo pripremljeno
}
```

Pravila za sve templatee:
- Prve 2 s = hook (najbolji kadar ili tekst). Bez intro logotipa.
- Watermark wagen.hr diskretno cijelo vrijeme (kut, ~4 % širine).
- End card zadnje 2,5 s: headline + kratki link krupno (`wagen.hr/v/K7M2Q`) + "ili potraži wagen u App Storeu / Play Storeu". Bez QR-a — na mobitelu se ne može skenirati sa istog ekrana; `showQr` je `false` za sve video templatee.
- Tekst u "safe zoni": donjih 20 % i desnih 12 % ekrana prazni (TikTok UI).
- Font iz design sustava aplikacije; brojevi (cijena, km) krupno.

Početna tri templatea:

1. `price-guess` — "Koliko bi dao za ovaj auto?" Hook: hero fotka + tekst pitanja. 5 scena s overlay spec (godina, km, motor, oprema highlight). Dvije varijante koje se mjere jedna protiv druge: `price-guess-reveal` (cijena u zadnjoj sekundi) i `price-guess-hidden` (end card "Cijena u aplikaciji").
2. `before-after` — Hook: sirova fotka (original s kamere, prije obrade) → wipe u obrađenu. 3 para. End card: "Ovako izgledaju oglasi na wagen.hr".
   - Preduvjet: pipeline mora čuvati originalnu fotku uz obrađenu (provjeriti, dodati ako ne čuva).
3. `story` — Hook: tekst prodavača. Pri objavi oglasa jedno opcionalno pitanje ("Zašto ga prodaješ?" / "Što ti je najdraže na njemu?", max 90 znakova) → `listing.story_text`. Ako prazno, template nije dostupan.

Verzioniranje: promjena templatea = nova `version`; stari videi ostaju, novi renderi koriste najnoviju aktivnu. Admin može aktivirati/deaktivirati template i postaviti default.

### 3.3 Baza (Supabase, migracija)

```sql
video_templates (
  id uuid pk, slug text, version int, config jsonb, active bool default true,
  is_default bool default false, created_at timestamptz,
  unique (slug, version)
);

render_jobs (
  id uuid pk, listing_id uuid fk, template_slug text, template_version int,
  status text check in ('queued','running','done','failed'),
  attempts int default 0, error text, locked_at timestamptz,
  created_at timestamptz, updated_at timestamptz
);

listing_videos (
  id uuid pk, listing_id uuid fk, template_slug text, template_version int,
  storage_path text, thumb_path text, duration_sec numeric, size_bytes int,
  render_ms int, status text check in ('ready','failed'),
  created_at timestamptz,
  unique (listing_id, template_slug, template_version)
);

short_links (
  code text pk,                 -- 5 znakova, base62 bez 0/O/1/l/I (tipka se ručno s videa)
  listing_id uuid fk, video_id uuid null fk,
  source text,                  -- 'video' | 'pdf' | 'manual'
  created_at timestamptz
);

link_events (
  id bigserial pk, code text fk, event text check in ('click','install','open'),
  platform text, ua_hash text, ip_hash text, created_at timestamptz
);

share_events (
  id bigserial pk, video_id uuid fk, channel text, created_at timestamptz
  -- channel iz share sheeta ako dostupan, inače 'unknown'
);

alter table listings add column story_text text;
```

RLS: prodavač čita svoje `listing_videos`, `short_links` i agregate iz view-a `listing_link_stats`. Worker koristi service role. `video_templates` javno čitljiv (samo active).

Trigger: `after insert/update on listings` kad `status = 'published' and seller_type = 'private'` → insert `render_jobs` s default templateom. Na promjenu fotki re-render s debounce 10 min.

### 3.4 Short link + atribucija (`apps/web`, route `/v/[code]`)

- Domena: `wagen.hr/v/{code}`. Kratko za caption i čitljivo na end cardu.
- Handler: zabilježi `click` (platform iz UA, ip_hash, ua_hash) → redirect:
  - app instaliran (Universal Link / Android App Link) → otvara oglas direktno, zabilježi `open`.
  - nije instaliran → App Store / Play uz deferred deep link.
- Deferred deep link: Branch (free tier) ili AppsFlyer. Firebase Dynamic Links je ugašen (2025) — ne koristiti. Ako Branch, `code` ide u `$deeplink_path`.
- Prvo otvaranje app-a nakon instalacije: pročitati deferred podatke → zabilježi `install` s `code` → otvori oglas.
- Fallback web: `/o/{listing-slug}?src={code}` prikazuje oglas na webu s bannerom "Otvori u aplikaciji".
- Privatnost: nema pohrane sirovog IP-a ni UA; samo hashevi sa saltom; retencija 90 dana.

### 3.5 Expo app

- `VideoScreen` (`/listing/[id]/video`):
  - Player s preview (expo-video), gumbi: **Podijeli**, **Promijeni stil** (horizontalni picker templatea s thumbnailom; odabir → enqueue job, skeleton dok se renderira), **Spremi u galeriju**.
  - Share: `expo-sharing` s mp4 (spremi u cache → share). Prije share-a: caption + hashtagi + link kopirani u clipboard, toast "Opis i link su kopirani — zalijepi ih u objavu". Zabilježi `share_events`.
  - Statistika: "Posjeta s linka: N · Instalacija: M" (iz `listing_link_stats`).
- Nudge tok:
  1. Odmah nakon objave: ekran "Oglas je objavljen" s karticom "Radimo tvoj video (≈30 s)".
  2. Push kad je ready: "Tvoj video za {make} {model} je spreman. Podijeli ga na TikToku i prodaj brže." → deep link na VideoScreen.
  3. Ako nema share-a u 24 h: jedan podsjetnik push. Ne više od toga.
  4. U "Moji oglasi": badge "Video spreman" dok se ne podijeli.
- Objava oglasa: opcionalno polje `story_text` (jedno pitanje, random iz 3, skip dopušten).
- Feature flag `video_reward_boost` (off) — placeholder za buduću nagradu.

### 3.6 PDF dossier za privatne

- Reuse dilerskog Izlog PDF generatora; varijanta `private`:
  - Naslovnica: hero fotka, make/model/godina, cijena, wagen.hr logo.
  - Spec iz VIN-a (Outvin), oprema, km, registracija do.
  - Fotke (grid, sve obrađene).
  - Sekcija "Certifikat baterije" ako postoji (BEV/PHEV).
  - Zadnja stranica: QR (za print/desktop) + tapabilan link `wagen.hr/v/{code}` (source `pdf`) s tekstom "Aktualna cijena, sve fotke i status oglasa". Link mora biti klikabilan u PDF-u jer se dossier najčešće otvara na mobitelu.
- Generira se na zahtjev (gumb "Pošalji dossier" → share sheet). Cache po `listing.updated_at`.
- Nikakvi osobni podaci prodavača osim onih koje je već javno stavio u oglas.

## 4. Zadaci (redoslijed)

1. Migracija baze + RLS + trigger za enqueue. Seed 3 templatea (config jsonb).
2. `packages/video-templates`: schema, registry, zajedničke komponente (Hook, PhotoScene, SpecOverlay, EndCard, Watermark), template `price-guess` (obje varijante).
3. `apps/render-worker`: polling, Remotion render, ffmpeg post-process, upload, statusi, retry, thumbnail. Dockerfile. Lokalni `pnpm render:dev --listing <id> --template <slug>` za brzi pregled bez baze.
4. Template `before-after` (+ provjera da pipeline čuva original) i `story` (+ `story_text` u objavi).
5. `/v/[code]` route, short link generator, `link_events`, Branch integracija, deferred deep link u app-u, `listing_link_stats` view.
6. Expo: VideoScreen, share flow, clipboard caption, push (ready + 24 h podsjetnik), badge u Moji oglasi.
7. PDF dossier `private` varijanta + QR/link.
8. Interni admin: lista templatea (aktiviraj/deaktiviraj/default), tablica performansi po templateu (renderi, shareovi, klikovi, instalacije, CTR, install rate) + dnevni ukupni broj instalacija iz App Store Connect / Play Console, jer dio instalacija dolazi kroz store search bez koda.

## 5. Kriteriji prihvaćanja

- Objava privatnog oglasa s ≥ 5 fotki → video `ready` unutar 60 s (p95) bez ikakve akcije korisnika.
- Video: 1080×1920, ≤ 10 MB, otvara se u TikTok i Instagram share sheetu, tekst čitljiv na telefonu, ništa bitno u TikTok safe zonama.
- Promjena templatea u app-u → novi video bez update-a aplikacije; novi template dodan samo u `packages/video-templates` + red u bazi radi na produkciji.
- Klik na `wagen.hr/v/{code}` s telefona bez app-a → store → nakon instalacije app otvara točno taj oglas; `link_events` sadrži click + install + open s istim `code`.
- Admin tablica pokazuje CTR i install rate po templateu.
- Dossier PDF s QR-om vodi na živi oglas; nakon promjene cijene stranica pokazuje novu cijenu.
- Neuspjeli render ne blokira objavu oglasa i ne šalje push.

## 6. Otvorene odluke (prije koraka 5)

- Branch vs AppsFlyer (cijena na volumenu 100k instalacija; provjeriti Branch free tier limit).
- Hosting workera: Railway (najbrže) vs Hetzner VPS (najjeftinije na 10k+ videa/mj).
- Re-render pri promjeni cijene: automatski (trošak) ili samo na zahtjev.
- Slovenska/engleska lokalizacija: `locale` je u configu, prijevodi kasnije.

## 7. Operativni proces (nije kod, ali dio sprinta)

- Svaki mjesec: 2–3 nova templatea prema aktualnim TikTok trendovima; ubiti template s install rateom ispod medijana dva mjeseca zaredom.
- Admin tablica iz koraka 8 je jedini izvor istine za odluke o templateima.
