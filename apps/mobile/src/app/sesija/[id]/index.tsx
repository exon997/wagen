import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { colors, decodeVinLocally } from '@wagen/domain';
import { getSession, type LocalSession } from '@/lib/sessions';

/**
 * Pregled sesije - koraci pipelinea (4.2): VIN -> fotografiranje -> obrada
 * -> izlaz. Kamera (H1) i obrada (I) sjedaju ovdje.
 */
export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<LocalSession | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (id) void getSession(id).then(setSession);
    }, [id]),
  );

  if (!session) {
    return (
      <View style={styles.container}>
        <Text style={styles.muted}>Ucitavanje…</Text>
      </View>
    );
  }

  const decoded = session.vin ? decodeVinLocally(session.vin) : null;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{ title: session.mode === 'photo' ? 'Fotografiranje' : 'Novi oglas' }}
      />

      <Pressable
        style={styles.step}
        onPress={() => router.push({ pathname: '/sesija/[id]/vin', params: { id: session.id } })}
      >
        <Text style={styles.stepLabel}>1 · VIN</Text>
        <Text style={styles.stepValue}>
          {session.vin
            ? `${session.vin}${decoded?.manufacturer ? ` (${decoded.manufacturer})` : ''}`
            : 'Skeniraj ili unesi →'}
        </Text>
      </Pressable>

      <View style={[styles.step, styles.stepDisabled]}>
        <Text style={styles.stepLabel}>2 · Fotografiranje</Text>
        <Text style={styles.muted}>Stize u koraku H1 ({session.photos.length} fotografija)</Text>
      </View>

      <View style={[styles.step, styles.stepDisabled]}>
        <Text style={styles.stepLabel}>3 · {session.mode === 'photo' ? 'Preuzmi' : 'Objavi'}</Text>
        <Text style={styles.muted}>Stize u bloku J</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black, padding: 24 },
  step: {
    borderColor: colors.gray,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  stepDisabled: { opacity: 0.4 },
  stepLabel: { color: colors.cyan, fontSize: 14, fontWeight: '600', marginBottom: 4 },
  stepValue: { color: colors.white, fontSize: 16 },
  muted: { color: colors.gray, fontSize: 14 },
});
