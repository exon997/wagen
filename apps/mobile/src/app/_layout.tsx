import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { ensureSession } from '@/lib/supabase';

export default function RootLayout() {
  // 4.3: anonimna sesija na startu - bez registracijske vratarnice
  useEffect(() => {
    ensureSession().catch((e: unknown) => console.warn('Anonimna sesija nije uspjela:', e));
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
