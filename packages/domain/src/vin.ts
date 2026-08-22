/**
 * E1: Local ISO VIN parsing (3.2) - the fallback layer under Outvin.
 *
 * Jobs: rough validation before spending an Outvin call, WMI -> manufacturer
 * for unsupported makes, production year estimate, and oldtimer detection
 * (non-standard/short VIN, typically pre-~1981 -> straight to manual entry,
 * no Outvin attempt).
 *
 * Pure TS, no network, fully testable.
 */

/** Valid VIN characters exclude I, O, Q (ISO 3779). */
const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

/**
 * WMI prefix -> manufacturer. Grows from real traffic; covers the Outvin
 * supported list (3.2) plus common EU imports. Longest-prefix match wins.
 */
const WMI_MANUFACTURERS: Readonly<Record<string, string>> = {
  // BMW group
  WBA: 'BMW',
  WBS: 'BMW',
  WBY: 'BMW',
  WMW: 'Mini',
  // Mercedes-Benz / Smart
  WDB: 'Mercedes-Benz',
  WDD: 'Mercedes-Benz',
  WDC: 'Mercedes-Benz',
  W1K: 'Mercedes-Benz',
  W1N: 'Mercedes-Benz',
  WME: 'Smart',
  // VW group
  WVW: 'Volkswagen',
  WV1: 'Volkswagen',
  WV2: 'Volkswagen',
  WAU: 'Audi',
  TRU: 'Audi',
  WA1: 'Audi',
  TMB: 'Škoda',
  VSS: 'Seat',
  WP0: 'Porsche',
  WP1: 'Porsche',
  // FCA / Stellantis
  ZFA: 'Fiat',
  ZAR: 'Alfa Romeo',
  ZLA: 'Lancia',
  W0L: 'Opel',
  W0V: 'Opel',
  VF3: 'Peugeot',
  VF7: 'Citroën',
  VR3: 'Peugeot',
  VR7: 'Citroën',
  VXK: 'Opel',
  // Renault group
  VF1: 'Renault',
  VF2: 'Renault',
  UU1: 'Dacia',
  // JLR
  SAL: 'Land Rover',
  SAJ: 'Jaguar',
  SAD: 'Jaguar',
  // Volvo / Polestar
  YV1: 'Volvo',
  YV4: 'Volvo',
  LPS: 'Polestar',
  // Toyota / Lexus
  JTD: 'Toyota',
  JTE: 'Toyota',
  JTH: 'Lexus',
  JTJ: 'Lexus',
  SB1: 'Toyota',
  JTM: 'Toyota',
  // Korean
  KMH: 'Hyundai',
  TMA: 'Hyundai',
  KNA: 'Kia',
  KND: 'Kia',
  U5Y: 'Kia',
  U6Y: 'Kia',
  // Japanese
  JN1: 'Nissan',
  SJN: 'Nissan',
  JMZ: 'Mazda',
  JM1: 'Mazda',
  // Ford
  WF0: 'Ford',
  // US brands
  '1G1': 'Chevrolet',
  '1GC': 'Chevrolet',
  '2G1': 'Chevrolet',
  '1GT': 'GMC',
  '1G6': 'Cadillac',
  '1G4': 'Buick',
  '1C3': 'Chrysler',
  '1C4': 'Chrysler',
  '1C6': 'Dodge',
  '2C3': 'Chrysler',
  '1J4': 'Jeep',
  '1J8': 'Jeep',
  '5YJ': 'Tesla',
  XP7: 'Tesla',
  '5GT': 'Hummer',
};

/** ISO 3779 model-year codes (position 10). I, O, Q, U, Z and 0 are not used. */
const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789';

export interface LocalVinDecode {
  valid: boolean;
  /** Raw 3-char WMI, always present for a structurally valid VIN. */
  wmi: string | null;
  manufacturer: string | null;
  /** Production year estimate from position 10 (30-year cycle resolved to
   *  the most recent plausible year). Null when the code is unused ('0'). */
  year: number | null;
  /** Non-standard/short VIN - straight to manual entry, skip Outvin (3.2). */
  likelyOldtimer: boolean;
}

/** Structural validation only - EU VINs do not reliably carry a check digit. */
export function isStructurallyValidVin(vin: string): boolean {
  return VIN_REGEX.test(vin.toUpperCase());
}

/**
 * North American check digit (position 9, ISO 3779). Only meaningful for
 * WMIs 1-5 - validating EU VINs against it produces false negatives.
 */
export function checkDigitValid(vin: string): boolean {
  const v = vin.toUpperCase();
  if (!VIN_REGEX.test(v)) return false;
  const transliteration: Record<string, number> = {
    A: 1,
    B: 2,
    C: 3,
    D: 4,
    E: 5,
    F: 6,
    G: 7,
    H: 8,
    J: 1,
    K: 2,
    L: 3,
    M: 4,
    N: 5,
    P: 7,
    R: 9,
    S: 2,
    T: 3,
    U: 4,
    V: 5,
    W: 6,
    X: 7,
    Y: 8,
    Z: 9,
  };
  const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = v[i]!;
    const value = /\d/.test(ch) ? Number(ch) : (transliteration[ch] ?? 0);
    sum += value * weights[i]!;
  }
  const remainder = sum % 11;
  const expected = remainder === 10 ? 'X' : String(remainder);
  return v[8] === expected;
}

/**
 * Resolves the 30-year model-year cycle: returns the most recent candidate
 * not in the future (relative to `now`).
 */
function resolveYear(code: string, now: Date): number | null {
  const idx = YEAR_CODES.indexOf(code);
  if (idx === -1) return null;
  const currentYear = now.getFullYear();
  // Cycle anchors: 'A' = 1980, 2010, 2040...
  for (let anchor = 2040; anchor >= 1980; anchor -= 30) {
    const candidate = anchor + idx;
    if (candidate <= currentYear + 1) return candidate; // +1: next-model-year VINs exist
  }
  return null;
}

export function decodeVinLocally(rawVin: string, now: Date = new Date()): LocalVinDecode {
  const vin = rawVin.trim().toUpperCase();

  if (!VIN_REGEX.test(vin)) {
    return {
      valid: false,
      wmi: null,
      manufacturer: null,
      year: null,
      // Short but plausible-looking chassis numbers = pre-standard vehicles
      // (oldtimeri, 3.2). Garbage input is just invalid, not an oldtimer.
      likelyOldtimer: /^[A-HJ-NPR-Z0-9]{5,16}$/.test(vin),
    };
  }

  const wmi = vin.slice(0, 3);
  const manufacturer = WMI_MANUFACTURERS[wmi] ?? WMI_MANUFACTURERS[vin.slice(0, 2)] ?? null;
  const year = resolveYear(vin[9]!, now);

  return { valid: true, wmi, manufacturer, year, likelyOldtimer: false };
}
