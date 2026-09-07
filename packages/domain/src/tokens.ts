/**
 * Design tokens (6.3). Shared as DATA between web and mobile - components
 * are deliberately not shared (no packages/ui in v1).
 */
export const colors = {
  /**
   * Accent - CTA buttons, highlights, hover states, icons, the price bar.
   * NEVER as text color on a white background (fails WCAG AA - 6.3).
   * Black text on cyan passes contrast (13.1 price bar).
   */
  cyan: '#1EDCE8',
  gray: '#808080',
  black: '#000000',
  white: '#FFFFFF',
} as const;

export type ColorToken = keyof typeof colors;

/**
 * AlphaOne (dealer aplikacija) - VLASTITI identitet, odvojen od oglasnika
 * (odluka vlasnika 2026-09-07). Svijetla tema, font Exo 2.
 * Disciplina tri boje: amber = akcije/navigacija; green = ISKLJUCIVO
 * odabrano/uspjeh (uvijek uz tekstualnu oznaku - daltonizam); red =
 * ISKLJUCIVO okidac kamere. Radne vrijednosti do finalnog identiteta.
 */
export const alphaone = {
  /** Akcije, navigacijske ikone, primarni CTA (crni tekst na njoj). */
  amber: '#F9A51A',
  /** Samo odabrano/uspjeh stanja. */
  green: '#2FBF4F',
  /** Samo okidac kamere. */
  red: '#E5382A',
  /** Podloga ekrana. */
  bg: '#ECECEC',
  /** Kartice. */
  card: '#FFFFFF',
  /** Sekundarne plocice unutar kartica. */
  cardAlt: '#E8E8E8',
  /** Primarni tekst. */
  ink: '#111111',
  /** Sekundarni tekst. */
  muted: '#6F6F6F',
  /** Obrub neaktivnih elemenata. */
  line: '#9A9A9A',
} as const;

export type AlphaOneColorToken = keyof typeof alphaone;
