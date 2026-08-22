# CLAUDE.md — wagen.hr

Ovaj dokument čita svaka Claude Code sesija u ovom repou. Cilj: svaka sesija
kreće s istim kontekstom i istim pravilima rada.

---

## 1. Izvor istine

**[`docs/projektni-zadatak.md`](docs/projektni-zadatak.md)** je izvor istine za cijeli projekt.

- **Sekcije 1–19** — odluke (stack, flowovi, data model, dizajn, monetizacija, SEO, sučelja).
- **Sekcija 20** — otvorena pitanja (TBD). Riješene stavke su prekrižene i označene `[x]`.
- **Sekcija 21** — redoslijed implementacije po sprintovima.

Dokument ostaje živ i **tijekom** implementacije: kad se TBD stavka riješi,
odluka se upisuje natrag u odgovarajuću sekciju i stavka se u sekciji 20
označava kao riješena.

**Prije početka rada na bilo kojem sprintu: pročitaj relevantne sekcije dokumenta.**
Ne oslanjaj se na sažetak u ovom fajlu — ovdje su pravila, tamo su odluke.

---

## 2. Trajna pravila rada

1. **Komunikacija je na hrvatskom.** Kod, imena varijabli, tehnički identifikatori
   i commit poruke — commit poruke na hrvatskom, kod na engleskom (standardna praksa),
   korisnički vidljivi tekstovi na hrvatskom.

2. **TBD stavke se nikad ne pretpostavljaju tiho.** Kad implementacija naleti na
   otvorenu stavku iz sekcije 20 (ili na bilo koju odluku koju dokument ne pokriva):
   **stani i pitaj.** Ne biraj "razumnu default vrijednost" i ne nastavljaj.
   Ako je posao djelomično moguć bez odgovora — napravi neblokirani dio, pa pitaj.

3. **Odluke iz dokumenta se ne mijenjaju bez izričitog odobrenja.** Ako je neka
   odluka tehnički problematična: reci to, obrazloži, predloži alternativu —
   ali **ne mijenjaj sam**. Odluke označene "ODLUČENO" i "zapisano da se ne
   reotvara" posebno se ne reotvaraju bez traženja.

4. **Mali, česti commitovi sa smislenim porukama na hrvatskom.** Jedan logičan
   korak = jedan commit. Ne skupljati promjene u velike commitove.

5. **Prije svakog većeg posla: prvo plan, pa odobrenje, pa kod.** Nikad ne kreni
   pisati produkcijski kod prije nego što je plan izričito odobren.

---

## 3. Tehnički stack (odlučeno, sekcija 1)

| Sloj                     | Tehnologija                                                         |
| ------------------------ | ------------------------------------------------------------------- |
| Web frontend             | Next.js (SSR + ISR za SEO-kritične stranice)                        |
| Mobilna aplikacija       | React Native + Expo (iOS/Android, jedan codebase)                   |
| Backend / auth / storage | Supabase (jedinstven identity layer za web i app)                   |
| Pretraga                 | Meilisearch + Claude API sloj za natural language upite             |
| VIN dekodiranje          | Outvin API (server-side cache) + lokalni ISO VIN (WMI) fallback     |
| DMS sync                 | background job, adapter pattern (AutoBrief = prvi adapter)          |
| Plaćanja                 | Stripe (Billing/Subscriptions za trgovce, one-time za boost)        |
| Fiskalizacija            | vlastiti `invoices` entitet + adapter za posrednika (posrednik TBD) |
| Jezik                    | TypeScript kroz cijeli stack                                        |

---

## 4. Arhitekturna načela koja se ne pregovaraju

Ovo su odluke iz dokumenta koje utječu na gotovo svaki zadatak — drži ih u glavi:

- **Vozilo ≠ Oglas** (15.1). `vehicles` (fizičko vozilo, ukotvljeno VIN-om) i
  `listings` (komercijalni događaj) su odvojeni entiteti. `vehicles.vin` je
  nullable s unique constraintom na ne-null vrijednosti (oldtimeri, ručni unos).
- **Field ownership fizičkim razdvajanjem** (12.2, 15.3). DMS sync piše isključivo
  u `listings`/`vehicles`; wagen obogaćivanje živi u `listing_enrichment` (1:1).
  Sync tu tablicu **fizički ne dira** — nema `locked_fields` flagova ni if-logike.
