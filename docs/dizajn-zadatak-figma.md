# Zadatak za dizajnera — wagen (Figma)

Datum: 2026-09-08 · Naručitelj: Hrvoje Repak (wagen.hr) · Referenca:
[`projektni-zadatak.md`](projektni-zadatak.md) (brojevi sekcija u zagradama)

## 1. Što se dizajnira

Šest površina, **dva odvojena vizualna identiteta**:

| # | Površina | Platforma | Identitet |
| - | -------- | --------- | --------- |
| 1 | wagen.hr oglasnik | Android app | oglasnik (cyan) |
| 2 | wagen.hr oglasnik | iOS app | oglasnik (cyan) |
| 3 | wagen.hr oglasnik | web (responzivna stranica) | oglasnik (cyan) |
| 4 | wagen.hr Kokpit (dealer dashboard) | web | oglasnik (cyan), radna varijanta |
| 5 | wagen AlphaOne (alat za trgovce) | Android app | AlphaOne (amber/svijetla) |
| 6 | wagen AlphaOne | iOS app | AlphaOne (amber/svijetla) |

**Web je stranica, ne app** — SEO je jedan od glavnih kanala rasta
(SSR/ISR, svaki oglas indeksabilan), pa oglasnik na webu mora biti
klasična responzivna stranica. Mobilne aplikacije su zasebne (React
Native — Android i iOS dijele jedan codebase, dakle **jedan dizajn po
aplikaciji** s platformskim detaljima, ne dva odvojena).

## 2. Identitet A — wagen.hr oglasnik

Cilj: autorski identitet, posjeta wagen.hr je doživljaj, ne "još jedan
oglasnik" (6.1). Ali: **ne smije usporiti UI flow ni konverziju**.

Zadano (ODLUČENO, ne mijenja se — dizajner gradi oko ovoga):

- **Paleta (6.3):** cyan `#1EDCE8` (akcent/CTA/hover), siva `#808080`,
  crna, bijela. Cyan se **ne koristi kao boja teksta na bijelom** (WCAG AA).
- **Cijena (13.1):** `€23.990,-` — bold italic crna na cyan pozadini,
  nikad decimale, identičan format apsolutno svugdje (kartica, oglas,
  notifikacija, PDF). Bez cijene: "Na upit" u istom stilu. Cyan
  cjenovna traka je **uvijek zadnji element kartice**.
- **Kartica oglasa (13.1):** fotografija 4:3 → dvoredni generirani
  naslov (red 1: godina + marka + model + paket; red 2: motorizacija +
  mjenjač) → jedan spec redak (km · gorivo · kW/KS · lokacija) → redak
  prodavača (samo tekst + verifikacijski bedž, **bez loga trgovca**) →
  cyan cijena. Highlight bedž: crna pločica, bijeli tekst, gore lijevo
  na fotografiji, **maksimalno jedan po oglasu** (9.6).
- **Tipografija (6.4):** display font za marketing naslove (kandidati:
  Neue Montreal, General Sans, Clash Display — dizajner bira/predlaže);
  UI font miran i čitljiv (radna pretpostavka Inter — dizajner potvrđuje).
- **Marketing vs. produkt (6.2):** homepage hero, landing stranice i
  kampanje nose punu vizualnu retoriku (satirička serija fotografija,
  6.5); pretraga, oglas i dashboard su čisti i brzi — identitet nose
  paleta, tipografija, mikrointerakcije i ton copyja.
- Prodani oglas ostaje vidljiv s oznakom "Prodano" (17.3).

## 3. Identitet B — wagen AlphaOne

Alat kojim trgovac snimi i objavi vozilo "od VIN-a do oglasa u par
minuta". **Vlastiti identitet, odvojen od oglasnika.** Postojeći radni
dizajn (u aplikaciji, prema mockupima naručitelja) definira smjer;
dizajner ga profinjuje i isporučuje konačne vrijednosti.

Radne vrijednosti (dizajner smije korigirati nijanse, ali pravila ostaju):

- Svijetla tema: pozadina `#ECECEC`, bijele kartice, tekst `#111`,
  prigušeni `#6F6F6F`, linije `#9A9A9A`.
- **Disciplina tri boje:** amber `#F9A51A` = akcije/CTA; zelena
  `#2FBF4F` = odabrano/uspjeh — **uvijek uz tekstualnu oznaku**
  ("Uključeno ✓") zbog daltonizma, boja nikad nije jedini signal;
  crvena `#E5382A` = isključivo okidač kamere.
- Font: **Exo 2** (bundlan u aplikaciji).
- Wordmark: "wagen" italic sivo + "AlphaOne".

## 4. Opseg ekrana po površini

### 4.1 wagen.hr oglasnik — mobilne aplikacije (Android + iOS, jedan dizajn)
- Onboarding + prijava (SMS OTP, potom biometrija/PIN — 5.2)
- Pretraga (uključivo natural language upit) + rezultati (kartice 13.1)
- Stranica oglasa (13.2, mobile-first) + galerija fotografija
- Garaža — spremljeni oglasi sa snapshotom i deltom cijene (14.3)
- Spremljene pretrage + notifikacije (14)
- **Predaja oglasa = "AlphaOne lite" flow** (4.5): VIN sken → vođeno
  fotografiranje → objava (SMS OTP tek pri objavi; anonimno do tada)
