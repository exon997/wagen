/**
 * E2: VIN decode adapter (3.2) - kanonski rezultat, pruzatelj zamjenjiv.
 *
 * Isti princip kao DMS/fiskalizacija/email: wagen definira sto treba,
 * konkretni API (Outvin, vindata...) je implementacija. Server-side cache
 * zivi u public.vehicles (15.1); adapter NE dira bazu - vraca rezultat,
 * perzistencija je posao pozivatelja (API ruta / worker).
 */

export interface VinEquipmentItem {
  /** Tvornicki option kod kad postoji (za equipment_codes rjecnik, 13.4). */
  code: string | null;
  name: string;
}

export interface VinDecodeResult {
  found: boolean;
  make: string | null;
  model: string | null;
  /** Paket opreme za naslov (13.1), npr. "M Sport". */
  trim: string | null;
  /** Motorizacija za naslov, npr. "sDrive20i", "2.0 TDI". */
  engineLabel: string | null;
  modelYear: number | null;
  fuel: string | null;
  transmission: string | null;
  powerKw: number | null;
  equipment: VinEquipmentItem[];
  /** Sirovi odgovor pruzatelja - trajno se sprema uz vozilo (15.1). */
  raw: unknown;
}

export interface VinDecodeAdapter {
  /** Stabilan kljuc pruzatelja, npr. 'vindata', 'outvin'. */
  readonly provider: string;
  decode(vin: string): Promise<VinDecodeResult>;
}

const EMPTY: Omit<VinDecodeResult, 'raw'> = {
  found: false,
  make: null,
  model: null,
  trim: null,
  engineLabel: null,
  modelYear: null,
  fuel: null,
  transmission: null,
  powerKw: null,
  equipment: [],
};

/**
 * vindata.io implementacija. NAPOMENA: struktura odgovora nije javno
 * dokumentirana - mapiranje je tolerantno (trazi cesta imena polja) i
 * finalizira se nakon prvih stvarnih odgovora; raw se uvijek cuva pa
 * nista nije izgubljeno ni kod nepotpunog mapiranja.
 */
export class VindataVinAdapter implements VinDecodeAdapter {
  readonly provider = 'vindata';

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://gxvtafqbraaifsnthsyj.supabase.co/functions/v1/api-vin-decode',
  ) {}

  async decode(vin: string): Promise<VinDecodeResult> {
    const response = await fetch(`${this.baseUrl}?vin=${encodeURIComponent(vin)}`, {
      headers: { 'x-api-key': this.apiKey },
    });
    if (response.status === 404) {
      return { ...EMPTY, raw: null };
    }
    if (!response.ok) {
      throw new Error(`vindata ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    const raw: unknown = await response.json();
    return { ...mapResponse(raw), raw };
  }
}

type Dict = Record<string, unknown>;

const asDict = (v: unknown): Dict | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Dict) : null;

function pickString(d: Dict | null, keys: string[]): string | null {
  if (!d) return null;
  for (const key of keys) {
    const v = d[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function pickNumber(d: Dict | null, keys: string[]): number | null {
  if (!d) return null;
  for (const key of keys) {
    const v = d[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v);
  }
  return null;
}

function mapResponse(raw: unknown): Omit<VinDecodeResult, 'raw'> {
  const root = asDict(raw);
  if (!root) return EMPTY;
  // Odgovor moze biti ugnjezden pod data/vehicle/result
  const d = asDict(root['data']) ?? asDict(root['vehicle']) ?? asDict(root['result']) ?? root;

  const make = pickString(d, ['make', 'manufacturer', 'brand']);
  // vindata 'model' spaja model i motorizaciju ("X1 sDrive20i") - prvi token
  // je model, ostatak motorizacija za red 2 naslova (13.1). Heuristika;
  // raw uvijek cuva original.
  const modelRaw = pickString(d, ['model', 'model_name', 'modelName']);
  const spaceIdx = modelRaw?.indexOf(' ') ?? -1;
  const model = spaceIdx > 0 ? modelRaw!.slice(0, spaceIdx) : modelRaw;
  const engineFromModel = spaceIdx > 0 ? modelRaw!.slice(spaceIdx + 1) : null;

  const equipment: VinEquipmentItem[] = [];
  const rawEquipment = d['allOptions'] ?? d['equipment'] ?? d['options'] ?? d['features'];
  if (Array.isArray(rawEquipment)) {
    for (const item of rawEquipment) {
      if (typeof item === 'string' && item.trim()) {
        equipment.push({ code: null, name: item.trim() });
      } else {
        const e = asDict(item);
        const name = pickString(e, ['name', 'description', 'label', 'title']);
        if (name) equipment.push({ code: pickString(e, ['code', 'option_code', 'id']), name });
      }
    }
  }

  return {
    found: !!(make || model),
    make,
    model,
    trim: pickString(d, ['trim', 'trim_level', 'series', 'grade', 'equipment_line']),
    engineLabel:
      pickString(d, ['engine', 'engine_name', 'engine_label', 'motorization']) ?? engineFromModel,
    modelYear: pickNumber(d, ['model_year', 'year', 'modelYear', 'production_year']),
    fuel: pickString(d, ['fuel', 'fuel_type', 'fuelType']),
    transmission: pickString(d, ['transmission', 'gearbox', 'transmission_type']),
    powerKw: pickNumber(d, ['power_kw', 'powerKw', 'kw', 'engine_power_kw']),
    equipment,
  };
}

/** Mock za testove i offline razvoj. */
export class MockVinAdapter implements VinDecodeAdapter {
  readonly provider = 'mock';

  constructor(private readonly results: Record<string, Partial<VinDecodeResult>> = {}) {}

  decode(vin: string): Promise<VinDecodeResult> {
    const hit = this.results[vin];
    return Promise.resolve(
      hit ? { ...EMPTY, raw: null, ...hit, found: true } : { ...EMPTY, raw: null },
    );
  }
}