- **Cijena je append-only događaj** (15.4). `price_events` je istina,
  `listings.price_current` je denormalizacija radi brzine.
- **Extensible kategorije, hibrid** (15.2). Zajedničke kolone za univerzalno +
  `attributes` JSONB validiran protiv `category_attributes`. Nova kategorija =
  redci u definicijskoj tablici, nula migracija sheme.
- **RLS od prvog dana** (15.6), ne naknadno.
- **Postgres je izvor istine, Meilisearch je derivat** (15.6). Indeks se u svakom
  trenutku smije obrisati i rebuildati iz Postgresa; nikad obrnuto.
- **UUID svugdje**; SEO slugovi kao zaseban, stabilan stupac.
- **Adapter pattern za svaku vanjsku integraciju** — DMS (12), fiskalizacija (9.7),
  email (14.6). Kanonski model živi u wagenu, konkretan pružatelj je zamjenjiv.
- **Jedan Supabase projekt, `market` dimenzija** (15.2, 15.6). `market` (default `'HR'`)
  na `listings`, `dealers`, `plans`, `saved_searches` i u RLS politikama. **`vehicles` i
  `equipment_codes` nemaju `market`** — isto vozilo može biti oglašeno na oba tržišta
  (uvoz), a rječnik opreme i cjenovna baza su zajednička imovina. Okolina ≠ tržište:
  `wagen-dev` i `wagen-prod` su odvojeni projekti.
- **Background poslovi žive u zasebnom Node workeru** (15.6), ne u Edge Functions.
  Worker dijeli `packages/adapters` i `packages/domain` s webom — adapter se piše jednom.
- **Anonimna sesija je prvorazredno stanje** (4.3, 5.2). Identitet se traži tek u
  trenutku objave (SMS OTP). Foto-only korisnik nikad ne postaje registrirani korisnik.

---

## 5. Produktna pravila koja se lako slučajno prekrše

- **Format cijene: `€23.990,-`** — bold italic crna na cyan `#1EDCE8` pozadini.
  Nikad decimale, nigdje. Identičan format apsolutno svugdje: kartica, stranica
  oglasa, notifikacije, dashboard, PDF. (13.1)
- **Naslov oglasa je generiran iz strukturiranih podataka, ne slobodan tekst.**
  Red 1: `godina + marka + model + paket opreme`. Red 2: `motorizacija + mjenjač`. (13.1)
- **Cyan `#1EDCE8` se ne koristi kao boja teksta na bijeloj pozadini** (WCAG AA). (6.3)
- **Samo jedan highlight bedž po oglasu**, iz zatvorenog seta u 9.6.
  Bez logotipa trećih strana — vlastiti wagen dizajnerski sustav bedževa.
- **Oglas ima `user_id` ili `dealer_id`, nikad oba** — check constraint. (15.5)
- **Prodani oglas se ne briše i ne vraća 404** — ostaje živ, označen "Prodano". (17.3)
- **"Povrat PDV-a moguć" je svojstvo transakcije, ne prodavača** (`vat_deductible`). (13.1)
- **Web push se ne gradi u v1**; email pokriva web korisnike. (14.6)
- **Financiranje i pretraga po mjesečnoj rati su odbačeni** — ne predlagati. (13.6, 16.3)
- **Privatni prodavač ne uploada fotografije na webu** — web upravlja, app stvara.
  Trgovcima je web upload dopušten. Asimetrija je namjerna. (18.1, 18.2)

---

## 6. Redoslijed rada (sekcija 21)

| Sprint                         | Sadržaj                                                                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **1 — Temelj**                 | Supabase shema + RLS + auth; kanonski model + adapter sučelja; kostur `/admin`; Outvin + ISO VIN fallback; `equipment_codes` rječnik   |
| **2 — App: foto pipeline**     | VIN sken → vođeno fotografiranje → obrada; capability detection (iOS Vision / Android ML Kit); watermark; dva izlazna moda             |
| **3 — Faza 0 backend**         | draft/pending pipeline, deep linkovi iz FB grupa, attribution, metrike Faze 0. **Gate: app ide u FB grupe, web još ne postoji javno.** |
| **4 — Web: pretraga i oglasi** | Meilisearch, stranice oglasa/rezultata, Garaža, spremljene pretrage, notifikacije, SEO sloj, PDF servis                                |
| **5 — Trgovci i lansiranje**   | Dealer onboarding, Kokpit + Izlog, `/za-trgovce`, Stripe Billing, AutoBrief adapter. **Launch dan.**                                   |
| **Post-launch**                | Fiskalizacija, wagen indeks, 9:16 video, auto-badging, mobile.de adapter, Faza 2 kategorije                                            |

