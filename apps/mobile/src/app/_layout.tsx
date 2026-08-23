import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { ensureSession } from '@/lib/supabase';
import { syncAllSessions } from '@/lib/sync';

export default function RootLayout() {
  // 4.3: anonimna sesija na startu - bez registracijske vratarnice
  useEffect(() => {
    ensureSession()
      .then(() => syncAllSessions())
      .catch((e: unknown) => console.warn('Sesija/sync pri startu nije uspio:', e));
  }, []);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#000000' },
        headerTintColor: '#FFFFFF',
      }}
    />
  );
}
