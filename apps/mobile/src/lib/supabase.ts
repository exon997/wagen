import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createExpoClient } from '@wagen/supabase';

const extra = Constants.expoConfig?.extra as
  { supabaseUrl?: string; supabasePublishableKey?: string } | undefined;

if (!extra?.supabaseUrl || !extra.supabasePublishableKey) {
  throw new Error('Supabase konfiguracija nedostaje - provjeri .env.local u rootu monorepa');
}

export const supabase = createExpoClient(
  { url: extra.supabaseUrl, publishableKey: extra.supabasePublishableKey },
  AsyncStorage,
);

/**
 * Anonimna sesija je prvorazredno stanje (4.3): app se koristi bez prijave,
 * identitet se trazi tek kod objave (SMS OTP). Poziva se na startu - ako
 * sesije nema, stvara se anonimna; postojeca (anonimna ili puna) se zadrzava.
 */
export async function ensureSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) return session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.session;
}
