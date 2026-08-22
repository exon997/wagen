# wagen.hr — Projektni zadatak (radni draft)

> Status: SPREMNO ZA IMPLEMENTACIJU (Claude Code). Sekcije 1–20 su izvor istine; redoslijed rada u sekciji 21. Otvorena pitanja (sekcija 20) eksplicitno su označena i ne smiju se tiho pretpostaviti tijekom implementacije — rješavaju se u hodu i upisuju natrag u dokument.

---

## 1. Pregled projekta

wagen.hr je marketplace za rabljena i nova vozila, s naglaskom na dvije stvari koje ga razlikuju od postojeće konkurencije (Njuškalo, mobile.de, avto.net):

1. **Mobilna aplikacija kao primarni kanal predaje oglasa** za privatne prodavače — VIN sken, automatsko popunjavanje podataka, vođeno fotografiranje.
2. **Snažan, autorski vizualni identitet** koji homepage i marketing površine tretira kao brand-doživljaj, ne kao "još jedan oglasnik".

Ekosustav uključuje: wagen.hr (web), wagen mobilna app (iOS/Android — **dvojna uloga:** samostalni besplatni foto alat kao GTM spearhead u Fazi 0 i kanal predaje oglasa, vidi sekciju 4), autoiskustva.hr (SEO content funnel), AutoBrief (DMS integracija za trgovce). (Bavberg je zaseban, nepovezan projekt — dokumentarni filmovi na engleskom, bez veze s wagenom.)

### Tehnički stack (odlučeno)
- **Frontend web:** Next.js (SSR + ISR za SEO-kritične stranice)
- **Backend/auth/storage:** Supabase — jedinstven identity layer za web i app
- **Search:** Meilisearch, s Claude API slojem za natural language upite
- **VIN decoding:** Outvin API (server-side cache), plus lokalno ISO VIN parsiranje (WMI prefiks) kao fallback za nepodržane marke i grubu validaciju
- **DMS sync (trgovci):** background job, adapter pattern za izolaciju AutoBrief integracije
- **Mobilna aplikacija:** React Native + Expo — jedan codebase za iOS/Android, isti TypeScript/Supabase ekosustav kao web (Claude Code radi u jednom jeziku preko cijelog stacka); kamera/Vision/ML Kit kroz nativne module i Expo dev buildove
- **Development tool:** Claude Code (Claude Max plan), model Fable 5

---

## 2. Korisnički tipovi

| Tip | Opis | Primarni kanal predaje oglasa |
|---|---|---|
| Privatni prodavač | 1–2 vozila | Mobilna app (VIN sken → foto → objava) |
| Trgovac (dealer) | Veliki inventar, i preko 300 vozila | App za VIN/foto prikupljanje, web desktop za dovršavanje i upravljanje oglasima; opcionalno AutoBrief DMS sync |

---

## 3. Flow: Predaja oglasa

### 3.1 Ulazna točka — "Predaj oglas"

Ne postoji jedinstven put za sve korisnike — sustav grana po tipu korisnika **prije** nego što ga vodi dalje:

- **Anonimni/novi posjetitelj** klikne "Predaj oglas" na wagen.hr → default pretpostavka je privatni prodavač → redirect na landing stranicu za download iOS/Android app.
  - Na istoj stranici: jasno vidljiv sekundarni link **"Trgovac sam / imam trgovački račun"** → vodi na web login/registraciju za trgovce.
- **Ulogirani trgovac** na web sučelju ne vidi CTA za app download — "Dodaj vozilo" ide direktno u web dashboard, s app-om ponuđenim kao dodatna opcija ("skeniraj VIN u aplikaciji"), ne kao primarni put.

### 3.2 Proces u aplikaciji (privatni korisnik)

1. **Anonimna sesija** — korisnik može krenuti bez prijave (VIN sken, foto). Identitet se traži tek kod finalne objave (SMS OTP).
2. **VIN sken** (kamera / ručni unos VIN broja)
3. **Automatsko prepoznavanje vozila:**
   - App poziva Outvin API.
   - Podržane marke: Mercedes-Benz, BMW, Mini, Lexus, Toyota, Volvo, Opel, Audi, Volkswagen, Škoda, Renault, Dacia, Lancia, Land Rover, Jaguar, Seat, Polestar, Peugeot, Nissan, Citroën, Kia, Hyundai, Mazda, DS, Ford, Chrysler, Dodge, Jeep, Fiat, Alfa Romeo, Smart, Chevrolet, GMC, Cadillac, Buick, Hummer, Tesla.
   - Ako marka nije podržana ili Outvin vrati prazan/error odgovor → **automatski, neprimjetno** prebacivanje na ručni unos (korisnik ne bira ovo sam, sustav detektira).
   - Fallback: lokalno ISO VIN parsiranje (WMI prefiks) za grubi proizvođač + godina proizvodnje, čak i kad Outvin ne pokriva marku.
   - Oldtimeri (nestandardni/kraći VIN format, tipično prije ~1981.) → izravno na ručni unos, bez pokušaja Outvin poziva.
4. **Dodatna polja** (uvijek ručni unos, bez obzira na VIN izvor):
   - Godina prve registracije
   - Kilometraža
   - Stanje vozila: novo / rabljeno / oštećeno / popravljena šteta
   - Broj vlasnika
   - Servisna knjiga: da / ne / djelomično
   - Korekcija goriva/mjenjača (ako Outvin pogrešno dekodira, npr. facelift modeli)
5. **Vođeno fotografiranje i uređivanje fotografija**
6. **Izlaz — ovisi o ulaznom modu (vidi 4.2):**
   - **Oglasni mod (default za direktne wagen korisnike):** slanje u wagen.hr — kreira se novi oglas, status **neaktivan/pending**. "Preuzmi fotografije" dostupno kao sekundarna opcija.
   - **Foto mod (default za korisnike iz FB grupa):** preuzimanje/dijeljenje fotografija; završni ekran nudi opcionalni crosspost "Objavi i na wagen.hr".
7. **Objava** — traži se telefon + SMS OTP verifikacija (ako korisnik još nije autentificiran) → oglas postaje aktivan (moderacija: trenutna objava + naknadna kontrola, vidi sekciju 8)

### 3.3 Proces za trgovce

- Podaci/VIN/foto prikupljanje: kroz app (isti VIN + foto modul kao privatni korisnici)
- Dovršavanje oglasa (opis, cijena, dodatna oprema, bulk usporedbe): **web desktop**
- Objava/aktivacija: web dashboard
- Alternativa za velike trgovce: DMS sync putem AutoBrief adaptera (bez ručnog unosa)

> App kod trgovaca = alat za prikupljanje sirovog materijala, ne cijeli lifecycle oglasa.

---

## 4. Mobilna aplikacija — identitet, pipeline i Faza 0 (GTM spearhead)

### 4.1 Pozicioniranje i identitet aplikacije

- **Jedna aplikacija, brand "wagen".** Nema odvojenog foto branda — dva branda bi udvostručila marketing napor i oslabila trenutak konverzije.
- Pozicioniranje: **"aplikacija za prodaju auta"**, ali u Facebook grupe se promovira isključivo kroz hero feature: *"besplatna aplikacija za profesionalne fotografije tvog auta"*. Wagen brand se ne skriva — foto-only korisnik mjesecima gleda wagen svaki put kad fotografira vozilo, pa na dan javnog lansiranja oglasnik nije nepoznanica nego "onaj moj alat za fotke, sad ima i oglasnik".
- Obrazac: **tool-to-marketplace** (alat daje trenutnu samostalnu vrijednost, marketplace se lansira u već zagrijan kanal). Prividna "dvoličnost" aplikacije (foto alat vs. alat za predaju oglasa) rješava se arhitekturom, ne izborom jednog identiteta — vidi 4.2.

### 4.2 Jedan pipeline, dva ulaza, dva izlaza

Oba tipa korisnika u aplikaciji rade identičan posao: **VIN sken → podaci o vozilu → vođeno fotografiranje → obrada fotografija.** Razlikuju se tek u izlazu. Zato: jedan pipeline, dvije ulazne točke koje određuju default izlaza.

**Ulazne točke (home screen + deep linkovi):**
- **"Fotografiraj vozilo"** — default za korisnike iz FB grupa; deep link iz grupe vodi direktno u foto mod (korisnik ne mora ni vidjeti oglasnički dio).
- **"Predaj oglas"** — default za direktne wagen.hr korisnike; CTA "Predaj oglas" na webu vodi u ovaj mod.

**Matrica izlaza:**

| Ulazni kontekst | Primarni izlaz | Sekundarni izlaz |
|---|---|---|
| Foto mod | Preuzmi / podijeli fotografije (Facebook, galerija) | Završni ekran: **"Objavi i na wagen.hr — oglas je već 90% gotov"** (jedan klik + SMS OTP) |
| Oglasni mod | Objava na wagen.hr (flow iz 3.2) | "Preuzmi fotografije" na ekranu potvrde — dozvoljeno, bez ograničenja |

- VIN sken **ostaje u free flowu u oba moda** — bez VIN-a nema strukturiranog draft oglasa za crosspost.
- Sučelje pipelinea je identično u oba moda; razlikuje se samo završni ekran.

### 4.3 Registracijska politika

- **Nema registracijske vratarnice.** Aplikacija se koristi bez prijave (anonimna Supabase sesija) — konzistentno s 3.2 i 5.2.
- Foto-only korisnik **nikad ne ulazi u wagen bazu kao registrirani korisnik** — anonimna sesija s lokalno spremljenim projektima. Nema "registrirao sam te na oglasnik koji nisi tražio".
- Identitet (SMS OTP) traži se **isključivo u trenutku objave na wagen.hr** — korisnik postaje wagen korisnik svojom odlukom, ne tehničkim defaultom.
- **Opcionalni račun za foto-only korisnike** kroz razmjenu vrijednosti: "Spremi projekte u oblak / pristupi s drugog uređaja." Ponuda, ne uvjet.

### 4.4 Foto obrada — capability tiering (iOS/Android)

- **iOS (17+):** subject lift kroz Vision framework — on-device, besplatno, visoka kvaliteta. Referentna implementacija.
- **Android (ODLUČENO): "radi na novijim uređajima" — poslovna odluka, ne tehnički kompromis.** Puni foto pipeline (izrezivanje/zamjena pozadine) zahtijeva uređaj sposoban za ML Kit subject segmentation; aplikacija pri startu radi **capability detection**:
  1. Uređaj podržava ML Kit segmentaciju → puni pipeline on-device (kao iOS)
  2. Stariji/nesposobni uređaj → graceful degradacija na zamućivanje pozadine (radi svugdje), uz jasnu poruku da puni set traži noviji uređaj
  3. **Server-side fallback se NE gradi u v1** — infrastruktura izrezana iz launch scopea. Obrazloženje: ciljna publika prodaje vozila vrijedna tisuće eura, a trgovcima je uređaj radni alat — ulazni Android srednje klase (~350 €) pokriva ML Kit zahtjeve.
- **Zamućivanje pozadine = default; zamjena predloškom = eksperimentalna opcija.** Razlog: auto je zrcalna površina — stara pozadina ostaje reflektirana u limu i staklima i nakon savršenog cutouta, pa zamjena često izgleda gore od originala.
- Detekcija i zamućivanje/brisanje registarske tablice: on-device.
- AR vođenje po kutevima: za MVP **statični poluprozirni overlay siluete** po kutu (90% efekta za 10% posla); pravi AR → v2.
- **Watermark "wagen.hr"** na obrađenim fotografijama: **uključen po defaultu, isključiv jednim tapom.** Fotke koje korisnici nose na FB/Njuškalo = besplatan brand placement, uključujući na konkurentskim platformama.

