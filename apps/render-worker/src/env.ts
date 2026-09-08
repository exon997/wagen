/** Okolina workera - service rola, NIKAD u klijentski kod. */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Nedostaje env varijabla: ${name}`);
  return value;
}

export const env = {
  supabaseUrl: required('SUPABASE_URL'),
  supabaseSecretKey: required('SUPABASE_SECRET_KEY'),
  pollMs: Number(process.env['POLL_MS'] ?? 2000),
  /** Javna baza kratkog linka na end cardu. */
  linkBase: process.env['LINK_BASE'] ?? 'wagen.hr/v',
};
