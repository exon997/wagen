// KOPIJA mapiranja iz packages/adapters/src/vin/index.ts (mapResponse) -
// odrzavaj rucno u syncu dok functions bundler ne podrzi workspace import.
// Testovi istine zive u packages/adapters/test/vin.test.ts (fixture).

export interface MappedDecode {
  found: boolean;
  make: string | null;
  model: string | null;
  trim: string | null;
  engineLabel: string | null;
  modelYear: number | null;
  equipment: { code: string | null; name: string }[];
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

export function mapVindataResponse(raw: unknown): MappedDecode {
  const empty: MappedDecode = {
    found: false,
    make: null,
    model: null,
    trim: null,
    engineLabel: null,
    modelYear: null,
    equipment: [],
  };
  const root = asDict(raw);
  if (!root) return empty;
  const d = asDict(root['data']) ?? asDict(root['vehicle']) ?? asDict(root['result']) ?? root;

  const make = pickString(d, ['make', 'manufacturer', 'brand']);
  const modelRaw = pickString(d, ['model', 'model_name', 'modelName']);
  const spaceIdx = modelRaw?.indexOf(' ') ?? -1;
  const model = spaceIdx > 0 ? modelRaw!.slice(0, spaceIdx) : modelRaw;
  const engineFromModel = spaceIdx > 0 ? modelRaw!.slice(spaceIdx + 1) : null;

  const equipment: { code: string | null; name: string }[] = [];
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
    equipment,
  };
}
