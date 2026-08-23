/**
 * H1: Definicija vodjenog fotografiranja (4.4, 13.3).
 *
 * Svaki korak nosi kut (angle_category) - to je temelj sekcijske galerije
 * (Eksterijer · Interijer · Detalji) koju nijedan oglasnik nema, jer nijedan
 * ne kontrolira nastanak fotografija.
 *
 * v1 redoslijed (8 kadrova) je prijedlog - lista se lako mijenja, a overlay
 * silueta po koraku stize iz dizajna (placeholder do tada).
 */
import type { PhotoAngle } from '@/lib/sessions';

export interface GuidedShot {
  key: string;
  angleCategory: PhotoAngle;
  title: string;
  hint: string;
}

export const GUIDED_SHOTS: readonly GuidedShot[] = [
  {
    key: 'front-left',
    angleCategory: 'exterior',
    title: 'Prednja dijagonala',
    hint: 'Stani na prednji lijevi kut, cijeli auto u kadru',
  },
  {
    key: 'side',
    angleCategory: 'exterior',
    title: 'Profil',
    hint: 'Bocna strana, okomito na auto',
  },
  {
    key: 'rear-right',
    angleCategory: 'exterior',
    title: 'Straznja dijagonala',
    hint: 'Straznji desni kut, cijeli auto u kadru',
  },
  {
    key: 'rear',
    angleCategory: 'exterior',
    title: 'Straga',
    hint: 'Ravno iza auta',
  },
  {
    key: 'dashboard',
    angleCategory: 'interior',
    title: 'Kokpit',
    hint: 'S vozacevog sjedala: volan, ploca, ekran',
  },
  {
    key: 'seats',
    angleCategory: 'interior',
    title: 'Sjedala',
    hint: 'Kroz otvorena vrata, prednja sjedala',
  },
  {
    key: 'odometer',
    angleCategory: 'detail',
    title: 'Kilometraza',
    hint: 'Kontakt ukljucen, brojac ostro',
  },
  {
    key: 'wheel',
    angleCategory: 'detail',
    title: 'Kotac',
    hint: 'Prednji kotac izbliza, felga u sredini',
  },
];
