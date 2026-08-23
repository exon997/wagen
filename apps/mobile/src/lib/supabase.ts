import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createExpoClient } from '@wagen/supabase';

/**
 * Lijena inicijalizacija: nedostatak konfiguracije NIKAD ne smije srusiti
 * aplikaciju na startu (lekcija iz buildova #2-#5: EAS ne nosi .env.local,
 * pa je modul-level throw rusio app prije prvog ekrana). Vrijednosti dolaze
 * iz eas.json env-a (buildovi) ili root .env.local (dev server).
 */
type Client = ReturnType<typeof createExpoClient>;
let client: Client | null = null;

function getConfig(): { url: string; publishableKey: string } | null {
  const extra = Constants.expoConfig?.extra as
    { supabaseUrl?: string; supabasePublishableKey?: string } | undefined;
  const url = extra?.supabaseUrl ?? process.env['EXPO_PUBLIC_SUPABASE_URL'];
  const publishableKey =
    extra?.supabasePublishableKey ?? process.env['EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
  return url && publishableKey ? { url, publishableKey } : null;
}

export function getSupabase(): Client | null {
  if (client) return client;
  const config = getConfig();
  if (!config) {
    console.warn('Supabase konfiguracija nedostaje - app radi lokalno, sync iskljucen');
    return null;
  }
  client = createExpoClient(config, AsyncStorage);
  return client;
}

/**
 * Anonimna sesija je prvorazredno stanje (4.3): app se koristi bez prijave,
 * identitet se trazi tek kod objave (SMS OTP). Poziva se na startu - ako
 * sesije nema, stvara se anonimna; postojeca (anonimna ili puna) se zadrzava.
 */
export async function ensureSession() {
  const supabase = getSupabase();
  if (!supabase) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) return session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.session;
}
