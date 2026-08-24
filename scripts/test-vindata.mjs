/**
 * E2 test: vindata.io s pravim VIN-ovima (trosi kredite - 1 po pozivu,
 * promaseni su besplatni po Kimu). Pokretanje:
 *   node scripts/test-vindata.mjs
 * Cita VINDATA_API_KEY iz .env.local.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)="(.*)"/.exec(line.trim());
  if (m) env[m[1]] = m[2];
}
if (!env.VINDATA_API_KEY) {
  console.error('VINDATA_API_KEY nije u .env.local');
  process.exit(1);
}

const VINS =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : [
        'TMBJJ7NS5J8043174', // Skoda - Kimov primjer s weba (poznat dobar rezultat)
        'WBAJG310303F05030', // BMW - sinov terenski sken
        'WVWZZZ1JZ5W123456', // VW - izmisljen ali validan format (test promasaja)
      ];

const BASE = 'https://gxvtafqbraaifsnthsyj.supabase.co/functions/v1/api-vin-decode';
for (const vin of VINS) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}?vin=${vin}`, { headers: { 'x-api-key': env.VINDATA_API_KEY } });
  const ms = Date.now() - t0;
  let body;
  try {
    body = await res.json();
  } catch {
    body = await res.text();
  }
  console.log(`\n=== ${vin} (HTTP ${res.status}, ${ms}ms) ===`);
  console.log(JSON.stringify(body, null, 2).slice(0, 3000));
}
