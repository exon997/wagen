/**
 * Listing title generation (13.1 - ODLUCENO).
 *
 * The title is generated from structured data, never free text. The seller
 * does not type it - the system assembles it from VIN decoding and fields.
 *
 * Line 1: first registration year + make + model + equipment package
 *   e.g. "2018 BMW X1 M Sport"
 * Line 2: engine label + transmission
 *   e.g. "sDrive20i Automatik"
 */

export interface TitleInput {
  firstRegistrationYear?: number | null;
  make: string;
  model: string;
  /** Equipment package / trim, e.g. "M Sport" - from VIN decode or DMS. */
  trim?: string | null;
  /** Engine designation, e.g. "sDrive20i", "2.0 TDI". */
  engineLabel?: string | null;
  /** Croatian transmission label, e.g. "Automatik", "Rucni". */
  transmissionLabel?: string | null;
}

export interface ListingTitle {
  line1: string;
  line2: string;
}

export function generateListingTitle(input: TitleInput): ListingTitle {
  const line1 = [
    input.firstRegistrationYear ? String(input.firstRegistrationYear) : null,
    input.make.trim(),
    input.model.trim(),
    input.trim?.trim() || null,
  ]
    .filter(Boolean)
    .join(' ');

  const line2 = [input.engineLabel?.trim() || null, input.transmissionLabel?.trim() || null]
    .filter(Boolean)
    .join(' ');

  return { line1, line2 };
}

/**
 * SEO slug from the generated title + short id suffix (17.1):
 * "2018-bmw-x1-m-sport-sdrive20i" + "-a4f7". Stable once assigned (15.6).
 */
export function generateListingSlug(input: TitleInput, shortId: string): string {
  const { line1, line2 } = generateListingTitle(input);
  const base = `${line1} ${line2}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base}-${shortId}`;
}
