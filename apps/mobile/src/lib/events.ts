/**
 * Faza 0 metrike (4.5): lagani event log. Fire-and-forget - nikad ne
 * blokira korisnika; agregati se citaju u /admin metrikama.
 */
import { getSupabase } from '@/lib/supabase';

export function logEvent(
  event: string,
  payload: Record<string, string | number | boolean> = {},
): void {
  void (async () => {
    try {
      const supabase = getSupabase();
      if (!supabase) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('app_events').insert({ user_id: user.id, event, payload });
    } catch {
      // metrika nikad ne rusi flow
    }
  })();
}
