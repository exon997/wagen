/**
 * Canonical listing model (zod). This is the shape adapters map INTO (12.1)
 * and apps consume - the DB rows are its persistence, Meilisearch its index.
 */
import { z } from 'zod';

export const listingStatusSchema = z.enum(['draft', 'pending', 'active', 'sold', 'removed']);
export type ListingStatus = z.infer<typeof listingStatusSchema>;

export const photoAngleSchema = z.enum(['exterior', 'interior', 'detail']);
export type PhotoAngle = z.infer<typeof photoAngleSchema>;

export const DEFAULT_MARKET = 'HR';
/** Header carrying the requesting market; RLS reads it (B9). */
export const MARKET_HEADER = 'x-wagen-market';

/** Common columns per 15.2 - universal and always filtered. */
export const listingCommonSchema = z.object({
  id: z.uuid(),
  market: z.string().default(DEFAULT_MARKET),
  categoryId: z.uuid(),
  vehicleId: z.uuid(),
  userId: z.uuid().nullable(),
  dealerId: z.uuid().nullable(),
  status: listingStatusSchema,
  /** Whole euros (13.1); null = "Na upit". */
  priceCurrent: z.number().int().nonnegative().nullable(),
  /** Property of the transaction, not the seller (13.1). */
  vatDeductible: z.boolean().default(false),
  firstRegistrationYear: z.number().int().min(1900).max(2100).nullable(),
  mileageKm: z.number().int().nonnegative().nullable(),
  locationCity: z.string().nullable(),
  attributes: z.record(z.string(), z.unknown()).default({}),
  description: z.string().nullable(),
  slug: z.string().nullable(),
});
export type ListingCommon = z.infer<typeof listingCommonSchema>;

/** Owner rule from 15.5: user XOR dealer. */
export const listingOwnerValid = (l: Pick<ListingCommon, 'userId' | 'dealerId'>): boolean =>
  (l.userId === null) !== (l.dealerId === null);

// ---------------------------------------------------------------------------
// Category attributes (15.2): definitions drive a dynamically built zod
// schema, so listings.attributes is validated against category_attributes
// at application level - one mechanism for every category, current and future.
// ---------------------------------------------------------------------------

export const attributeDataTypeSchema = z.enum(['text', 'number', 'boolean', 'enum']);
export type AttributeDataType = z.infer<typeof attributeDataTypeSchema>;

export interface CategoryAttributeDef {
  key: string;
  label: string;
  dataType: AttributeDataType;
  unit?: string | null;
  enumValues?: readonly { value: string; label: string }[] | null;
  isRequired: boolean;
  isFilterable: boolean;
  displayOrder: number;
}

/**
 * Builds the validator for listings.attributes from the category's
 * definitions. Unknown keys are rejected - a typo must fail loudly, not
 * silently persist garbage into JSONB.
 */
export function buildAttributesSchema(defs: readonly CategoryAttributeDef[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const def of defs) {
    let base: z.ZodType;
    switch (def.dataType) {
      case 'text':
        base = z.string();
        break;
      case 'number':
        base = z.number().finite();
        break;
      case 'boolean':
        base = z.boolean();
        break;
      case 'enum': {
        const values = (def.enumValues ?? []).map((v) => v.value);
        if (values.length === 0) {
          throw new Error(`Atribut "${def.key}" je enum bez vrijednosti - neispravna definicija`);
        }
        base = z.enum(values as [string, ...string[]]);
        break;
      }
    }
    shape[def.key] = def.isRequired ? base : base.optional();
  }
  return z.strictObject(shape);
}