### 4.5 Faza 0 — samostalni život aplikacije prije javnog lansiranja weba

Redoslijed lansiranja se obrće u odnosu na klasični model: **aplikacija živi samostalno prije javnog weba**, a wagen.hr se lansira u već zagrijan kanal.

- Backend (Supabase) od prvog dana prima VIN podatke, fotografije i **draft oglase u pending statusu** — javni web još ne mora postojati.
- Korisnici koji prihvate crosspost pune **pool pending oglasa**. Na dan javnog lansiranja: aktivacija pending oglasa + Blitzkrieg dealer pre-commit inventar = **oglasnik s tisućama živih oglasa na dan 1**, ne prazna platforma.
- **Distribucija:** vlastite FB grupe (najveća 147k članova, ~10k objava/tjedno), aplikacija ponuđena pri predaji oglasa u grupi, deep link direktno u foto mod.
- **Nusprodukt — cjenovna baza:** svaki VIN sken + cijena iz FB oglasa gradi strukturiranu bazu hrvatskog tržišta rabljenih vozila prije nego što oglasnik postoji.
- **Facebook rizik (kanal koji ne kontroliramo):** mitigacija — od prvog dana graditi vlastiti kanal (telefonski brojevi iz OTP-a crosspost korisnika); FB grupe su lansirna rampa, ne trajna ovisnost.
- **Metrike Faze 0 (launch gate):**
  - Instalacije iz grupa (attribution po deep linku)
  - % korisnika koji dovrše foto flow
  - **Crosspost rate** — % foto korisnika koji prihvate "Objavi i na wagen.hr" — **ključna metrika koja odlučuje datum javnog lansiranja**
  - Broj pending oglasa u bazi

### 4.6 Faza 0 — aktivacijski plan u FB grupama (install friction)

"Instaliraj aplikaciju" je najskuplja radnja koju se od korisnika grupe može tražiti — friction se dizajnira, ne prepušta nadi. **Redoslijed je bitan: publika mora poželjeti alat prije nego što ga dobije.**
1. **Seeding (tjedni prije javne ponude):** Hrvoje osobno fotografira aute kroz app (ionako planirane dealer posjete s fotografiranjem) i objavljuje **before/after usporedbe** u grupama — telefon iz ruke vs. wagen app.
2. **Istaknuti status za app fotografije:** oglasi s wagen fotografijama dobivaju pinned/featured tretman u grupi (poluga vlasnika grupe).
3. **Watermark kao društveni dokaz:** kad prvih ~50 oglasa nosi wagen fotke, grupa sama postaje demo — "čime je ovo slikano?" je organski marketing.
4. Tek nakon seedinga: javna ponuda aplikacije pri predaji oglasa u grupi, deep link u foto mod (4.2).

---

## 5. Registracija i autentikacija

### 5.1 Metode prijave (privatni korisnici)
- Google
- Apple *(obavezno ako se nudi Google/Facebook — App Store Guideline 4.8 zahtijeva Apple Sign In kao paritet)*
- Facebook (opcionalno)
- Magic Link (email, bez lozinke)
- SMS OTP

> Odluka: **magic link zamjenjuje klasični email+lozinka**, ne postoji uz njega — manje trenja, nema "zaboravljena lozinka" supporta.

### 5.2 Auth arhitektura
- Supabase Auth kao jedinstveni identity layer za web + app (jedna users tablica, JWT)
- **Dual anchor za account linking:** email + telefon
- Kad se verificirani email/telefon s nove auth metode poklapa s postojećim računom → automatsko povezivanje identiteta (Supabase `linkIdentity`), umjesto duplog računa
- **Edge case — sudar identiteta:** ako sustav detektira potencijalni sudar (isti email/telefon, različit provider) → traži potvrdu kroz već poznati/verificirani kanal (npr. SMS na postojeći broj) prije spajanja računa, radi sprječavanja account takeover napada
- Anonimna sesija (VIN sken, foto) → upgrade na puni identitet tek kod SMS OTP verifikacije pri objavi oglasa
- **SMS provider: Twilio (ODLUČENO)** — OTP se šalje kroz Twilio (nativna Supabase podrška, postojeći račun). Lokalni razvoj i CI koriste `test_otp` fiksne kodove — nijedan stvarni SMS se ne šalje izvan produkcije.
- Magic link + app: potreban deep linking (iOS Universal Links, Android App Links) da klik na email link otvori app umjesto browsera — Supabase podržava, ali treba domain verification setup

### 5.3 Registracija trgovaca (B2B)
- Zaseban, "teži" put: web forma → unos podataka tvrtke → odabir paketa → **ručna aktivacija** od strane wagen tima (concierge onboarding)
- Nakon aktivacije: pristup dealer računu, koristan i u app i na webu

---

## 6. Dizajn i vizualni identitet

### 6.1 Princip
Snažan, autorski vizualni identitet — cilj je da posjeta wagen.hr bude doživljaj, ne "još jedan oglasnik". **Ne smije utjecati na UI flow / brzinu / konverziju**, ali gradi brand awareness.

### 6.2 Podjela teritorija (marketing vs. produkt)
- **Marketing površine** (homepage hero, kategorijske landing stranice, kampanje, autoiskustva.hr crossover, social) — puna vizualna retorika, satira, narativna fotografija visoke produkcijske vrijednosti.
- **Produkt površine** (search, filter, detalj oglasa, kontakt prodavača, dealer dashboard) — čist, brz, funkcionalan dizajn; identitet nosi paleta, tipografija, mikro-interakcije i ton copyja, ne ilustrativna fotografija.

### 6.3 Paleta boja
- `#1EDCE8` — akcent (cyan) — CTA gumbi, highlightovi, hover stanja, ikone. **Ne koristiti kao boju teksta na bijeloj pozadini** (nedovoljan WCAG AA kontrast).
- `#808080` — siva
- `#000000` — crna
- `#FFFFFF` — bijela

### 6.4 Tipografija
- **Display font** (rijetko, namjerno): homepage headlinei, kampanjski copy, istaknuti brojevi/statistike. Kandidati: bold grotesque tipa Neue Montreal, General Sans, Clash Display.
- **UI font** (funkcionalni tekst, forme, search rezultati): miran, vrlo čitljiv sans (npr. Inter).

### 6.5 Vizualna retorika / satirička fotografija
- Konzistentna, ponavljajuća serija po kategoriji vozila (npr. obiteljski SUV = kaos s koferima i djecom, suprug izbezumljeno promatra) — arhetip po kategoriji, ne nasumične slike.
- Definirati dosljedan vizualni tretman (color grade, kadar, tretman lica/akcije) da se "wagen fotka" prepoznaje i bez loga.
- Živi isključivo na marketing površinama, ne u produkt flowu.

---

## 7. Kategorije vozila

Referentni model: **avto.net**.

- **Faza 1 (launch):** isključivo osobna vozila — u skladu s "Blitzkrieg" GTM strategijom (fokusirana ponuda > razvodnjena ponuda po 8 kategorija).
- **Faza 2 (post-launch):** motocikli, kombiji, kamioni, prikolice, kamperi, karambolirana vozila, ostalo — po uzoru na avto.net.
- **Faza 3 (odvojeno, kasnije):** kotači/gume/felge i auto dijelovi. Ovo je strukturno drugačiji tip proizvoda, ne samo nova kategorija vozila — dio/guma je **zaliha** (quantity/stock), kompatibilna s više modela odjednom, bez jedinstvenog identifikatora poput VIN-a, s drugačijom search logikom ("pristaje li na moj auto" umjesto "ovo specifično vozilo"). Ne graditi u istoj fazi kao vozila kategorije — čeka zaseban data model (bliže ecommerce inventory nego classified listing).
- **Arhitekturna odluka (mora biti riješena od početka, čak i ako se UI ne gradi odmah):** shema kategorija vozila mora biti **extensible** — kategorija kao entitet s vlastitim setom atributa (motocikl nema broj vrata, prikolica nema motor, kamper ima layout kabine), ne hardkodirana "auto" tablica. Isti princip omogućuje kasnije dodavanje potpuno novog "listing type" (dijelovi/gume) bez rušenja temelja. Jeftino sad, skupo naknadno.
- **Struktura oglasnog dokumenta za Fazu 2 kategorije:** kad dođe vrijeme, pregledati kako avto.net strukturira Moto, Gospodarska vozila i Prosti čas rubrike kao polaznu točku, prilagoditi terminologiju za hrvatsko tržište. Ne rješavati unaprijed — nije launch-kritično.

---

## 8. Moderacija oglasa

- **Objava je trenutna** — oglas ide live odmah nakon SMS OTP verifikacije (ili odmah, ako je telefon već ranije verificiran). Nema pre-publish review koraka.
- **Naknadna kontrola, dvoslojno:**
  1. **Ručni pregled** — periodično se pregledavaju zadnje objavljeni oglasi.
  2. **AI model — Claude API.**
- **Referentni kriteriji za AI detekciju sumnjivih oglasa** (polazna lista, po uzoru na avto.net pravila):
  - Duplicirani oglasi iste sadržine (isto vozilo objavljeno više puta istovremeno)
  - Ponavljajuće re-objavljivanje istog oglasa (stari obrisan, identičan novi odmah postavljen)
  - Neprikladne ili tuđe fotografije (kopirane s drugog oglasa ili medija)
  - Oglas koji ne predstavlja jedno jasno određeno vozilo (opća reklama, više vozila u jednom oglasu)
  - Vozilo koje stvarno nije dostupno/na zalihi (fantomski oglas)
  - Cjenovni outlieri koji odudaraju od tržišne cijene za taj model/godište (mogući scam signal)
- **Frekvencija skeniranja — dvoslojni pristup:**
  1. **Trenutna provjera pri objavi** — jedan Claude API poziv odmah kod svake nove objave, analizira tekst + naslovnu fotografiju za očite prekršaje. Hvata najgore slučajeve odmah, bez čekanja na periodični sweep.
  2. **Periodični širi sweep** — nužno periodičan jer zahtijeva usporedbu s cijelom bazom (duplikati, re-objavljivanje), ne pojedinačni oglas. Preporuka za launch: **dnevno** (jednostavno za implementaciju, dovoljno često za očekivani volumen). Frekvencija treba biti konfigurabilna (env varijabla/admin postavka), ne hardkodirana — prelazak na češće skeniranje (npr. svakih 6h) kad volumen oglasa poraste, na temelju stvarnih podataka, ne unaprijed nagađanja.

---

## 9. Paketi i cjenik za trgovce

### 9.1 Princip
Tri jasno diferencirana paketa (Basic / Premium / Ultimate) — psihološki najefikasnija struktura za odluku o kupnji. Cijene prikazane **neto (bez PDV-a)**, PDV se dodaje na prikazanu cijenu — konzistentno s praksom na avto.net.

### 9.2 Referentni modeli (istraženo)
- **avto.net:** flat rate + à la carte dodaci. Bazna pretplata "Zaloga vozil" 59 €/mj neto do 100 vozila, +10 €/mj za svakih dodatnih 100. Dodatne opcije (TOP istaknuti oglas, HD foto, statistika, akcijska cijena, rich text editor) plaćaju se zasebno, tipično ~1 €/dan po opciji.
- **mobile.de:** Platinum/Gold/Silver paketi, cijena skalirana po volumenu oglašavanja ("price scale"), svaki paket nosi različitu besplatnu kvotu istaknutih oglasa (Top Ad, Page-1-Ad) i popuste na lead-generation naknade. Značajno veće tržište/doseg od wagen.hr — njihove apsolutne cijene nisu prenosive kao referenca, ali struktura (paket = kvota + vidljivost, ne samo broj oglasa) je korisna.

