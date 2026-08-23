import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { colors } from '@wagen/domain';
import { getSession, type LocalSession } from '@/lib/sessions';

/**
 * Kostur ekrana sesije - VIN modul (G3) i kamera (H1) sjedaju ovdje.
 * Naslov ovisi o modu: pipeline je identican, razlikuje se zavrsni ekran (4.2).
 */
export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<LocalSession | null>(null);

  useEffect(() => {
    if (id) void getSession(id).then(setSession);
  }, [id]);

  if (!session) {
    return (
      <View style={styles.container}>
        <Text style={styles.muted}>Ucitavanje…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{ title: session.mode === 'photo' ? 'Fotografiranje' : 'Novi oglas' }}
      />
      <Text style={styles.step}>Korak 1 · VIN</Text>
      <Text style={styles.muted}>
        VIN sken i rucni unos stizu u koraku G3. Sesija: {session.id.slice(0, 8)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black, padding: 24 },
  step: { color: colors.cyan, fontSize: 16, fontWeight: '600', marginBottom: 8 },
  muted: { color: colors.gray, fontSize: 14 },
});
