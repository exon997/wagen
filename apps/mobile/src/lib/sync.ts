/**
 * G4/H2: Sync lokalnih sesija i fotografija u backend.
 *
 * Backend od prvog dana prima VIN podatke, fotografije i draftove (4.5) -
 * svaka lokalna sesija se zrcali u public.photo_sessions, a fotke u
 * session-photos bucket ({user_id}/{session_id}/{photo_id}.jpg) +
 * public.photo_session_photos. RLS osigurava vlasnistvo (i anonimno, 4.3).
 *
 * Fire-and-forget: neuspjeh synca NIKAD ne blokira korisnika - lokalna
 * pohrana je izvor istine do crossposta, sync se ponavlja na iducoj
 * promjeni i pri svakom otvaranju aplikacije (offline garaza).
 */
import { File } from 'expo-file-system';
import { getSupabase } from '@/lib/supabase';
import type { LocalPhoto, LocalSession } from '@/lib/sessions';

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
    return;
  }

  await syncPhotos(session, user.id);
}

/** H2: uploada fotke koje jos nemaju remotePath; uspjesne oznacava lokalno. */
async function syncPhotos(session: LocalSession, userId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const pending = session.photos.filter((p) => !p.remotePath);
  if (pending.length === 0) return;

  const uploaded: { photo: LocalPhoto; remotePath: string }[] = [];
  for (const photo of pending) {
    try {
      const file = new File(photo.uri);
      if (!file.exists) continue;
      const bytes = await file.bytes();
      const remotePath = `${userId}/${session.id}/${photo.id}.jpg`;
      const { error } = await supabase.storage
        .from('session-photos')
        .upload(remotePath, bytes, { contentType: 'image/jpeg', upsert: true });
      if (error) {
        console.warn(`Upload fotke ${photo.id} nije uspio:`, error.message);
        continue;
      }
      const { error: rowError } = await supabase.from('photo_session_photos').upsert(
        {
          id: photo.id,
          session_id: session.id,
          storage_path: remotePath,
          angle_category: photo.angleCategory,
          sort_order: photo.sortOrder,
        },
        { onConflict: 'id' },
      );
      if (rowError) {
        console.warn(`Zapis fotke ${photo.id} nije uspio:`, rowError.message);
        continue;
      }
      uploaded.push({ photo, remotePath });
    } catch (e) {
      console.warn(`Sync fotke ${photo.id} preskocen:`, e);
    }
  }

  if (uploaded.length > 0) {
    // Atomarno oznaci uploadane - mutateSession cita SVJEZE stanje unutar
    // reda pisanja pa paralelni capture ne gubi oznake
    const { mutateSession } = await import('@/lib/sessions');
    await mutateSession(session.id, (current) => ({
      photos: current.photos.map((p) => {
        const hit = uploaded.find((u) => u.photo.id === p.id);
        return hit ? { ...p, remotePath: hit.remotePath } : p;
      }),
    }));
  }
}

/**
 * Sync svih lokalnih sesija - poziva se pri otvaranju aplikacije. Pokriva
 * offline rad (garaza bez signala): sesije dovrsene bez veze zrcale se cim
 * se app otvori s vezom.
 */
export async function syncAllSessions(): Promise<void> {
  const { listSessions } = await import('@/lib/sessions');
  const sessions = await listSessions();
  for (const session of sessions) {
    await syncSession(session);
  }
}