### 9.3 Prijedlog strukture za wagen.hr

| | Basic — 19 €/mj | Premium — 59 €/mj | Ultimate — 99 €/mj |
|---|---|---|---|
| Broj aktivnih vozila | do 10 | do 100 | preko 100 (doplata po dodatnih 100 — TBD iznos) |
| TOP istaknuti oglasi/mj | 0 | uključena kvota (TBD broj) | veća kvota + prioritet |
| Statistika/analitika | ne | da | da, napredna |
| Korisnički nalozi na web dashboardu | 1 | do 3 | neograničeno |
| AutoBrief DMS sync | ne | ne | da |
| Dealer bedž | Verified Dealer | Verified Dealer Plus | Top Dealer |
| Prioritet u search rangiranju | ne | blago | da |

### 9.4 Besplatno promotivno razdoblje
- Odluka: **sve trenutno besplatno**, ali paketi su od početka definirani (ne "kasnije ćemo smisliti cijene").
- Prijedlog mehanizma: besplatni period vezan uz **datum aktivacije trgovačkog računa**, ne uz fiksni kalendarski cutoff za sve (npr. "prvih 6 mjeseci besplatno od aktivacije" — slično AVTOSI praksi za rane prijave). Ovo se izravno naslanja na postojeću Blitzkrieg strategiju: trgovci koji se pre-commitaju prije javnog lansiranja dobivaju najduži besplatni period, kasniji dolasci kraći period — stvara urgentnost za rani onboarding.
- **Individualni dogovori:** Hrvoje osobno kontaktira odabrane trgovce i nudi 6–12 mjeseci besplatno — isti tehnički mehanizam kao opći promotivni period (Stripe trial), samo drugačiji broj dana po računu.
- TBD: točan broj mjeseci za opći promotivni period, i da li se period razlikuje po paketu.

### 9.5 Plaćanje i payment gateway

- **Gateway: Stripe** — potvrđena dostupnost i podrška za Hrvatsku (EUR kao valuta, konzistentno s postojećim cjenikom).
- **Model naplate:** kreditna/debitna kartica, automatska mjesečna naplata (Stripe Billing/Subscriptions) dok se pretplata ne otkaže.
- **Trial period:** koristi se Stripe-ova ugrađena `trial_period_days` funkcija — trgovac unosi karticu odmah pri registraciji (manje trenja kad free period istekne), naplata kreće tek nakon isteka triala. Isti mehanizam pokriva i opći promotivni period (9.4) i Hrvojeve individualne dogovore (6–12 mj.) — mijenja se samo broj dana.
- **3D Secure / SCA:** obavezno u EU (PSD2) — Stripe Checkout ovo rješava automatski.
- **Stripe Customer Portal:** gotovo, hostano sučelje za promjenu kartice, pregled faktura, samostalno otkazivanje pretplate — ne gradi se ručno.
- **Webhookovi za integraciju sa sustavom:**
  - `invoice.payment_failed` → nakon grace perioda automatski "zamrzava" vidljivost oglasa i dealer bedž
  - `customer.subscription.deleted` → downgrade na besplatni/neaktivni status
  - `customer.subscription.updated` → sync promjene paketa (npr. Basic → Premium) s dashboard prikazom
- **Stripe Tax:** razmotriti za automatski obračun PDV-a na temelju lokacije kupca, podržava "neto + PDV" prikaz cijena.
- **Plaćanje privatnih korisnika (isticanje oglasa, 9.6):** jednokratno plaćanje (Stripe Checkout one-time payment), ne subscription — jednostavniji flow, ne treba trial/webhook logiku za otkazivanje.

### 9.6 Isticanje oglasa — highlight bedž i plaćeni boost

**Highlight bedž (vizualna oznaka na kartici oglasa)**
- Odvojen mehanizam od TOP istaknutog oglasa: TOP = pozicija u rezultatima pretrage; highlight bedž = vizualna oznaka na samoj kartici.
- **Zatvoren set opcija (ODLUČENO)** — tri grupe:
  - **Grupa 1 — Sportska oprema** (jedan interni tip bedža `sport_paket`; prikazna etiketa ovisi o marki vozila): M Sport paket (BMW) · AMG Line (Mercedes-Benz) · S line (Audi) · R-Line (Volkswagen) · FR (Seat) · N Line (Hyundai) · GT Line (Kia/Peugeot/Renault) · ST-Line (Ford) · Sportline (Škoda) · GS Line (Opel) · R-Design (Volvo) · GR Sport (Toyota) · Veloce (Alfa Romeo). Pravi M / AMG / Cupra i sl. modeli ne dobivaju bedž — vide se iz naziva modela.
  - **Grupa 2 — Povijest vozila:** Prvi vlasnik · Kupljen u Hrvatskoj · Uvoz iz Njemačke · Uvoz iz Švicarske · Potpuna servisna povijest · Malo kilometara
  - **Grupa 3 — Oprema i dodaci:** Harman Kardon · Bang & Olufsen · Burmester (audio bedževi filtrirani po marki) · Nove gume · Zimski set kotača
- **Mehanika pickera — filtriranje po marki:** obična lookup tablica marka → etiketa (marka je poznata iz VIN dekodiranja ili ručnog odabira). Korisnik vidi samo opcije valjane za svoju marku; marke bez sportskog paketa na popisu ne prikazuju Grupu 1. Trivijalna v1 implementacija.
- **Namjerno isključeni tipovi** (da se odluka ne reotvara): subjektivne ocjene stanja ("Odlično stanje", "Kao nov", "Garažiran" — neprovjerivo, vodi u inflaciju bedževa); pogonska grupa (Automatik, 4x4, xDrive, Hibrid... — već strukturirani podatak na kartici i filter u pretrazi); "Uvoz iz SAD-a" (negativan signal na HR tržištu); "Drugi vlasnik" (nikad najjači adut).
- **Sustavna validacija dijela bedževa** (diferencijator vs. konkurencija — bedž kojem se vjeruje): "Prvi vlasnik" selektabilan samo ako broj vlasnika = 1; "Potpuna servisna povijest" samo ako servisna = da; "Malo kilometara" **automatski izračunat** (km ispod praga za godište — prag TBD, npr. <60 % prosjeka).
- **Vizual (ODLUČENO): vlastiti wagen dizajnerski sustav bedževa, BEZ logotipa trećih strana.** Jedna konzistentna forma (oblik, tipografija, cyan akcent), razlike samo tekstom uz eventualne suptilne tipografske aluzije ("M Sport" kosi bold, "S line" malim slovom, "AMG Line" široki rez). Obrazloženje, zapisano da se ne reotvara: ///M, S line, AMG i sl. su registrirani žigovi — tekstualno referiranje pri opisu vozila je dopušteno, ali preuzimanje službenih logotipa kao grafike sučelja komercijalne platforme implicira odobrenje proizvođača i nosi realan rizik cease & desist (BMW posebno agresivan oko ///M); ovlašteni koncesionari smiju jer imaju ugovor, wagen nema. Dodatno: 13 tuđih logotipa različitih stilova = vizualni kaos koji ruši autorski identitet iz sekcije 6, dok jedan dosljedan sustav gradi prepoznatljiv "wagen bedž".
- **v1.1 — auto-detekcija:** Outvin/DMS podaci o opremi (option kodovi) → sustav sam predlaže bedž ("ovo vozilo ima M Sport paket — dodati bedž?"), potvrda jednim klikom. Nije launch-kritično.
- **Samo jedan bedž po oglasu** — prisiljava prodavača da odabere najjači adut, kartica ostaje čista.
- Monetizacija: nije zaseban SKU. Kod trgovaca dio je Premium/Ultimate paketne kvote (uz TOP istaknute oglase); kod privatnih korisnika dio je paketa "Istakni oglas" (ispod).

**Plaćeni boost za privatne korisnike**
- Jedan paket koji uključuje **oboje**: TOP pozicija u pretrazi + mogućnost odabira highlight bedža, na 30 dana, 19 € (jednokratno plaćanje).
- Namjerno jedan jasan SKU umjesto dva odvojena mikro-plaćanja — jednostavnije za korisnika i za implementaciju.
- **Besplatni oglasi za privatne korisnike ostaju neograničeni** (za razliku od avto.net modela koji ograničava na ~10/mjesec) — monetizacijski fokus je na trgovcima, ne na privatnim korisnicima; plaćeni boost je čisto opcionalan.

### 9.7 Fiskalizacija (Fiskalizacija 2.0, na snazi od 1.1.2026.)

**Obveze koje se tiču wagena:**
- **B2B (pretplate trgovaca):** obvezni eRačun (strukturirani XML kroz pristupnu točku) + fiskalizacija eRačuna za tuzemne B2B transakcije obveznika PDV-a. Nijansa iz prakse: B2B plaćanje karticom je iznimka od eRačuna — izdaje se fiskalni račun. Trgovci plaćaju karticom kroz Stripe Billing → vjerojatno režim fiskaliziranog računa, ne eRačuna; **potvrditi s knjigovođom** (TBD).
- **B2C (boost 19 €, privatni korisnici):** fiskalizacija u krajnjoj potrošnji (online prijava računa kod izdavanja); eRačun se ne odnosi na B2C.

**Arhitektura (ODLUČENO — modelira se od početka, implementira kasnije):**
- Stripe je platni procesor, **ne izdavatelj računa** — porezna obveza izdavanja i fiskalizacije je wagenova.
- **Invoice servis u backendu na postojećim Stripe webhookovima (9.5):** `invoice.paid` / `checkout.session.completed` → generiranje računa (broj, stavke, PDV) → poziv fiskalizacijskog API-ja → JIR/potvrda se sprema uz račun → dostava kupcu.
- **Adapter pattern za fiskalizacijskog posrednika** (isti princip kao DMS, sekcija 12): kanonski model računa u wagenu, konkretan posrednik (Solo, e-računi, FINA, Moj-eRačun, ePoslovanje...) zamjenjiva implementacija. Shopify/WooCommerce pluginovi nisu relevantni — treba API servis.
- **Data model:** tablica `invoices` kao zaseban entitet (broj, stavke, PDV, JIR, status fiskalizacije, veza na Stripe objekt) — "Stripe invoice = račun" pretpostavka se eksplicitno odbacuje. Jeftino sad, bolno naknadno.

**Timing:** zbog besplatnog promotivnog razdoblja (9.4) prvi naplatni račun nastaje tek istekom prvih trialova ili prvim boostom — **implementacija prije isteka prvih trialova, ne prije launcha.** Operativno, izvan producta: wagen kao firma već od 1.1.2026. zaprima eRačune za ulazne račune — rješava se s knjigovođom (posrednik ili MIKROeRAČUN Porezne uprave), bez veze s kodom.

---

## 10. Dokumentacija vozila (uklj. CarVertical)

