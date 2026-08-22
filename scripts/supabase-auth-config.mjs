/**
 * B11: Auth konfiguracija cloud Supabase projekta kroz Management API.
 *
 * Primjena odluka iz dokumenta na cloud okolinu: anonimne sesije (4.3),
 * SMS OTP kroz Twilio (5.2 - ODLUCENO), Google OAuth (5.1), wagen://
 * deep link redirecti (4.2, 5.2).
 *
 * Pokretanje:  node scripts/supabase-auth-config.mjs <project-ref>
 * Cita vrijednosti iz .env.local u rootu. Za prod na launchu: isti poziv
 * s prod refom (Twilio/Google vrijednosti vrijede za oba).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRef = process.argv[2];
if (!projectRef) {
  console.error('Upotreba: node scripts/supabase-auth-config.mjs <project-ref>');
  process.exit(1);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)="(.*)"/.exec(line.trim());
  if (m) env[m[1]] = m[2];
}

const required = [
  'SUPABASE_ACCESS_TOKEN',
  'TWILIO_ACCOUNT_SID',
  'SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN',
  'TWILIO_MESSAGING_SERVICE_SID',
  'SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID',
  'SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET',
];
const missing = required.filter((k) => !env[k]);
if (missing.length) {
  console.error(`Nedostaje u .env.local: ${missing.join(', ')}`);
  process.exit(1);
}

const body = {
  // 4.3 ODLUCENO: anonimna sesija je prvorazredno stanje
  external_anonymous_users_enabled: true,
  // 3.2/5.2: SMS OTP je jedini put do identiteta kod objave; Twilio ODLUCENO
  external_phone_enabled: true,
  sms_provider: 'twilio',
  sms_twilio_account_sid: env.TWILIO_ACCOUNT_SID,
  sms_twilio_auth_token: env.SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN,
  sms_twilio_message_service_sid: env.TWILIO_MESSAGING_SERVICE_SID,
  sms_template: 'wagen kod: {{ .Code }}',
  // 5.1: Google (Apple obavezan prije App Store objave - dodaje se ovdje)
  external_google_enabled: true,
  external_google_client_id: env.SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID,
  external_google_secret: env.SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET,
  // 5.2: magic link / OAuth povratak mora otvoriti aplikaciju
  uri_allow_list: 'wagen://,wagen://auth/callback',
};

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});
const json = await res.json();
if (!res.ok) {
  console.error(`GRESKA ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  process.exit(1);
}
console.log(`Auth konfiguriran za ${projectRef}:`);
console.log('  anonimne sesije :', json.external_anonymous_users_enabled);
console.log('  telefon/OTP     :', json.external_phone_enabled, '| provider:', json.sms_provider);
console.log('  google          :', json.external_google_enabled);
console.log('  redirect lista  :', json.uri_allow_list);
