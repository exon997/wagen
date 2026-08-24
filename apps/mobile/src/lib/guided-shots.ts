/**
 * H1: Definicija vodjenog fotografiranja - 16 standardnih kadrova
 * (13.3 AZURIRANO 2026-08-24; popis i redoslijed odobrio vlasnik projekta).
 *
 * KRUZNI redoslijed: fotograf hoda oko auta u JEDNOM smjeru (kazaljka),
 * zavrsava eksterijer kod vozacevih vrata gdje pocinje interijer.
 * Naslovna fotografija je UVIJEK kadar 1 (prednja lijeva dijagonala 45°).
 * Line-art overlay siluete po kadru stizu iz dizajna (placeholder do tada).
 */
import type { PhotoAngle } from '@/lib/sessions';

export interface GuidedShot {
  key: string;
  angleCategory: PhotoAngle;
  section: string;
  title: string;
  hint: string;
}

export const GUIDED_SHOTS: readonly GuidedShot[] = [
  // --- EKSTERIJER: krug u smjeru kazaljke, pocetak = naslovna -------------
  {
    key: 'ext-front-left',
    angleCategory: 'exterior',
    section: 'Eksterijer',
    title: 'Sprijeda lijevo 45°',
    hint: 'NASLOVNA fotografija - cijeli auto u kadru, prednji lijevi kut',
  },
  {
    key: 'ext-front',
    angleCategory: 'exterior',
    section: 'Eksterijer',
    title: 'Sprijeda',
    hint: 'Ravno ispred auta, simetricno',
  },
  {
    key: 'ext-front-right',
    angleCategory: 'exterior',
    section: 'Eksterijer',
    title: 'Sprijeda desno 45°',
    hint: 'Prednji desni kut, cijeli auto u kadru',
  },
  {
    key: 'ext-rear-right',
    angleCategory: 'exterior',
    section: 'Eksterijer',
    title: 'Straga desno 45°',
    hint: 'Straznji desni kut, cijeli auto u kadru',
  },
  {
    key: 'ext-rear',
    angleCategory: 'exterior',
    section: 'Eksterijer',
    title: 'Straga',
    hint: 'Ravno iza auta, simetricno',
  },
  {
    key: 'ext-rear-left',
    angleCategory: 'exterior',
    section: 'Eksterijer',
    title: 'Straga lijevo 45°',
    hint: 'Straznji lijevi kut, cijeli auto u kadru',
  },
  {
    key: 'ext-wheel',
    angleCategory: 'exterior',
    section: 'Eksterijer',
    title: 'Prednji lijevi kotac',
    hint: 'Felga u sredini kadra, izbliza',
  },
  // --- INTERIJER: stojis kod vozacevih vrata ------------------------------
  {
    key: 'int-driver-door',
    angleCategory: 'interior',
    section: 'Interijer',
    title: 'Kroz vozaceva vrata',
    hint: 'Sjedala i armatura u istom kadru',
  },
  {
    key: 'int-cluster',
    angleCategory: 'interior',
    section: 'Interijer',
    title: 'Instrument ploca',
    hint: 'Kontakt ukljucen - kilometraza mora biti citljiva',
  },
  {
    key: 'int-driver-pov',
    angleCategory: 'interior',
    section: 'Interijer',
    title: 'Vozacev pogled',
    hint: 'Sa straznjeg sjedala, u visini vozaceve glave',
  },
  {
    key: 'int-driver-pov-wide',
    angleCategory: 'interior',
    section: 'Interijer',
    title: 'Vozacev pogled - sire',
    hint: 'Ista pozicija, siri kadar - ostatak armature',
  },
  {
    key: 'int-center-dash',
    angleCategory: 'interior',
    section: 'Interijer',
    title: 'Sredina armature',
    hint: 'Glavni ekran i komande ventilacije',
  },
  {
    key: 'int-console',
    angleCategory: 'interior',
    section: 'Interijer',
    title: 'Sredisnja konzola',
    hint: 'Mjenjac, prekidaci, odlagalni prostor',
  },
  {
    key: 'int-passenger-door',
    angleCategory: 'interior',
    section: 'Interijer',
    title: 'Kroz suvozaceva vrata',
    hint: 'Suvozacevo sjedalo i armatura',
  },
  {
    key: 'int-rear-bench',
    angleCategory: 'interior',
    section: 'Interijer',
    title: 'Straznja klupa',
    hint: 'Kroz lijeva straznja vrata (ili vozaceva ako ih nema)',
  },
  // --- PRTLJAZNIK ---------------------------------------------------------
  {
    key: 'trunk',
    angleCategory: 'trunk',
    section: 'Prtljaznik',
    title: 'Prtljaznik',
    hint: 'Otvoren poklopac, pogled kroz otvor',
  },
];
