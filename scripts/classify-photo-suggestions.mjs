/**
 * Prijedlozi fotografiranja znacajki (v1.1 mehanizam - demo/backfill).
 * Za svaki kod opreme: treba li predloziti dodatni kadar? Klasificira se
 * JEDNOM po kodu (ista filozofija kao prijevod) uz poznavanje standardnih
 * 16 kadrova. Pokretanje: node scripts/classify-photo-suggestions.mjs <ref>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const projectRef = process.argv[2];
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)="(.*)"/.exec(line.trim());
  if (m) env[m[1]] = m[2];
}

const keysRes = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/api-keys?reveal=true`,
  { headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` } },
);
const keys = await keysRes.json();
const secret = keys.find((k) => k.type === 'secret' || k.name === 'service_role')?.api_key;

const codesRes = await fetch(
  `https://${projectRef}.supabase.co/rest/v1/equipment_codes?select=code,name_hr&manufacturer=eq.BMW&order=code`,
  { headers: { apikey: secret, Authorization: `Bearer ${secret}` } },
);
const codes = await codesRes.json();

const SYSTEM = `Ti si asistent foto-vodica aplikacije za prodaju rabljenih auta.
Standardnih 16 kadrova vec pokriva: 6 kutova eksterijera, prednji lijevi kotac (felge), pogled kroz vozaceva i suvozaceva vrata (sjedala, armatura, volan), instrument plocu, sredinu armature (glavni display, ventilacija), sredisnju konzolu (prekidaci), straznju klupu, vozacev POV, otvoren prtljaznik.
Za svaki kod opreme odluci: treba li PREDLOZITI dodatni kadar te znacajke?
DA samo ako je: (1) vizualno demonstrabilna, (2) NIJE vec vidljiva u standardnim kadrovima, (3) kupcu prodajni adut.
NE za: administrativno (norme, jezik, servisni intervali, rashladni medij), nevidljivo (softver, usluge, asistenti bez posebnog fizickog elementa), vec pokriveno standardnim kadrovima (volan, sjedala, felge, displayi, prekidaci na konzoli, boja).
Za suggest=true daj i rank prodajne vrijednosti (5 = najjaci adut) te kratku uputu kako slikati (max 8 rijeci, hrvatski). Za suggest=false stavi rank 1 i prazan hint.`;

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const response = await client.messages.create({
  model: 'claude-opus-5',
  max_tokens: 16000,
  system: SYSTEM,
  messages: [
    {
      role: 'user',
      content:
        'Kodovi opreme BMW X1:\n' +
        codes.map((c) => `${c.code}: ${c.name_hr}`).join('\n') +
        '\n\nVrati odluku za SVE kodove.',
    },
  ],
  output_config: {
    format: {
      type: 'json_schema',
      schema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                suggest: { type: 'boolean' },
                rank: { type: 'integer' },
                hint: { type: 'string' },
              },
              required: ['code', 'suggest', 'rank', 'hint'],
              additionalProperties: false,
            },
          },
        },
        required: ['items'],
        additionalProperties: false,
      },
    },
  },
});

const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';
const parsed = JSON.parse(text);
const nameOf = (code) => codes.find((c) => c.code === code)?.name_hr ?? code;

// PATCH u bazu - SAMO foto polja; prijevodi i translation_status se NE diraju
for (const i of parsed.items) {
  const rank = Math.max(1, Math.min(5, i.rank ?? 1));
  await fetch(
    `https://${projectRef}.supabase.co/rest/v1/equipment_codes?manufacturer=eq.BMW&code=eq.${encodeURIComponent(i.code)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: secret,
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        photo_suggest: i.suggest,
        photo_rank: i.suggest ? rank : null,
        photo_hint: i.suggest ? i.hint : null,
      }),
    },
  );
}
const yes = parsed.items.filter((i) => i.suggest);
const no = parsed.items.filter((i) => !i.suggest);
console.log(`PREDLAZE SE FOTOGRAFIRANJE (${yes.length}/${codes.length}):`);
for (const i of yes) console.log(`  + ${nameOf(i.code)}  ->  ${i.hint}`);
console.log(`\nNE PREDLAZE SE (${no.length}) - primjeri:`);
for (const i of no.slice(0, 10)) console.log(`  - ${nameOf(i.code)}`);