- **Odluka: CarVertical se NE integrira kao prisilan/plaćen dio flowa.** Razlog: osiguravateljske procjene štete koje CarVertical povlači često ne odražavaju stvarno stanje vozila (npr. sitni lakirani popravci na starijem BMW/Audiju u Njemačkoj prikazani kao >10.000 € štete) — odbija kupce bez stvarnog opravdanja, i trgovci ga ne vole.
- **Rješenje:** generičko polje **"Dokumentacija vozila"** na oglasu — prodavač (privatni ili trgovac) po želji uploada PDF dokumente: servisna knjiga, CarVertical izvještaj ako ga sam želi priložiti, računi za radove, atesti, bilo koja druga dokumentacija.
- Nema wagen-ovog brendiranja treće strane, nema monetizacijske ovisnosti o CarVertical partnerstvu.
- **Iznimka — Aviloo certifikat baterije (EV/PHEV):** jedini tip dokumenta s posebnim prepoznavanjem i strukturiranim prikazom (SoH blok na stranici oglasa, vidi 13.5). Razlika prema CarVerticalu: Aviloo je izmjereno stanje, ne papirnata povijest — konzistentno s filozofijom platforme. Operativa kroz partnerski servis uz wagen proviziju; provizijski dogovor formalizirati pisano.

---

## 11. Dealer verifikacijski bedževi

Dvoslojni sustav:

**Sloj 1 — Verified Dealer (baseline, svi aktivni trgovci)**
- Kriteriji: potvrđen OIB/obrtnica ili izvod iz sudskog registra (ručna provjera od strane concierge tima kod aktivacije), verificiran telefon i email, minimalno jedna osobna posjeta poslovnom prostoru s fotografiranjem (nadovezuje se na postojeći plan personal dealer visits).
- Dodjeljuje se automatski čim concierge tim ručno aktivira račun.

**Sloj 2 — Verified Dealer Plus / Top Dealer (vezano uz paket + track record)**
- Kriteriji: **broj vozila u ponudi + recenzije** (odluka), uz osnovne uvjete iz Sloja 1.
- **Recenzije — otvoreno pitanje riješeno na jednostavan način za v1:** kupnja se najčešće finalizira izvan platforme (test vožnja, plaćanje, primopredaja offline), pa ne postoji prirodan "potvrđen completed transaction" trenutak. Predlaže se **otvoreni model recenzija** — bilo koji korisnik koji je kontaktirao trgovca preko platforme (dokazivo kroz "kontaktiraj prodavača" log) može ostaviti recenziju, uz osnovnu anti-abuse zaštitu (jedna recenzija po korisniku po trgovcu, mogućnost prijave lažne recenzije). Nije "verified purchase" razina pouzdanosti, ali ne zahtijeva kompleksan potvrdni flow za launch.
- **Re-evaluira se periodično** (npr. mjesečno) — bedž nije trajan, može se izgubiti pri padu ispod praga.
- TBD: točni pragovi (min. broj vozila, min. prosjek ocjene/broj recenzija).

---

## 12. DMS ingest — arhitektura sinkronizacije za trgovce

### 12.1 Kontekst
- **AutoBrief** = prvi integracijski partner (pregovori u tijeku). U Hrvatskoj ga koristi manji broj, ali većih trgovaca (npr. TransAuto); AutoBrief se u pravilu prilagođava oglasnicima i trenutno je povezan s Njuškalom i Index oglasima. Ulazak u njihov sustav = automatski pristup zalihama velikih trgovaca.
- **AutoBrief je prvi adapter, ne API.** Ingest se gradi kroz postojeći adapter pattern (tehnički stack, sekcija 1) — vlastiti kanonski model oglasa, po jedan adapter po izvoru.

### 12.2 Field ownership (arhitektonska odluka — mora od prvog dana)
Oglas sinkroniziran iz DMS-a ima dva sloja polja:
- **DMS-owned:** cijena, kilometraža, status zalihe, osnovni podaci vozila — sync ih slobodno prepisuje pri svakom prolazu.
- **wagen-owned enrichment:** highlight bedž, TOP boost, redoslijed fotografija, dorađen opis — **sync ih nikad ne dira.**

Razlog: bez ovog razdvajanja svaki noćni sync pregazi sve što je trgovac ručno uredio na dashboardu — a Ultimate paket (jedini s DMS syncom) istovremeno uključuje najveću kvotu bedževa i TOP oglasa. Najskuplji kupac ne smije imati najgore iskustvo.

### 12.3 Auto-badging iz feed podataka
- DMS feed (i Outvin dekodiranje) nose podatke o tvorničkoj opremi (option kodovi) → sustav automatski detektira i dodjeljuje/predlaže bedž (M Sport paket, S line, Harman Kardon...) prema pravilima iz 9.6.
- Rezultat: trgovac na Ultimate paketu konzumira bedž kvotu **bez ijednog klika** — rješava problem "trgovci iz DMS sučelja ne mogu birati bedževe" i pretvara ga u feature koji Njuškalo i Index nemaju.
- Dashboard ostaje enrichment sloj: trgovac može ručno promijeniti bedž ili rasporediti TOP kvotu, sync mu to ne gazi (12.2).

### 12.4 mobile.de feed adapter (planiran, ne launch-kritičan)
- Njemački DMS sustavi masovno izvoze u mobile.de formatu feeda — a koristi ih i dio većih hrvatskih trgovaca s uvoznim programima.
- Adapter za taj format = kompatibilnost s cijelim njemačkim DMS ekosustavom **bez ijednog pregovora**. Jeftino zbog adapter patterna; graditi nakon AutoBrief adaptera.

---

## 13. Kartica oglasa i stranica oglasa

### 13.1 Kartica u rezultatima pretrage

**Anatomija kartice, odozgo prema dolje:**
1. Fotografija 4:3 — highlight bedž u gornjem lijevom kutu (crna pločica, bijeli tekst — namjerno **ne** cyan: bedž i cijena ne smiju konkurirati, cyan je rezerviran za cijenu); brojač fotografija dolje desno.
2. **Dvoredni naslov (ODLUČENO):**
   - Red 1 (veći font, weight 500): `godina prve registracije + marka + model + paket opreme` — npr. "2018 BMW X1 M Sport"
   - Red 2 (Inter regular): `motorizacija + mjenjač` — npr. "sDrive20i Automatik"
   - **Naslov je generiran iz strukturiranih podataka, ne slobodan tekst.** Prodavač ga ne tipka — sustav ga slaže iz VIN dekodiranja i polja. Svaka kartica identično formatirana; konzistentnost naslova kao brand-signal (nemoguće na oglasnicima gdje naslove pišu ljudi).
   - Godina prve registracije u naslovu = diferencijator: oko skenira listu vertikalno, godina na fiksnoj poziciji čita se brže od filtera.
3. Spec redak (jedan, ništa više): `km · gorivo · snaga kW (KS) · lokacija`
4. Redak prodavača (vidi brendiranje ispod)
5. **Cyan cjenovna traka — uvijek zadnji element kartice** (pri skrolanju liste cijene tvore vizualni ritam)