- Kontakt prodavača: "Nazovi" + upit-forma (bottom sheet s brzim
  pitanjima); **inbox (thread pregled) dizajnirati odmah, gradi se u v1.1**
- Isticanje oglasa: kupnja TOP boosta — jednokratni paketi, checkout se
  otvara u browseru (Stripe); samo dizajn, naplata ide post-launch
- Video ekran oglasa (dijeljenje 9:16 videa — 4.7 V2)
- Profil / postavke (5.4): minimalni profil (ime, verificirani telefon,
  opcionalni email — **bez adrese**); sekcije Moji oglasi · Obavijesti ·
  Plaćanja · Sigurnost (biometrija/PIN, odjava sa svih uređaja,
  **brisanje računa**) · Pravno · Podrška · Pozovi prijatelja (placeholder)

### 4.2 wagen.hr oglasnik — web
- Homepage (marketing hero + pretraga)
- Rezultati pretrage (SSR, filteri)
- Stranica oglasa (SEO-kritična)
- Javna stranica trgovca (18.1 — funkcionalna verzija već postoji)
- Garaža + spremljene pretrage (web)
- /za-trgovce (prodajna stranica za salone)
- Prijava (email + lozinka) + zaboravljena lozinka / reset — samo web
- 404 / "Prodano" stanja

### 4.3 Kokpit (web, dealer dashboard)
- Pregled zalihe (tablica s cijenom/statusom)
- Detalj vozila: podaci oglasa, fotografije, mediji (video/carousel/
  caption), dokumenti (Izlog, Ekspoze), naknadno ugrađena oprema
- Stranica salona (uređivanje javne stranice)
- Kasnije: naplata/pretplata (9) — samo predvidjeti u navigaciji

### 4.4 AlphaOne (Android + iOS, jedan dizajn)
Postojeći ekrani (redoslijed = flow): Početna · Vozila · Koraci sesije
(6 koraka) · VIN sken/unos · Priprema (pozadine, tablice) · Kamera
(landscape, vođeno 16 kadrova) · Pregled i obrada · Značajke i oprema
(+ naknadno ugrađena) · Objava · Salon/prijava · Postavke.
Postojeće screenshotove i mockupe naručitelj dostavlja kao polazište.

### 4.5 Bonus opseg (dogovoriti zasebno)
- Brandirani PDF-ovi: Izlog (A4 za vjetrobran) i Ekspoze/Dossier (19.3)
- Predlošci 9:16 videa i carousela (safe zone za TikTok UI — 4.7)
- Set highlight bedževa (9.6 — zatvoreni popis, vlastiti sustav, bez
  logotipa trećih strana)
- Store materijali (screenshotovi, feature grafike)

## 5. Isporuke (deliverables)

1. **Figma library po identitetu:** design tokeni (boje, tipografska
   skala, spacing, radiusi, sjene) — imenovani tako da se 1:1 mapiraju
   u kod (`packages/domain/src/tokens.ts`).
2. **Komponente:** kartica oglasa, cjenovna traka, bedž, gumbi, forme,
   navigacija, prekidači (AlphaOne: s tekstualnim stanjem), liste.
3. **Ekrani** iz sekcije 4 — mobile: 390×844 referentni okvir; web:
   desktop 1440 + mobile breakpoint.
4. **Ikone aplikacija** (wagen oglasnik + AlphaOne; adaptive icon za
   Android, iOS set) + favicon.
5. Prototip klik-flowa za dva kritična toka: pretraga→oglas→kontakt i
   predaja oglasa (AlphaOne lite).

## 6. Tehnička ograničenja

- Mobilno je **React Native/Expo**: komponente se moraju dati izvesti u
  RN primitive (bez teških blur/staklo efekata na listama); sistemski
  share sheet za dijeljenje.
- Web je **Next.js**, responzivan; SEO stranice su lagane i brze.
- WCAG AA kontrast na svim tekstovima; boja nikad jedini nositelj
  značenja (daltonizam — pravilo iz AlphaOne vrijedi svugdje).
- Fotografije oglasa su uvijek 4:3 (13.1) — layouti računaju s tim.

## 7. Prioriteti (prijedlog — potvrdit ćemo zajedno)

1. **Tokeni + identitet oglasnika** (blokira sve ostalo; kartica oglasa
   i cjenovna traka prve)
2. **wagen.hr web oglasnik** (u razvoju je upravo sada)
3. **wagen.hr mobilna aplikacija** (Android/iOS)
4. **AlphaOne dorada** (radni dizajn postoji i funkcionira — polish)
5. **Kokpit** (interni alat, funkcionalan; najniži prioritet)

## 8. Otvorena pitanja za dizajnera

- Prijedlog display fonta (6.4) + potvrda UI fonta.
- Konačne AlphaOne nijanse (amber/zelena/crvena) uz zadržanu disciplinu.
- Satirička foto serija (6.5): art direction i procjena produkcije —
  zasebna faza, nije uvjet za UI isporuke.

Napomena (ODLUČENO 2026-09-08): **tamne teme nema u v1** — sve površine
su svijetle; tokeni se strukturiraju tako da se tema kasnije može dodati.
