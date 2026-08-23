/**
 * G4: Sync lokalnih sesija u public.photo_sessions.
 *
 * Backend od prvog dana prima VIN podatke i draftove (4.5) - svaka lokalna
 * sesija se zrcali u bazu cim nastane/promijeni. RLS osigurava da korisnik
 * (i anonimni, 4.3) pise samo svoje retke. Fotografije idu u Storage u
 * H-bloku; ovdje se sinkroniziraju metapodaci.
 *
 * Fire-and-forget: neuspjeh synca NIKAD ne blokira korisnika - lokalna
 * pohrana je izvor istine do crossposta, sync se ponavlja na iducoj promjeni.
 */
import { getSupabase } from '@/lib/supabase';
import type { LocalSession } from '@/lib/sessions';

export async function syncSession(session: LocalSession): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return; // sesija jos nije uspostavljena - iduci sync pokriva

  const { error } = await supabase.from('photo_sessions').upsert(
    {
      id: session.id,
      user_id: user.id,
      mode: session.mode,
      status: session.status,
      vin: session.vin,
    },
    { onConflict: 'id' },
  );
  if (error) {
    console.warn('Sync sesije nije uspio (pokusat cemo ponovno):', error.message);
  }
}

/**
 * Sync svih lokalnih sesija - poziva se pri otvaranju aplikacije. Pokriva
 * offline rad (garaza bez signala): sesije dovrsene bez veze zrcale se cim
 * se app otvori s internetom.
 */
export async function syncAllSessions(): Promise<void> {
  const { listSessions } = await import('@/lib/sessions');
  const sessions = await listSessions();
  for (const session of sessions) {
    await syncSession(session);
  }
}
