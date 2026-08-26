// Faza A (sekcija 9): onboarding salona u wagen-dev/prod - kreira dealera,
// pozivnicu po telefonu i ucita branding assete (pozadina studija + grafika
// reklamne tablice) u dealer-assets bucket.
//
// Upotreba:
//   node scripts/setup-dealer.mjs \
//     --name "Autosalon Demo" --legal "Autosalon Demo d.o.o." --oib 00000000001 \
//     --phone 385911234567 \
//     [--background put/do/pozadine.png] [--plate put/do/tablice.png] \
//     [--url https://<ref>.supabase.co]   (default: EXPO_PUBLIC_SUPABASE_URL)
//
// Tajne cita iz .env.local (SUPABASE_SECRET_KEY). Idempotentno: dealer se
// prepoznaje po (market, oib), pozivnica po (dealer, phone), asseti se
// prepisuju (x-upsert).
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(resolve(root, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
}
const required = ['name', 'legal', 'oib', 'phone'];
for (const key of required) {
  if (!args[key]) {
    console.error(`Nedostaje --${key}`);
    process.exit(1);
  }
}

const url = args.url ?? env.EXPO_PUBLIC_SUPABASE_URL;
// process.env ima prednost - .env.local drzi kljuc LOKALNOG stacka
const secret = process.env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error('Nedostaje EXPO_PUBLIC_SUPABASE_URL ili SUPABASE_SECRET_KEY u .env.local');
  process.exit(1);
}
const headers = { apikey: secret, Authorization: `Bearer ${secret}` };

async function rest(method, path, body, extra = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: { ...headers, 'Content-Type': 'application/json', ...extra },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

async function uploadAsset(dealerId, localPath, remoteName) {
  const data = readFileSync(resolve(localPath));
  const objectPath = `${dealerId}/${remoteName}`;
  const res = await fetch(`${url}/storage/v1/object/dealer-assets/${objectPath}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'image/png', 'x-upsert': 'true' },
    body: data,
  });
  if (!res.ok) throw new Error(`Upload ${remoteName}: HTTP ${res.status} ${await res.text()}`);
  return objectPath;
}

// 1) Dealer (idempotentno po market+oib)
const [dealer] = await rest(
  'POST',
  'dealers?on_conflict=market,tax_id',
  {
    market: 'HR',
    legal_name: args.legal,
    display_name: args.name,
    tax_id: args.oib,
    status: 'active',
    contact_phone: args.phone,
  },
  { Prefer: 'resolution=merge-duplicates,return=representation' },
);
console.log(`Dealer: ${dealer.display_name} (${dealer.id})`);

// 2) Branding asseti
const patch = {};
if (args.background) {
  patch.studio_background_path = await uploadAsset(dealer.id, args.background, 'studio-background.png');
  console.log(`Pozadina: ${patch.studio_background_path}`);
}
if (args.plate) {
  patch.plate_overlay_path = await uploadAsset(dealer.id, args.plate, 'plate-overlay.png');
  console.log(`Tablica: ${patch.plate_overlay_path}`);
}
if (Object.keys(patch).length > 0) {
  await rest('PATCH', `dealers?id=eq.${dealer.id}`, patch);
}

// 3) Pozivnica (idempotentno po dealer+phone)
await rest(
  'POST',
  'dealer_invites?on_conflict=dealer_id,phone',
  { dealer_id: dealer.id, phone: args.phone, role: 'owner' },
  { Prefer: 'resolution=merge-duplicates' },
);
console.log(`Pozivnica za ${args.phone} spremna - prijava u aplikaciji: Salon -> telefon -> SMS kod.`);
