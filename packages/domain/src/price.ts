/**
 * Price formatting (13.1 - ODLUCENO).
 *
 * Format: `€23.990,-` - never decimals, anywhere. Identical everywhere:
 * card, listing page, notifications, dashboard, PDF. A listing without a
 * price renders "Na upit" in the same style, never an empty bar.
 *
 * Styling (bold italic black on cyan) is the UI's job; this returns text.
 */

/** Label used when the listing has no price (13.1). */
export const PRICE_ON_REQUEST = 'Na upit';

/**
 * Formats a whole-euro amount as `€23.990,-`.
 * Prices are stored as whole euros (rounded at input time, 13.1); a
 * fractional value here is a programming error upstream, so it throws
 * rather than silently rounding.
 */
export function formatPrice(priceEur: number | null | undefined): string {
  if (priceEur === null || priceEur === undefined) return PRICE_ON_REQUEST;
  if (!Number.isFinite(priceEur) || priceEur < 0) {
    throw new Error(`Neispravna cijena: ${priceEur}`);
  }
  if (!Number.isInteger(priceEur)) {
    throw new Error(`Cijena mora biti cijeli euro (13.1), primljeno: ${priceEur}`);
  }
  const grouped = priceEur.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `€${grouped},-`;
}

/** Rounds a raw input amount to whole euros - applied at input time (13.1). */
export function roundPriceInput(raw: number): number {
  if (!Number.isFinite(raw) || raw < 0) throw new Error(`Neispravan unos cijene: ${raw}`);
  return Math.round(raw);
}
