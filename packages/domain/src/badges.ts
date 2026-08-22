/**
 * Highlight badges (9.6 - ODLUCENO, closed set; "zapisano da se ne reotvara").
 *
 * One badge per listing, wagen's own visual system, NO third-party logos.
 * The DB enum public.badge_type mirrors BADGE_TYPES exactly.
 */

export const BADGE_TYPES = [
  // Grupa 1 - sportska oprema (one internal type; display label by make)
  'sport_paket',
  // Grupa 2 - povijest vozila
  'prvi_vlasnik',
  'kupljen_u_hrvatskoj',
  'uvoz_njemacka',
  'uvoz_svicarska',
  'potpuna_servisna',
  'malo_kilometara',
  // Grupa 3 - oprema i dodaci
  'harman_kardon',
  'bang_olufsen',
  'burmester',
  'nove_gume',
  'zimski_set',
] as const;

export type BadgeType = (typeof BADGE_TYPES)[number];

export type BadgeGroup = 'sport' | 'history' | 'equipment';

export const BADGE_GROUPS: Record<BadgeType, BadgeGroup> = {
  sport_paket: 'sport',
  prvi_vlasnik: 'history',
  kupljen_u_hrvatskoj: 'history',
  uvoz_njemacka: 'history',
  uvoz_svicarska: 'history',
  potpuna_servisna: 'history',
  malo_kilometara: 'history',
  harman_kardon: 'equipment',
  bang_olufsen: 'equipment',
  burmester: 'equipment',
  nove_gume: 'equipment',
  zimski_set: 'equipment',
};

/**
 * Grupa 1 display labels by make (9.6) - a plain lookup table; the make is
 * known from VIN decoding or manual selection. Makes not listed here have no
 * sport package option and do not show Grupa 1 in the picker.
 * Keys are lowercased make names as produced by VIN decoding.
 */
export const SPORT_PAKET_LABELS: Readonly<Record<string, string>> = {
  bmw: 'M Sport paket',
  'mercedes-benz': 'AMG Line',
  audi: 'S line',
  volkswagen: 'R-Line',
  seat: 'FR',
  hyundai: 'N Line',
  kia: 'GT Line',
  peugeot: 'GT Line',
  renault: 'GT Line',
  ford: 'ST-Line',
  skoda: 'Sportline',
  škoda: 'Sportline',
  opel: 'GS Line',
  volvo: 'R-Design',
  toyota: 'GR Sport',
  'alfa romeo': 'Veloce',
};

/**
 * Audio badges are filtered by make (9.6). Conservative OEM pairings only -
 * this list extends from real decode data, never speculation.
 */
export const AUDIO_BADGE_MAKES: Readonly<Partial<Record<BadgeType, readonly string[]>>> = {
  harman_kardon: ['bmw', 'mini'],
  bang_olufsen: ['audi'],
  burmester: ['mercedes-benz', 'porsche'],
};

/** Fixed Croatian labels for Grupa 2 and Grupa 3 badges. */
export const BADGE_LABELS: Readonly<Partial<Record<BadgeType, string>>> = {
  prvi_vlasnik: 'Prvi vlasnik',
  kupljen_u_hrvatskoj: 'Kupljen u Hrvatskoj',
  uvoz_njemacka: 'Uvoz iz Njemačke',
  uvoz_svicarska: 'Uvoz iz Švicarske',
  potpuna_servisna: 'Potpuna servisna povijest',
  malo_kilometara: 'Malo kilometara',
  harman_kardon: 'Harman Kardon',
  bang_olufsen: 'Bang & Olufsen',
  burmester: 'Burmester',
  nove_gume: 'Nove gume',
  zimski_set: 'Zimski set kotača',
};

/** Display label for a badge on a given vehicle make. */
export function badgeDisplayLabel(badge: BadgeType, make: string): string | null {
  if (badge === 'sport_paket') {
    return SPORT_PAKET_LABELS[make.toLowerCase()] ?? null;
  }
  return BADGE_LABELS[badge] ?? null;
}

export interface BadgeContext {
  make: string;
  ownersCount?: number | null;
  /** 'da' | 'ne' | 'djelomicno' - the service_book attribute value. */
  serviceBook?: string | null;
}

/**
 * Can the seller manually pick this badge? Implements the systemic
 * validation from 9.6 - a badge that can be trusted:
 * - prvi_vlasnik      only when owners count = 1
 * - potpuna_servisna  only when service book = 'da'
 * - malo_kilometara   NEVER manually - auto-computed; the km threshold is an
 *   open item (sekcija 20, "provjeriti na stvarnim podacima iz Faze 0")
 * - sport_paket       only for makes with a defined label
 * - audio badges      only for makes with that OEM audio partnership
 */
export function isBadgeSelectable(badge: BadgeType, ctx: BadgeContext): boolean {
  const make = ctx.make.toLowerCase();
  switch (badge) {
    case 'sport_paket':
      return make in SPORT_PAKET_LABELS;
    case 'prvi_vlasnik':
      return ctx.ownersCount === 1;
    case 'potpuna_servisna':
      return ctx.serviceBook === 'da';
    case 'malo_kilometara':
      return false;
    case 'harman_kardon':
    case 'bang_olufsen':
    case 'burmester':
      return (AUDIO_BADGE_MAKES[badge] ?? []).includes(make);
    default:
      return true;
  }
}

/** The badge options a seller sees in the picker for their vehicle. */
export function selectableBadges(ctx: BadgeContext): BadgeType[] {
  return BADGE_TYPES.filter((b) => isBadgeSelectable(b, ctx));
}
