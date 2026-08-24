/**
 * E3 ops: batch prijevod neprevedenih equipment_codes na cloud okolini.
 * Koristi KANONSKI adapter (packages/adapters/src/equipment) - isti kod
 * koji ce vrtjeti Node worker; ovo je rucno pokretanje do Sprinta 3/4.
 *
 * Pokretanje: node scripts/translate-equipment.mjs <project-ref> [limit]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AnthropicEquipmentTranslator,
  ensureEquipmentCode,
} from '../packages/adapters/src/equipment/index.ts';

const projectRef = process.argv[2];
const limit = Number(process.argv[3] ?? 500);
if (!projectRef) {
  console.error('Upotreba: node scripts/translate-equipment.mjs <project-ref> [limit]');
  process.exit(1);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)="(.*)"/.exec(line.trim());
  if (m) env[m[1]] = m[2];
}
if (!env.ANTHROPIC_API_KEY || !env.SUPABASE_ACCESS_TOKEN) {
  console.error('Nedostaje ANTHROPIC_API_KEY ili SUPABASE_ACCESS_TOKEN u .env.local');
  process.exit(1);
}

// Service kljuc kroz Management API - tajne ne zive u skripti
const keysRes = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/api-keys?reveal=true`,
  {
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` },
  },
);
const keys = await keysRes.json();
const secret = keys.find((k) => k.type === 'secret' || k.name === 'service_role')?.api_key;
if (!secret) {
  console.error('Service kljuc nije dohvacen');
  process.exit(1);
}
const base = `https://${projectRef}.supabase.co/rest/v1`;
const headers = {
  apikey: secret,
  Authorization: `Bearer ${secret}`,
  'Content-Type': 'application/json',
};

// EquipmentCodeRepository nad cloud REST-om (sucelje iz adaptera)
const repo = {
  async find(manufacturer, code) {
    const res = await fetch(
      `${base}/equipment_codes?manufacturer=eq.${encodeURIComponent(manufacturer)}&code=eq.${encodeURIComponent(code)}&limit=1`,
      { headers },
    );
    const rows = await res.json();
    const r = rows[0];
    return r
      ? {
          manufacturer: r.manufacturer,
          code: r.code,
          nameEn: r.name_en,
          nameHr: r.name_hr,
          translationStatus: r.translation_status,
        }
      : null;
  },
  async saveMachineTranslation(row) {
    await fetch(
      `${base}/equipment_codes?manufacturer=eq.${encodeURIComponent(row.manufacturer)}&code=eq.${encodeURIComponent(row.code)}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          name_en: row.nameEn,
          name_hr: row.nameHr,
          translation_status: 'machine_translated',
        }),
      },
    );
  },
};

const pendingRes = await fetch(
  `${base}/equipment_codes?select=manufacturer,code,name_en&translation_status=eq.untranslated&limit=${limit}`,
  { headers },
);
const pending = await pendingRes.json();
console.log(`Neprevedenih: ${pending.length} (limit ${limit})`);

const translator = new AnthropicEquipmentTranslator({ apiKey: env.ANTHROPIC_API_KEY });
let done = 0;
for (const row of pending) {
  try {
    const result = await ensureEquipmentCode(repo, translator, {
      manufacturer: row.manufacturer,
      code: row.code,
      nameEn: row.name_en,
    });
    done += 1;
    console.log(`${done}/${pending.length} ${row.code}: "${row.name_en}" -> "${result.nameHr}"`);
  } catch (e) {
    console.error(`${row.code} PALO:`, e.message ?? e);
  }
}
console.log(
  `Gotovo: ${done}/${pending.length} prevedeno (status machine_translated - ceka admin review, 18.3)`,
);