---

## 7. Struktura repoa

**Alat: pnpm workspaces + Turborepo.** `pnpm-workspace.yaml` nosi `nodeLinker: hoisted`
jer Metro loše prati simboličke linkove (Expova preporuka za monorepe).

> **Zamka: pnpm 11 ne čita postavke iz `.npmrc`.** `node-linker`,
> `strict-peer-dependencies` i slično moraju biti u `pnpm-workspace.yaml`, u
> camelCase obliku. U `.npmrc` tiho ne rade ništa — bez greške, bez upozorenja.
> Nakon svake izmjene provjeri: `pnpm config get node-linker` ne smije vratiti
> `undefined`. Isto vrijedi za `allowBuilds` (odobravanje postinstall skripti).

```
CLAUDE.md                 ← ova pravila
docs/projektni-zadatak.md ← IZVOR ISTINE, živ dokument
docs/odluke/              ← ADR-ovi za odluke donesene tijekom implementacije
apps/web/                 ← Next.js: javni web + /admin + Kokpit trgovca
apps/mobile/              ← Expo: VIN sken, foto pipeline, predaja oglasa
packages/domain/          ← kanonski model, tipovi, zod sheme, konstante — NULA runtime ovisnosti
packages/supabase/        ← klijenti (browser/server/expo) + generirani DB tipovi
packages/adapters/        ← sučelja + implementacije: DMS, fiskalizacija, email, VIN — cilja Node
packages/config/          ← dijeljeni tsconfig / eslint / prettier
supabase/migrations/      ← verzionirane SQL migracije
supabase/seed.sql         ← razvojni podaci
```

**Zašto tri paketa, a ne jedan `shared`** — isti princip fizičkog razdvajanja kao field
ownership (15.3): granica koju arhitektura garantira ne treba disciplinu da se održi.

- `domain` nema runtime ovisnosti → mobilni bundle ne vuče Stripe/fiskalizacijske SDK-ove.
- `supabase` sadrži generirane tipove koji se mijenjaju pri **svakoj** migraciji → da su
  u `domain`, svaka migracija bi invalidirala cache cijelog grafa ovisnosti.
- `adapters` ima runtime ovisnosti i cilja Node worker.

**`packages/ui` namjerno ne postoji u v1.** Next.js i React Native ne dijele komponente
bez React Native Web sloja koji donosi više problema nego koristi. Dijele se **design
tokeni** (u `domain`), ne komponente.

---

## 8. Rječnik projektnih pojmova

- **Faza 0** — razdoblje u kojem aplikacija živi samostalno kao besplatni foto
  alat u FB grupama, prije javnog lansiranja weba. (4.5)
- **Crosspost** — korisnik u foto modu prihvaća "Objavi i na wagen.hr".
  **Crosspost rate je ključna launch metrika.** (4.5)
- **Kokpit** — dealer dashboard. (18.1)
- **Izlog** — brandirani A4 PDF za vjetrobran (window sticker), s QR kodom. (18.1)
- **Ekspoze** — brandirani PDF oglasa za kupca; dvije varijante (prodavačeva s
  kontaktom, javna bez kontakta). Isti generator kao Izlog. (19.3)
- **Garaža** — spremljeni oglasi sa snapshotom cijene i praćenjem delte. (14.3)
- **Blitzkrieg** — GTM strategija: platforma s tisućama živih oglasa na dan 1
  (pending pool + dealer pre-commit inventar). (4.5)
- **AutoBrief** — DMS sustav, prvi integracijski partner. (12.1)
- **Outvin** — VIN dekodirajući API. (3.2)
- **Aviloo** — partner za certifikat stanja baterije (EV/PHEV). (13.5)