**Format cijene (ODLUČENO): `€23.990,-`**
- Bold italic crna na cyan pozadini (#1EDCE8 — crna na cyanu prolazi kontrast; pravilo iz 6.3 o cyan tekstu na bijelom ostaje netaknuto).
- **Nikad decimale, nigdje** — cijene se zaokružuju na euro pri unosu.
- **Identičan format apsolutno svugdje:** kartica, stranica oglasa, notifikacije, dashboard.
- Oglas bez cijene: "Na upit" u istom stilu, ne prazna traka.
- Napomena (zapisano da se ne reotvara): hrvatska konvencija je "23.990 €", ali ",-" format je nedvosmislen (bez centi), vizualno prepoznatljiv i germanski — što je na HR auto-tržištu signal kvalitete; cilj je razlikovanje.
- **PDV — svojstvo transakcije, ne prodavača (ODLUČENO, ispravlja raniju "samo dealer" logiku):** oglas ima strukturirano polje **"Povrat PDV-a moguć" (da/ne, default: ne)** — neovisno o tipu prodavača. Realnost tržišta: trgovac većinu rabljenih prodaje po posebnom postupku oporezivanja marže (bez iskazanog PDV-a), a istovremeno ima ex-leasing vozila s PDV-om; obrtnik "privatni prodavač" može prodavati službeno vozilo s PDV-om. Kod DMS feedova polje se mapira iz izvora.
- **Prikazana cijena je UVIJEK puna cijena.** Sekundarni redak na cyan traci "bez PDV-a: €X" (mala tamna tipografija) prikazuje se **isključivo kad je polje uključeno**, bez obzira tko prodaje.
- **Filter "Povrat PDV-a" u pretrazi** — prvi filter kupaca-tvrtki; nije bedž (set 9.6 ostaje zaključan), običan filter. UI naziv: "Povrat PDV-a moguć", tooltip: "PDV iskazan na računu (R1)".

**Brendiranje prodavača na kartici (ODLUČENO): kartica je 100 % wagen teritorij.**
- Trgovac prisutan **isključivo tekstom** + verifikacijski bedž ("Verified Dealer · TransAuto d.o.o."). Bez loga, boja ili okvira trgovca.
- Privatni prodavač: **"Privatni prodavač"** na istoj poziciji, bez avatara/ikone.
- Razlog: logotipi u rezultatima stvaraju preranu selekciju po krivom kriteriju (kupac preskače trgovce s lošim logom, ne s lošim autima — provjereno dugogodišnjim mobile.de iskustvom); vizualni kaos ruši autorski identitet iz sekcije 6.
- Logo trgovca kasnije može živjeti na **profilnoj stranici trgovca** (njegov teritorij) — ne u v1.

### 13.2 Stranica oglasa — struktura (mobile-first)

Galerija → naslovni blok (isti dvoredni format) → cyan cjenovna traka → **grid ključnih podataka** (8 polja: prva registracija, km, gorivo, snaga, mjenjač, pogon, boja, broj vlasnika) → oprema (13.4) → opis prodavača → dokumentacija vozila (sekcija 10, uklj. Aviloo za EV/PHEV — 13.5) → kartica prodavača (naziv, bedž, ocjena, broj vozila, "sva vozila prodavača", lokacija; bez loga u v1) → slična vozila.

- **Mobile: sticky donja traka** s cijenom (cyan) + CTA "Kontaktiraj prodavača" — cyan prati korisnika cijelim skrolom (brand-navika pretvorena u UI mehaniku).
- Desktop: dvostupčano — galerija lijevo, sticky sidebar (cijena/CTA/prodavač) desno.

### 13.3 Galerija

- **Swipe s momentumom, slika vezana za prst** (prati gestu, ne mijenja se nakon nje — bez fade in/out, bez "pojavljivanja").
- **Preload susjednih slika (n−1, n+1)** — sljedeća slika postoji u memoriji prije nego što je korisnik dovuče.
- Progressive loading (LQIP blur-up: mutna mikro-verzija odmah, puna rezolucija sjeda u nju — nikad prazan kvadrat); CDN s responsive veličinama, WebP/AVIF.
- Lightbox (tap na sliku): pinch-to-zoom, **double-tap zumira u točku dodira** (ne u centar), swipe-down zatvara.
- **Sekcijska navigacija (Eksterijer · Interijer · Detalji) — diferencijator:** fotografije dolaze iz vođenog fotografiranja (sekcija 4), pa sustav zna kategoriju svake slike → garantirano konzistentan redoslijed na svakom oglasu; kupac uči strukturu galerije nesvjesno. Nijedan oglasnik to nema jer nijedan ne kontrolira nastanak fotografija.
- **Fotografije iz DMS feedova i web uploada trgovaca:** često nose okvire/watermarke/telefone trgovca i nemaju kategoriju kuta — **galerija ima fallback bez sekcijske navigacije** kad kategorije nema. Zabrana nerealna; politika: preporuka čistih fotografija u uvjetima korištenja + tržišni poticaj (app fotografije izgledaju bolje). Detalji — TBD.

### 13.4 Oprema — dvoslojni prikaz

Dvije publike, dva sloja — potpunost bez žrtvovanja čitljivosti:
- **Sloj 1 — Istaknuta oprema (svi kupci):** 8–12 stavki kao vizualni chipovi, na hrvatskom, odabrani (ručno ili automatski) iz pune liste. Vidljivo bez klika.
- **Sloj 2 — Kompletna tvornička oprema (znalci):** sklopivo "Prikaži svu opremu (N)". Puna lista iz VIN dekodiranja; **toggle "Kodovi opreme"** prikazuje kod u monospaceu uz stavku (`S402A · Panorama glass roof`). Default isključen, preferenca se pamti po korisniku.
- **Rječnik prijevoda kodova opreme (ODLUČENO — gradi se sam):** broj option kodova je konačan → ne prevode se oglasi, nego **rječnik kodova, jednom zauvijek**. Ingest naiđe na nepoznat kod → jedan Claude API poziv prevede naziv → prijevod se trajno sprema uz kod. Rječnik se puni iz stvarnog prometa; admin review queue za nove prijevode (tehnički nazivi). Engleski original ostaje dostupan uz kod u Sloju 2.

### 13.5 EV/PHEV — blok "Baterija" (Aviloo partnerstvo)

- Blok se prikazuje **samo za EV/PHEV** (pogonski tip poznat iz VIN dekodiranja).
- **S Aviloo certifikatom:** istaknut SoH postotak, datum testa, link na PDF, oznaka "Verificirano Aviloo testom". **Bez certifikata:** neutralno "Bez certifikata baterije", bez dramatiziranja.
- Upload certifikata kroz postojeću sekciju 10 (Dokumentacija vozila) — Aviloo PDF dobiva posebno prepoznavanje i strukturirani prikaz umjesto generičkog priloga; nula novog developmenta.
- **Referral mehanika:** na EV/PHEV oglasima bez certifikata — CTA prodavaču "Naruči Aviloo test baterije" i kupcu "Zatraži test baterije za ovo vozilo" → vodi na partnerski servis (operativno vodi Hrvojev partner; wagen provizija po certifikatu). Partnerski odnos **transparentno označen**.
- Strateška logika: konzistentno s filozofijom platforme (izmjereno > tvrđeno — kao validirani bedževi i odbijanje CarVerticala); baterija = 30–40 % vrijednosti rabljenog EV-a i jedina komponenta koju kupac ne može procijeniti sam. Danas malen segment → ne prihod nego diferencijator i optionality.
- Certificirani EV **ne dobiva highlight bedž** (set iz 9.6 zaključan). Zasebna SoH oznaka na kartici = v1.1, po stvarnoj potražnji.

### 13.6 Financiranje — ODBAČENO za launch

Kalkulator financiranja + reklama financijske kuće (leasing/banka) na stranici oglasa se **ne gradi**. Razlozi (zapisano da se ne reotvara): (1) posredovanje u financiranju = regulirana zona (HANFA, potrošački propisi) — administrativni teret koji pre-launch platformi ne treba; (2) tuđi brand na najvrjednijoj stranici — suprotno odluci o brendiranju iz 13.1; (3) posao ne bježi: s prometom leasing kuće dolaze same, pregovori iz pozicije snage s podacima o potražnji. Re-evaluacija post-launch.

---

## 14. Spremljene pretrage i Garaža

### 14.1 Spremljene pretrage — princip: spremanje kao nusprodukt traženja

Razlog zašto se saved search na Njuškalu/mobile.de ne koristi: spremanje je odvojen posao od traženja (nađi gumb, imenuj, konfiguriraj → odustajanje). Wagen pristup:

- **Trenutno stanje filtera JEST pretraga.** Jedan gumb na dnu rezultata (sticky uz filter na mobitelu): **"Spremi pretragu i uključi obavijesti"** — jedan tap, nula konfiguracije.
- **Ime se generira automatski iz filtera** (npr. "Porsche Macan · Benzin · do 265 KS · 2019+ · do 90.000 km"); preimenovanje opcionalno.
- **NL pretraga kao ulaz:** Claude sloj (već u stacku uz Meilisearch) razumije upit tipa "Macan 2.0 benzinac, facelift, do 90 tisuća km" → prevodi u strukturirani filter (2.0 → do 265 KS; facelift → od 2019.) → isti jedan-tap save. Korisnik mora znati što želi, ne wagen taksonomiju filtera.

### 14.2 Obavijesti — tri stupnja, pametan default po gustoći pretrage

- Po spremljenoj pretrazi: **Odmah** (push čim oglas prođe objavu) / **Dnevno** (digest u fiksno vrijeme) / **Tjedno**.
- **Sustav predlaže stupanj prema broju postojećih rezultata:** malo rezultata (uska pretraga, lovac želi biti prvi) → default "Odmah"; stotine rezultata → default dnevni digest. Time je riješena ranija TBD stavka o frekvenciji batch digesta — nije jedna globalna frekvencija nego default po gustoći.
- Dodatni okidač koji konkurencija nema: **obavijest na pad cijene unutar rezultata spremljene pretrage** ("Vozilo koje pratiš kroz pretragu pojeftinilo je €1.500").
- **Pristup:** ikona zvona u glavnoj navigaciji / tab baru, badge s brojem novih rezultata.
- **Naslovnica-radar:** ulogirani korisnik sa spremljenim pretragama na vrhu naslovnice vidi svoje pretrage s brojem novih oglasa od zadnje posjete — ne generički izlog.
- **Anonimni korisnik:** pretraga se sprema lokalno bez računa; obavijesti zahtijevaju identitet → prirodni trenutak registracije kroz razmjenu vrijednosti ("Da te obavijestimo o novom rezultatu, treba nam broj ili email") — konzistentno s 4.3.

### 14.3 Garaža — spremljeni oglasi (ODLUČENO ime)

Brendirano ime **"Garaža"** (spremljene pretrage ostaju opisno "Spremljene pretrage" — jedno brendirano ime po feature-setu). Model: mobile.de pristup (dosje, ne ogledalo ponude), dograđen — Njuškalov pristup (spremljeni oglas tiho nestane) briše korisnikov rad i eksplicitno se odbacuje.

Tri sloja podataka po spremljenom oglasu:
1. **Snapshot pri spremanju:** datum + cijena u trenutku spremanja, trajno; sprema se u korisnikov zapis pa preživi i potpuno brisanje oglasa.
2. **Živo praćenje cijene:** kartica u Garaži uvijek prikazuje deltu ("spremljeno 12.3. po €47.900 · danas €46.400 · −€1.500"). **Push na pad cijene spremljenog oglasa = najvrjednija notifikacija u proizvodu** — trenutak najviše kupovne namjere.
3. **Završno stanje s poviješću:** prodan oglas ostaje u Garaži, posivljen, oznaka **"Prodano"** + finalna cijena; razlikuje se od "Uklonjeno" (prodavač obrisao). Nusprodukt za wagen: stvarne prodajne cijene pune cjenovnu bazu.

### 14.4 UI (mobile-first) i usporedba vozila

- Spremanje: ikona srca na kartici i stranici oglasa (naučeni standard).
- Garaža u tab baru; unutra **ista kartica oglasa iz sekcije 13** (nula novog UI-ja) + snapshot/delta redak.
- **Filter chipovi na vrhu Garaže: Aktivni · Sniženi · Prodani** — prodani ne zagađuju aktivnu listu, dosje ostaje potpun.
- **Usporedba vozila (compare) živi u Garaži — riješena TBD stavka:** checkbox na karticama u Garaži + gumb "Usporedi (N)". Nitko ne uspoređuje aute koje nije spremio; compare ne postoji u glavnoj navigaciji.

### 14.5 Limiti

- **Garaža: 200 aktivnih vozila** — prodani i uklonjeni oglasi **ne broje se u limit** (oni su arhiva/dosje, ograničava ih retencijska politika, ne brojka). Kod dosegnutog limita: poruka s ponudom čišćenja.
- **Spremljene pretrage: 20 po korisniku** — više nitko ozbiljno ne prati; štiti matching worker od patoloških slučajeva.

### 14.6 Notifikacijska arhitektura (tko šalje i kako)

**Tko šalje:** background worker nad `notifications` tablicom (red čekanja, 15.5). Okidači koji pune red:
1. Aktivacija novog oglasa → matching protiv spremljenih pretraga. NL odluka iz 14.1 se ovdje isplaćuje: sve pretrage su strukturirani JSONB filteri, pa je matching običan upit, ne parsiranje teksta.
2. Novi `price_event` → provjera protiv Garaža i spremljenih pretraga (pad cijene).
3. Digest job u fiksno vrijeme skuplja dnevne/tjedne batcheve.
- **Deduplikacija u redu:** isti oglas se istom korisniku nikad ne šalje dvaput (unique constraint na korisnik+oglas+tip).

**Kanali — matrica po platformi i hitnosti:**
- **Aplikacija instalirana:** push (Expo Push → APNs/FCM) za stupanj "Odmah"; digesti push ili email po postavci korisnika.
- **Samo web korisnik: email za sve stupnjeve.** **Web push (browser notifikacije) se NE gradi u v1 (ODLUČENO):** očajne opt-in stope, iritantan permission prompt, šepava iOS Safari podrška — email pokriva isti posao pouzdanije. Re-evaluacija post-launch po potrebi.
- **In-app centar notifikacija (zvono s brojčanikom)** bilježi sve bez obzira na kanal — ništa nije izgubljeno ni korisniku koji ignorira email.
- **Email provider:** transakcijski servis (Resend/Postmark/SES klase) kroz adapter; izbor — TBD.
- **Web → app most:** završni ekran spremanja pretrage na webu nudi "Skini aplikaciju za trenutne obavijesti" — stupanj "Odmah" bez aplikacije znači sporiji email, pa je ovo organski povod, ne nametanje.

---

## 15. Data model

### 15.1 Temeljna odluka: Vozilo ≠ Oglas

Dva entiteta umjesto klasičnog jednog (samo "oglas"), omogućeno VIN-om na ulazu:
- **`vehicles`** — fizičko vozilo ukotvljeno VIN-om: dekodirani podaci, Outvin cache, tvornička oprema, Aviloo certifikat. Postoji jednom, zauvijek.
- **`listings`** — komercijalni događaj: ponuda tog vozila, po cijeni, u periodu. Vozilo kroz život može imati više oglasa.

Što ovo kupuje (vezano za postojeće sekcije):
- **Moderacija duplikata i re-objavljivanja (sekcija 8):** dva aktivna oglasa s istim VIN-om / novi oglas na VIN-u s jučer obrisanim oglasom = čista SQL provjera, ne fuzzy usporedba teksta i fotografija.
- **Cjenovna baza:** povijest cijena po *vozilu*, kroz više oglasa i vlasnika.
- **Aviloo certifikat (13.5)** visi na vozilu, ne oglasu — vrijedi i za sljedeći oglas istog auta.
- "Prodano po €X" u Garaži (14.3) i tržišna analitika izlaze iz istog izvora.
- Konkurencija ovo ne može kopirati bez VIN-a na ulazu — a VIN na ulazu je wagen aplikacija.

**Rubni slučaj — vozila bez VIN-a** (oldtimeri, ručni unos): `vehicles.vin` je **nullable, s unique constraintom na ne-null vrijednosti**. Vozilo bez VIN-a postoji i normalno se oglašava, samo ne sudjeluje u VIN-baziranim mehanizmima. Model degradira elegantno.

### 15.2 Extensible kategorije — hibrid (ne čisti EAV, ne kolone po kategoriji)

- **Zajedničke kolone** na `listings` za univerzalno i uvijek-filtrirano: cijena, godina prve registracije, km, lokacija, status, **`vat_deductible`** ("Povrat PDV-a moguć", 13.1 — svojstvo transakcije, ne prodavača).
- **Tržišna dimenzija `market` (ODLUČENO):** kolona `market` (default `'HR'`) na **`listings`, `dealers`, `plans`, `saved_searches`** i u **RLS politikama**, od prve migracije. Dodavanje wagen.si tržišta kasnije = novi redci, **nula migracija sheme**.
- **`vehicles` i `equipment_codes` su tržišno NEUTRALNI (ODLUČENO)** — nemaju `market` kolonu. Razlog je izravna posljedica arhitekture Vozilo≠Oglas (15.1): isto fizičko vozilo može tijekom života biti oglašeno na oba tržišta (uvoz je normalan tijek na hrvatskom i slovenskom tržištu), a rječnik opreme i cjenovna baza su **zajednička imovina** — dijeljenje ih čini vrjednijima, razdvajanje bi ih prepolovilo.
- **`attributes` JSONB** za kategorijski specifično, validirano protiv **`category_attributes`** definicijske tablice (kategorija → atribut, tip, jedinica, filtrabilnost, redoslijed prikaza).
- **Nova kategorija u Fazi 2 = redci u definicijskoj tablici, nula migracija sheme.** Isti mehanizam kasnije nosi "listing type" za dijelove/gume (Faza 3, sekcija 7) s drugim zajedničkim pretpostavkama (quantity umjesto VIN-a).
- Meilisearch indeksira flattenane atribute — brzina filtriranja neovisna o fizičkom smještaju podatka.

### 15.3 Field ownership — fizičko razdvajanje (implementacija 12.2)

- DMS sync piše **isključivo** u `listings`/`vehicles`; wagen obogaćivanje živi u **`listing_enrichment`** (1:1): bedž, TOP status, redoslijed fotografija, dorađen opis.
- Čitanje spaja; sync enrichment **fizički ne može** pregaziti jer u tu tablicu ne piše. Nema `locked_fields` flagova ni if-logike u syncu — arhitektura garantira ono što bi inače garantirao oprez.

### 15.4 Cijena kao append-only događaj

- **`price_events`** (listing_id, price, timestamp); trenutna cijena denormalizirana na `listings.price_current` radi brzine.
- Jedna tablica hrani: deltu u Garaži, push na pad cijene (Garaža + spremljene pretrage), signal cjenovnog outliera za moderaciju, tržišnu statistiku.
- Snapshot u Garaži (`garage_items.price_at_save`, `saved_at`) je zaseban podatak u korisnikovom retku — preživi i potpuno brisanje oglasa (odluka 14.3).

### 15.5 Popis tablica

**Identitet i prodavači**
- `auth.users` (Supabase) — izvor istine identiteta, uklj. anonimne sesije; upgrade na puni identitet = promjena na istom retku, ne migracija (podržava 4.3)
- `profiles` — javno ime, verificiran telefon
- `dealers` — tvrtka, OIB, verifikacijski status, concierge bilješke
- `dealer_members` — korisnik ↔ trgovac (M:N od prvog dana; Premium do 3, Ultimate neograničeno)
- Oglas ima `user_id` **ili** `dealer_id`, nikad oba — check constraint.

**Vozilo i oglas (jezgra)**
- `vehicles`, `listings`, `listing_enrichment`, `price_events`
- `listing_photos` — s **kategorijom kuta iz vođenog fotografiranja** (pokreće sekcijsku galeriju 13.3) i redoslijedom
- `categories`, `category_attributes`
- `equipment_codes` — globalni rječnik (proizvođač + kod → naziv EN, naziv HR, status prijevoda; 13.4)
- `vehicle_equipment` — veza na **vozilu**, ne oglasu (tvornička oprema je svojstvo auta)
- `documents` — dokumentacija vozila (sekcija 10), FK na vozilo; `type` razlikuje generički PDF od Aviloo certifikata (strukturirana polja: SoH, datum testa)

**Faza 0 / aplikacija**
- `photo_sessions` / draft oglasi: anonimna sesija, VIN, fotke s kategorijom kuta, status `draft → pending → active`, `crosspost_consented`
- Pending pool za launch dan = `WHERE status = 'pending' AND crosspost_consented = true`

**Angažman i povjerenje**
- `saved_searches` — filteri JSONB, stupanj obavijesti, auto-generirano ime (14.1–14.2)
- `garage_items` — user, listing, `price_at_save`, `saved_at` (14.3)
- `contact_events` — tko/koji oglas/kada/kanal; nosi tri stvari: dokaz kontakta kao uvjet recenzije (sekcija 11), statistiku za dealer dashboard, signal potražnje za analitiku
- `reviews` — FK na `contact_events`; "jedna recenzija po korisniku po trgovcu" = unique constraint, ne aplikacijska logika
- `notifications` — red čekanja (tip, payload, poslano/pročitano); jedan mehanizam za nove rezultate, pad cijene i digeste

**Trgovina i moderacija**
- `plans` — paketi kao **podaci, ne kod** (ODLUČENO): Basic/Premium/Ultimate, cijena, kvote (TOP oglasi, bedževi), broj korisničkih naloga, Stripe price id, `market`. Promjena cijene ili kvote je redak u tablici, ne deploy.
- `subscriptions` — Stripe id-jevi, paket, trial (9.5); kvote (TOP, bedževi) izvedene iz paketa
- `invoices` — račun kao **zaseban entitet** (9.7, ODLUČENO): broj računa, stavke, PDV, JIR/ZKI, status fiskalizacije, veza na Stripe objekt. Pretpostavka "Stripe invoice = račun" eksplicitno se odbacuje — Stripe je platni procesor, porezna obveza izdavanja je wagenova. (Stavka je nedostajala u ovom popisu; 9.7 ju je nalagala od početka.)
- `moderation_flags` — oglas, tip prekršaja (lista iz sekcije 8), izvor (AI / ručno / prijava korisnika), status; AI sweep piše, admin sučelje čita — moderacija je queue nad podacima, ne poseban sustav

### 15.6 Infrastrukturne odluke

- **Postgres je izvor istine, Meilisearch je derivat.** Svaka promjena oglasa → queue → reindeks dokumenta (flattenani atributi + prevedena oprema + bedž). Indeks se u svakom trenutku može obrisati i rebuildati iz Postgresa; nikad obrnuto, nikad podatak koji živi samo u indeksu.
- **Row Level Security od prvog dana**, ne naknadno: korisnik vidi svoje draftove/Garažu/pretrage; `dealer_members` vide oglase svog trgovca; javnost vidi samo `active` oglase; enrichment piše samo vlasnik ili admin.
- ID-jevi: UUID svugdje; SEO slugovi na oglasima kao zaseban, stabilan stupac.
- **Tržišna dimenzija — jedan Supabase projekt (ODLUČENO):** wagen.hr i budući wagen.si dijele jedan projekt i jednu shemu; razdvajanje nosi `market` kolona (15.2), ne odvojena infrastruktura. Obrazloženje: `market` kolona sada je trivijalna, naknadno bolna; jedinstven identity layer znači da korisnik i trgovac postoje jednom na oba tržišta.
- **Dva Supabase projekta po okolini (ODLUČENO):** `wagen-dev` i `wagen-prod`. Migracije idu kroz git na oba. Seed podaci i eksperimenti nikad ne dodiruju produkciju. (Odvojeno od odluke o tržištima iznad — okolina ≠ tržište.)
- **Background poslovi: zaseban Node worker servis (ODLUČENO).** DMS sync (12), reindeks queue prema Meilisearchu, notifikacijski worker i digesti (14.6), moderacijski sweep (8) i fiskalizacija (9.7) izvršavaju se u Node servisu, ne u Supabase Edge Functions. Obrazloženje: worker dijeli `adapters` i `domain` pakete s webom — pisati adaptere dvaput (Deno + Node) poništilo bi svrhu adapter patterna; uz to nema vremenskog limita izvršavanja, što DMS sync od 300+ vozila traži.

---

## 16. Tražilica i naslovnica

### 16.1 Dva sloja, jedan ekran

**Sloj 1 — klasična brza pretraga (default na desktopu, gornja polovica hero sekcije):**
- **Četiri polja i ni jedno više: Marka → Model → Cijena do → Godina od.** Marka/Model kaskadno (model se puni po odabranoj marki), oba pretraživa dropdowna s tipkanjem.
- Svi ostali filteri (km, gorivo, snaga...) žive na stranici rezultata — hero pretraga ubacuje korisnika u rezultate za dvije sekunde, ne rješava cijelu pretragu na naslovnici.
- **Gumb = živi brojač: "Prikaži 1.243 vozila"** — broj se osvježava pri svakom odabiru polja (Meilisearch count, praktički besplatno). Tri posla odjednom: dokazuje ponudu, daje trenutni feedback, sprječava "0 rezultata" nakon klika.

**Sloj 2 — NL pretraga kao potpis platforme (Claude sloj iz stacka):**
- Jedno polje, placeholder uči primjerom: *"npr. Macan 2.0 benzinac, facelift, do 90 tisuća km"*.
- Claude sloj prevodi upit u strukturirani filter i vodi na **iste rezultate s vidljivo popunjenim filterima** — korisnik vidi što je sustav razumio i korigira jednim tapom. NL pretraga nije crna kutija nego brži put do istih filtera.
- **Mobitel/app: redoslijed slojeva zamijenjen** — NL polje primarno (jedna rečenica lakša od četiri dropdowna), strukturirana polja ispod.

### 16.2 Naslovnica — redoslijed

1. Hero s tražilicom (marketing površina po 6.2 — vizual smije biti doživljaj, tražilica je funkcionalna i trenutna)
2. **Ulogirani sa spremljenim pretragama: radar** (14.2) — vlastite pretrage s brojem novih oglasa od zadnje posjete
3. Najnoviji oglasi / izbor

Anonimni posjetitelj vidi izlog; lovac vidi svoj radar; tražilica je za obojicu na istom mjestu.

- **Zadnja pretraga pamti se lokalno, bez računa:** povratak na naslovnicu nudi chip "Nastavi: Porsche Macan · Benzin · 2019+" jednim tapom — ono što Njuškalo/mobile.de rade duboko dolje i netočno, ovdje točno i na vrhu.

### 16.3 Pretraga po mjesečnoj rati — ODBAČENO

Zapisano da se ne reotvara: (1) rata kao ulaz je maskirano financiranje — točan izračun zahtijeva kamatu/učešće/rok, dakle ili generički netočan prikaz ili povratak u reguliranu zonu odbačenu u 13.6; (2) rata čini auto "jeftinijim" nego što jest — alat prodavača financiranja, ne platforme kojoj je kredibilitet proizvod; (3) kupac ima cifru u glavi — "Cijena do" je iskren filter, "rata do" iluzija kontrole.

---

## 17. SEO arhitektura

Strateški okvir: Njuškalov 20-godišnji domenski autoritet ne prestiže se autoritetom nego strukturom i sadržajem koji oni nemaju (tržišni podaci iz VIN+price_events arhitekture).

### 17.1 URL arhitektura — piramida indeksabilnih stranica

Hrvatski slugovi, čista hijerarhija; svaka razina je landing stranica:

```
/rabljeni-automobili                          → kategorijski hub
/rabljeni-automobili/bmw                      → stranica marke
/rabljeni-automobili/bmw/x1                   → stranica modela  ← SEO radni konj
/rabljeni-automobili/bmw/x1/2018              → model + godište
/oglas/2018-bmw-x1-m-sport-sdrive20i-a4f7    → oglas (slug iz strukturiranog naslova 13.1 + kratki id)
```

- **Faceted navigation pravilo (kritično):** indeksira se hijerarhija + **konfigurabilan popis komercijalno smislenih facet kombinacija** (npr. `/bmw/x1/dizel`, `/bmw/x1/automatik`). Sve ostalo (km/cijena rasponi, višestruki filteri) = query parametri s canonicalom na najbližu indeksabilnu stranicu + noindex. Bez toga: stotine tisuća indeksiranih kombinacija smeća i ugušen crawl budget.
- Popis indeksabilnih faceta = tablica u bazi, širi se po podacima iz Search Consolea, ne nagađanjem.
- URL struktura jezično neutralna ispod sluga — preživljava kasnije dodavanje wagen.si. Odluka o Supabase projektu je riješena (jedan projekt, `market` dimenzija — 15.2/15.6), pa hreflang ostaje čisto SEO odluka bez arhitektonske ovisnosti.

### 17.2 Nekopirljiv sadržaj: tržišna statistika iz vlastite baze

Stranice modela nisu gola lista oglasa + H1 (to ima svatko). Svaka prikazuje **statistiku iz price_events/vehicles baze**: prosječna i medijalna cijena, raspon, medijan kilometraže, broj aktivnih oglasa, kretanje cijene kroz vrijeme — s vremenom i **stvarne prodajne cijene** ("Prodano" status). Upit "kolika je cijena rabljenog X1" ima volumen, a jedino wagen na njega odgovara *izmjereno* — nusprodukt data modela (15.1), izraz filozofije "izmjereno > tvrđeno", i razlog za povratak na stranicu.

**Uvodni tekstovi stranica modela:** generirani Claude API-jem **jednom, spremljeni trajno, review queue prije objave** (isti mehanizam kao rječnik opreme 13.4). Kratki (150–250 riječi), činjenični (generacije, motorizacije, poznate slabosti — domenska recenzija za top modele), bez SEO punjenja. **Nikakav on-the-fly generirani tekst** — 200 dobrih stranica modela pobjeđuje 20.000 praznih, a masovni AI sadržaj bez vrijednosti Google kažnjava.

### 17.3 Stranica oglasa

- **Structured data:** schema.org `Car` + `Offer` na svakom oglasu (čisti mapping već strukturiranih podataka) — uvjet za rich results. Stranice modela: `ItemList` + `BreadcrumbList`.
- **OG slika:** generirana share kartica — glavna fotografija + dvoredni naslov + cyan cjenovna traka. Svaki share na WhatsApp/FB nosi wagen identitet; uz FB grupe kao kanal, to je distribucija, ne kozmetika.
- **Prodani oglas se NE briše i NE vraća 404/410 (ODLUČENO):** stranica ostaje živa, označena "Prodano" + finalna cijena (konzistentno s 14.3) + blok "Slična vozila u ponudi". Stari oglasi akumuliraju linkove i pozicije — 404 baca taj kapital, "Prodano + slična" pretvara mrtvi URL u ulaz prema živoj ponudi. Nakon 12+ mjeseci (uskladiti s retencijskom TBD stavkom): stranjivanje + canonical na stranicu modela.

### 17.4 Rendering (mapiranje na postojeći Next.js stack)

- **ISR:** stranice marke/modela/godišta — regeneracija na webhook (promjena broja oglasa ili statistike).
- **SSR:** stranice oglasa (cijena/status svježi za crawlere) i rezultati pretrage.
- **Client-side:** sve iza prijave (Garaža, dashboard, spremljene pretrage) — bez SEO-a, bez servera.
- **Sitemap:** segmentiran (oglasi s lastmod iz price_events/statusa; zasebno stranice modela), generiran iz baze.

### 17.5 Autoiskustva.hr — funnel spojen URL-ovima

- Svaka recenzija na autoiskustva.hr za model X dobiva **živi blok iz wagen API-ja**: "Trenutno 23 rabljena X1 na wagen.hr od €18.500" → duboki link na stranicu modela. Obrnuto: stranica modela linka iskustva vlasnika.
- Dvije domene, dva tipa upita (informacijski vs. transakcijski), hrane se međusobno linkovima i prometom.

### 17.6 Wagen indeks — cjenovna baza kao PR poluga

**Mjesečni javni izvještaj o cijenama rabljenih vozila u Hrvatskoj** iz price_events/vehicles baze: prosjeci i kretanja po segmentima, najtraženiji modeli, medijalne kilometraže. Nitko u HR nema te podatke *izmjerene* — mediji (Index, Večernji, N1...) prenose besplatno s linkom. Tri posla odjednom: backlink stroj za SEO, autoritet brenda ("wagen podaci" kao referenca za auto tržište), razlog da novinari zovu. Trošak: jedan template + pola dana mjesečno. Početak: čim baza ima statistički pristojan volumen (post-launch).

---

## 18. Sučelja platforme: Kokpit trgovca, Moji oglasi, wagen admin

### 18.1 Kokpit trgovca (dealer dashboard)

Jedan Kokpit, dva režima rada — sudar DMS i ne-DMS trgovaca rješava se prilagodbom, ne dvama proizvodima:
- **DMS-povezan trgovac (AutoBrief adapter):** Kokpit je nadzorno-obogaćivački sloj — zaliha se čita iz synca (DMS-owned polja vidljivo označena kao "upravlja DMS", po 12.2/15.3), a Kokpit služi za enrichment (bedž, TOP raspored, redoslijed fotografija), statistiku i Izloge.
- **Ne-DMS trgovac:** Kokpit je cijeli alat — dodavanje vozila (kroz app ili web), uređivanje, praćenje zalihe, statusi, sve gore navedeno.

**Izlog (ODLUČENO ime; prodajni list za vjetrobran, engl. window sticker) — feature koji je istovremeno i distribucija:**
- Generirani brandirani PDF iz strukturiranih podataka oglasa: dvoredni naslov (13.1), cijena u €X.XXX,- formatu, istaknuta oprema, highlight bedž, **QR kod na stranicu oglasa**. Print jednim klikom; automatska regeneracija kod promjene cijene.
- Distribucijska logika: svaki auto na placu s wagen Izlogom je fizički oglas za platformu koji trgovac **sam printa i sam postavlja** jer mu je koristan — interes trgovca (njegov oglas) i platforme savršeno poravnati. Veže se na founding-partner status i concierge posjete.
- Ime "Izlog" semantički pogađa (papir pretvara vjetrobran u izlog), jedna riječ, brendabilno; par s "Ekspoze" (19.3): Izlog za staklo, Ekspoze za kupca. U Kokpitu: "Isprintaj Izlog".

**Napredna statistika:** prikazi i kontakti po oglasu (contact_events), spremanja u Garaže, i — diferencijator iz cjenovne baze — **usporedba s tržištem**: "tvoj X1 je 8 % iznad medijana za model/godište" (price_events, 15.4). Nijedan HR oglasnik trgovcu ne daje izmjeren tržišni kontekst.

**Fotografije u Kokpitu (ODLUČENO):** trgovcima je **web upload dopušten** — imaju profesionalne workflow-e i DMS feedove koji ionako donose nekategorizirane fotografije (galerija 13.3 zato ima fallback bez sekcijske navigacije kad kategorija nema). Tržišni poticaj ostaje: oglasi fotkani kroz app izgledaju bolje.

**Ostalo:** upravljanje TOP/bedž kvotama po paketu (9.3), članovi tima (dealer_members, 15.5), Stripe Customer Portal link (9.5).

### 18.2 Moji oglasi (privatni prodavač)

Namjerno minimalno, web + app:
- Lista vlastitih oglasa; uređivanje (promjena cijene piše price_event); **"Označi prodano" s pitanjem o finalnoj cijeni** (dobrovoljno — hrani bazu stvarnih prodajnih cijena, 15.4/17.2); obnova; kupnja boosta (9.6).
- **Fotografije (ODLUČENO): "fotografija nastaje u aplikaciji; web upravlja, ne stvara."** Na webu: promjena redoslijeda, brisanje, izbor naslovne — ali "Dodaj fotografije" prikazuje QR/deep link koji otvara aplikaciju direktno na foto flowu tog oglasa (handoff ~10 s). Razlog: slika kroz app nosi kategoriju kuta (13.3), watermark (distribucija) i konzistentnu kvalitetu — web upload bi rušio sve tri stvari. Asimetrija prema trgovcima (18.1) je namjerna: privatnom prodavaču app *jest* alat i GTM, trgovcu je jedan od alata.
- Osnovna statistika: prikazi, kontakti, **broj spremanja u Garaže** — "12 ljudi ima tvoj auto u Garaži" je i informacija i nježan povod za korekciju cijene.

### 18.3 wagen admin (interni alat)

Jedan interni `/admin` u istom Next.js projektu, iza RLS admin role — **nije proizvod, ne troši se dizajn na njega**. Pet queue pogleda nad postojećim tablicama, bez kojih pet sekcija dokumenta visi u zraku:
1. Concierge aktivacija trgovaca (5.3) — pregled prijava, verifikacija, aktivacija, postavljanje trial dana
2. Moderacijski queue (8) — moderation_flags: AI nalazi + prijave korisnika, akcije nad oglasima
3. Review queue prijevoda opreme (13.4) — novi equipment_codes prijevodi
4. Review tekstova stranica modela (17.2) — generirani uvodni tekstovi prije objave
5. Metrike Faze 0 (4.5) — instalacije, dovršetak flowa, crosspost rate, pending pool
Plus ručne operacije za trgovce u ranim mjesecima (raspored kvota, bulk zahvati na zahtjev) dok Kokpit ne pokrije sve.

---

## 19. Web stranice, prodajni sadržaj i dijeljenje oglasa

### 19.1 Statične stranice

**Pravni minimum (obavezno, HR/EU propisi):** Uvjeti korištenja (uklj. politiku fotografija iz DMS feedova, 13.3), Politika privatnosti (GDPR — platforma barata telefonima, fotografijama i VIN-ovima), Politika kolačića, Impressum s podacima tvrtke. Tekstove finalizira odvjetnik (TBD).

**Korisni set:** Kontakt, O nama (kratka priča — Hrvojeva automobilska pozadina kao kredibilitet), Pomoć/FAQ, `/za-trgovce` (19.2).

**Blog = "Novosti" (disciplina protiv samokanibalizacije):** wagen blog **nije** mjesto za sadržaj o autima — to je autoiskustva.hr (17.5), i miješanje bi kanibaliziralo vlastiti SEO funnel. Wagen "Novosti" nose: objave platforme, najave featurea, i **dom wagen indeksa (17.6)** — mjesečni izvještaj mora imati stabilan URL koji mediji linkaju.

### 19.2 Prodajna stranica `/za-trgovce`

Tri kartice s cijenama su cjenik, ne prodaja. `/za-trgovce` je prava prodajna stranica koja **demonstrira**, redom:
1. Video demo aplikacije (VIN sken → fotke → oglas u ~90 sekundi) — vlastita produkcija; isti materijal hrani before/after seeding u FB grupama (4.6)
2. Izlog showcase (18.1) — fizički artefakt koji trgovac odmah razumije
3. Statistika s usporedbom prema tržišnom medijanu (screenshot Kokpita) — nitko im to ne daje
4. Concierge obećanje ("dolazimo k vama, fotografiramo, postavljamo")
5. Founding partner ponuda s besplatnim periodom (9.4)
6. Paketi — tek na dnu
- **CTA: "Zatraži poziv", ne "Registriraj se"** — poravnato s ručnom concierge aktivacijom (5.3); stranica hrani osobni prodajni proces, ne zaobilazi ga.

### 19.3 Dijeljenje oglasa i PDF ekspoze

Obrazac distribucije kroz aktere (dovršava postojeću obitelj): watermark čini **fotografa** distributerom (4.4), Izlog **trgovca** (18.1), share kit **prodavača**, PDF ekspoze **kupca**. Prodavač je jedini akter čiji je interes identičan platforminom — želi maksimalan doseg svog oglasa.

**v1 — dijeljenje na trenutku objave i na stranici oglasa:**
- App success ekran ("Oglas je objavljen") → **"Podijeli svoj oglas"**: WhatsApp, Facebook/Messenger — dijeli se **link**, OG kartica iz 17.3 (fotka + dvoredni naslov + cyan traka) radi vizualni posao. WhatsApp je primarni kanal u HR; ne gradi se ništa osim share sheeta.
- Share gumb i na **web stranici oglasa** — treći trenutak: kupac dijeli auto partneru/prijatelju ("šta misliš o ovom?").
- Odgovor na "app ili web": tamo gdje se događa trenutak — prodavač u aplikaciji, trgovac u Kokpitu, kupac na webu. Ista OG/PDF infrastruktura servira sva tri mjesta.

**PDF ekspoze (STRATEŠKI VAŽNO — podcijenjena poluga):**
- **Isti generator kao Izlog (18.1), drugi template** — jedan PDF servis, dva proizvoda.
- Sadržaj: sve fotografije, kompletne specifikacije, **puna tvornička oprema iz 13.4** (dokument kakav ne postoji nigdje na tržištu — prodavač/trgovac dobiva profesionalni ekspoze njemačkog tipa jednim klikom), highlight bedž, QR kod na oglas, wagen brand.
- **Dvije varijante (ODLUČENO):**
  - *Prodavačeva* — s kontaktom prodavača; on je sam šalje ozbiljnom kupcu (WhatsApp/email), kontakt je njegov izbor.
  - *Javna/kupčeva* — "Preuzmi PDF" na stranici oglasa, dostupna svakome; **bez direktnog kontakta prodavača** — umjesto telefona QR/link "Kontaktiraj prodavača na wagen.hr". Dva razloga: privatnost prodavača (broj ne kruži u dokumentu izvan njegove kontrole) i očuvanje kontakt funnela na platformi (contact_events → statistika, recenzije, signal potražnje).
- **Rate limiting** na generiranje javnih PDF-ova — zaštita od masovnog scrapinga baze kroz PDF izlaz.

**v1.1 — generirani vertikalni video (TikTok/Reels):** fotke iz vođenog fotografiranja su kategorizirane i u konzistentnom redoslijedu (13.3) → server automatski slaže ~15 s 9:16 video (eksterijer → interijer → detalji, cijena i naslov u wagen stilu) bez ljudske odluke. TikTok ne prenosi linkove dobro pa traži nativni video. Jedini dio koji zahtijeva novi servis (slideshow rendering) — čeka da v1 share pokaže potražnju.

---

## 20. Otvorena pitanja (TBD)

- [ ] Točne TOP istaknuti oglasi kvote po paketu (Premium, Ultimate)
- [ ] Točan broj mjeseci općeg besplatnog promotivnog razdoblja, i razlikuje li se po paketu
- [x] ~~Točan popis highlight bedž opcija~~ — RIJEŠENO, zatvoren set definiran u 9.6
- [ ] Prag za automatski "Malo kilometara" bedž (npr. <60 % prosjeka km za godište — provjeriti na stvarnim podacima iz Faze 0)
- [ ] AutoBrief feed — točna specifikacija (mapiranje polja na kanonski model, frekvencija synca, format opreme/option kodova)
- [ ] Pragovi za Verified Dealer Plus / Top Dealer bedž (min. broj vozila, min. ocjena/broj recenzija)
- [ ] Detaljan proces spajanja računa kod sudara identiteta — UX flow, ne samo tehnički mehanizam
- [x] ~~Saved search notifikacije — frekvencija batch digesta~~ — RIJEŠENO: tri stupnja s pametnim defaultom po gustoći pretrage (14.2)
- [x] ~~Usporedba vozila (compare) — gdje živi u navigaciji~~ — RIJEŠENO: živi u Garaži (14.4)
- [x] ~~Wagen.si / slovensko tržište — utječe li i kako na auth/registracijski flow (isti Supabase projekt ili odvojen?)~~ — RIJEŠENO: **jedan Supabase projekt s `market` dimenzijom od prve migracije** (15.2, 15.6)
- [ ] Anti-abuse detalji za otvoreni model recenzija trgovaca (prag za prijavu, moderacija lažnih recenzija)
- [x] ~~Android foto obrada — tiering vs. blur-only~~ — RIJEŠENO: "radi na novijim uređajima", puni pipeline uz ML Kit, graceful degradacija na blur za starije, bez server fallbacka u v1 (4.4)
- [ ] Minimalni Android zahtjevi — lista testnih uređaja i ML Kit provjera sposobnosti (4.4)
- [ ] Watermark — dizajn, pozicija, veličina (dovoljno vidljiv za brand, dovoljno diskretan da ga korisnici ne isključuju)
- [ ] Deep link parametri i attribution model (FB grupa → instalacija → foto mod), po grupi ako ih je više
- [ ] Ciljna vrijednost crosspost ratea kao launch gate (koji % opravdava datum javnog lansiranja)
- [ ] Copy i UX završnog crosspost ekrana ("oglas je već 90% gotov") — najvažniji ekran u aplikaciji, zaslužuje A/B testiranje
- [ ] Politika fotografija iz DMS feedova (okviri/watermarci trgovaca) — formulacija u uvjetima korištenja (13.3)
- [ ] SoH oznaka na kartici EV oglasa (v1.1) — uvjet uvođenja: stvarna potražnja za Aviloo certifikatima (13.5)
- [ ] Aviloo — formalizirati provizijski ugovor s partnerom (pisano, iako je prijatelj — upravo zato)
- [ ] Popis 8–12 stavki za "Istaknutu opremu" — kriterij automatskog odabira iz pune liste (13.4)
- [ ] Vrijeme slanja dnevnog/tjednog digesta i pragovi gustoće za default stupanj obavijesti (14.2)
- [ ] Izbor transakcijskog email providera (Resend/Postmark/SES klase) — kroz adapter (14.6)
- [ ] Compare UX detalji — koja polja se uspoređuju, max broj vozila (14.4)
- [ ] Retencija podataka — koliko dugo se čuvaju prodani/uklonjeni oglasi, contact_events i price_events (GDPR + trošak storagea vs. vrijednost cjenovne baze); uskladiti sa SEO odlukom o "Prodano" stranicama (17.3)
- [ ] Početni popis indeksabilnih facet kombinacija po modelu (17.1) — seed lista prije Search Console podataka
- [ ] Fiskalizacija — izbor informacijskog posrednika / fiskalizacijskog API-ja (s knjigovođom, cjenovna usporedba) (9.7)
- [ ] Fiskalizacija — potvrda režima za kartično plaćene B2B pretplate (fiskalni račun vs. eRačun) s knjigovođom (9.7)
- [x] ~~Window sticker — hrvatski naziv~~ — RIJEŠENO: "Izlog" (18.1)
- [ ] Izlog — format i sadržaj A4 predloška (18.1)
- [ ] Opseg napredne statistike Kokpita u v1 — koje metrike ulaze u launch, koje kasnije (18.1)
- [ ] Pravni tekstovi (Uvjeti, Privatnost, Kolačići, Impressum) — finalizacija s odvjetnikom (19.1)
- [ ] Scenarij i produkcija demo videa aplikacije (19.2)
- [ ] Javna PDF ekspoze varijanta — rate limiting prag i točan sadržaj (19.3)

---

## 21. Redoslijed implementacije (Claude Code)

Razrada dokumenta je završena — sekcije 1–20 su izvor istine za implementaciju. Redoslijed slijedi iz dvije činjenice: sve ovisi o data modelu, a prvi proizvod koji izlazi pred korisnike je aplikacija (Faza 0), ne web.

### Sprint 1 — Temelj
- Supabase projekt: shema iz sekcije 15 (vehicles/listings/enrichment/price_events + prateće tablice), **RLS politike od prvog dana** (15.6), auth konfiguracija (anonimne sesije, SMS OTP, magic link, social provideri — sekcija 5).
- Kanonski model oglasa + adapter sučelja (DMS 12, fiskalizacija 9.7 — samo sučelja, ne implementacije).
- Kostur internog `/admin` (18.3) — queue pogledi rastu po sprintovima, temelj odmah.
- Outvin integracija sa server-side cacheom + lokalni ISO VIN fallback (3.2); `equipment_codes` rječnik s Claude prijevodnim mehanizmom (13.4).

### Sprint 2 — Aplikacija: foto pipeline (srce Faze 0)
- VIN sken → podaci → vođeno fotografiranje (statični overlay siluete, ne AR — 4.4) → obrada.
- Capability detection sloj: iOS Vision on-device; Android ML Kit s degradacijom na blur za starije uređaje, bez server fallbacka (4.4 — ODLUČENO).
- Tablica/zamućivanje registracije on-device; watermark (default on, isključiv); izlazna matrica dva moda (4.2).
- Anonimna sesija → lokalni projekti → SMS OTP tek kod crossposta (4.3).

### Sprint 3 — Faza 0 backend + distribucija
- Draft/pending pipeline s `crosspost_consented` (15.5); deep linkovi iz FB grupa u foto mod; attribution.
- Metrike Faze 0 (4.5): instalacije, dovršetak flowa, **crosspost rate**, pending pool.
- **Gate: aplikacija ide u FB grupe po aktivacijskom planu 4.6 (seeding prije javne ponude). Web još ne postoji javno.**

### Sprint 4 — Web: pretraga i oglasi
- Meilisearch indeksiranje iz Postgresa (queue, 15.6); stranice oglasa i rezultata (sekcije 13, 16); kartica s cyan trakom; galerija sa sekcijama; Garaža + spremljene pretrage + notifikacije (14).
- SEO sloj: URL piramida, ISR/SSR mapiranje, schema, sitemap (17).
- Statične stranice i pravni minimum (19.1); share v1 + PDF ekspoze obje varijante (19.3) — PDF servis se gradi jednom, Izlog template stiže u Sprintu 5.

### Sprint 5 — Trgovci i lansiranje
- Dealer registracija/concierge aktivacija (5.3), **Kokpit trgovca s Izlogom** (18.1, isti PDF servis iz Sprinta 4), Moji oglasi (18.2), `/za-trgovce` prodajna stranica (19.2), Stripe Billing s trialovima (9.5), AutoBrief adapter (12).
- **Launch dan: aktivacija pending poola + Blitzkrieg dealer inventar** (4.5).

### Post-launch
- Fiskalizacija prije isteka prvih trialova (9.7); wagen indeks čim baza ima volumen (17.6); generirani 9:16 video za TikTok/Reels (19.3); auto-badging v1.1 (12.3); mobile.de adapter (12.4); SoH oznaka na kartici po potražnji (13.5); Faza 2 kategorije (7).

Pravilo rada: TBD stavke (sekcija 20) se rješavaju u hodu i upisuju natrag u ovaj dokument — dokument ostaje izvor istine i tijekom implementacije, ne samo prije nje.
