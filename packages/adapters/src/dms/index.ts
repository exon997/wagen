/**
 * D1: DMS adapter interface (12.1, 12.2).
 *
 * One canonical record shape, one adapter per source (AutoBrief first,
 * mobile.de format later). The sync engine in the Node worker maps records
 * into vehicles/listings.
 *
 * FIELD OWNERSHIP IS STRUCTURAL (12.2, 15.3): DmsVehicleRecord contains
 * ONLY DMS-owned fields. There is deliberately no badge, no TOP status, no
 * photo ordering, no enriched description here - an adapter CANNOT express
 * enrichment data, so no adapter bug can ever overwrite it. The type system
 * enforces what section 12.2 demands.
 */

/** A photo as delivered by the DMS feed - no angle category (13.3 fallback). */
export interface DmsPhoto {
  url: string;
  sortOrder: number;
}

/** DMS-owned fields only - see the header note. */
export interface DmsVehicleRecord {
  /** Stable id of the vehicle within the source DMS (sync anchor). */
  externalId: string;
  vin: string | null;
  make: string;
  model: string;
  trim: string | null;
  engineLabel: string | null;
  firstRegistrationYear: number | null;
  mileageKm: number | null;
  /** Whole euros (13.1); null = "Na upit". */
  priceEur: number | null;
  /** "Povrat PDV-a moguc" - mapped from the source feed (13.1). */
  vatDeductible: boolean;
  /** Category attribute values keyed by category_attributes.key. */
  attributes: Record<string, unknown>;
  /** Plain seller description from the DMS - NOT wagen enrichment. */
  description: string | null;
  photos: DmsPhoto[];
  /** Factory equipment/option codes for the equipment dictionary (12.3). */
  equipmentCodes: string[];
  /** False = vehicle left stock; sync marks the listing removed/sold. */
  inStock: boolean;
  /** Verbatim source payload for debugging and mapping evolution. */
  raw: unknown;
}

export interface DmsDealerConfig {
  /** wagen dealer id this feed belongs to. */
  dealerId: string;
  /** Source-specific connection details (feed URL, credentials reference). */
  connection: Record<string, string>;
}

export interface DmsFetchResult {
  records: DmsVehicleRecord[];
  fetchedAt: Date;
  /** Source-reported warnings that should reach the sync log. */
  warnings: string[];
}

/**
 * One implementation per DMS source. Implementations live next to this
 * interface; the worker chooses by `source`.
 */
export interface DmsAdapter {
  /** Stable source key, e.g. 'autobrief', 'mobile_de'. */
  readonly source: string;
  /** Fetches the full current inventory for one dealer (12.1: full-state
   *  sync, not deltas - the feed is the truth for DMS-owned fields). */
  fetchInventory(config: DmsDealerConfig): Promise<DmsFetchResult>;
}

/**
 * Mock adapter for tests and local development. Returns a fixed inventory;
 * a test can also inject records to simulate feed states.
 */
export class MockDmsAdapter implements DmsAdapter {
  readonly source = 'mock';

  constructor(private readonly records: DmsVehicleRecord[] = []) {}

  fetchInventory(_config: DmsDealerConfig): Promise<DmsFetchResult> {
    return Promise.resolve({
      records: this.records,
      fetchedAt: new Date(),
      warnings: [],
    });
  }
}
