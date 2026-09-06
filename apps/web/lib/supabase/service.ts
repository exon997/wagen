import 'server-only';

import { createServiceClient } from '@wagen/supabase';

/**
 * Service klijent (SECRET key, zaobilazi RLS) - ISKLJUCIVO za server-side
 * renderiranje JAVNOG sadrzaja s eksplicitnim filterima (objavljene
 * stranice trgovaca, aktivni oglasi). Nikad ne smije procuriti u klijentski
 * kod ('server-only' to garantira na build razini).
 */
export function createService() {
  return createServiceClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['SUPABASE_SECRET_KEY']!,
  );
}
