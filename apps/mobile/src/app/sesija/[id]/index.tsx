import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { colors, decodeVinLocally } from '@wagen/domain';
import { getSession, type LocalSession } from '@/lib/sessions';
import { detectProcessingCapability, type ProcessingCapability } from '@/lib/capabilities';

/**
 * Pregled sesije - koraci pipelinea (4.2): VIN -> fotografiranje -> obrada
 * -> izlaz. Kamera (H1) i obrada (I) sjedaju ovdje.
 */
export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<LocalSession | null>(null);
  const [capability, setCapability] = useState<ProcessingCapability | null>(null);

  useFocusEffect(
    useCallback(() => {
      void detectProcessingCapability().then(setCapability);
    }, []),
  );

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
          {session.vehicleInfo
            ? `${session.vehicleInfo.make} ${session.vehicleInfo.model}${session.vehicleInfo.engineLabel ? ` ${session.vehicleInfo.engineLabel}` : ''}${session.vehicleInfo.modelYear ? ` · ${session.vehicleInfo.modelYear}.` : ''} ✓`
            : session.vin
              ? `${session.vin}${decoded?.manufacturer ? ` (${decoded.manufacturer})` : ''}`
              : 'Skeniraj ili unesi →'}
        </Text>
      </Pressable>

      <Pressable
        style={styles.step}
        onPress={() => router.push({ pathname: '/sesija/[id]/kamera', params: { id: session.id } })}
      >
        <Text style={styles.stepLabel}>2 · Fotografiranje</Text>
        <Text style={styles.stepValue}>
          {session.photos.length > 0 ? ` fotografija` : 'Kreni →'}
        </Text>
      </Pressable>

      {session.photos.length > 0 && (
        <Pressable
          style={styles.step}
          onPress={() =>
            router.push({ pathname: '/sesija/[id]/fotografije', params: { id: session.id } })
          }
        >
          <Text style={styles.stepLabel}>Pregled fotografija</Text>
          <Text style={styles.stepValue}>{session.photos.length} snimljeno →</Text>
        </Pressable>
      )}

      {capability && (
        <Text style={styles.capability}>
          Obrada:{' '}
          {capability === 'full'
            ? 'puni pipeline (segmentacija) ✓'
            : capability === 'blur_only'
              ? 'osnovna (uredjaj ne podrzava puni set)'
              : 'nedostupna u ovom okruzenju'}
        </Text>
      )}

      {session.photos.length > 0 && (
        <Pressable
          style={[styles.step, session.mode === 'listing' && styles.stepPrimary]}
          onPress={() =>
            router.push({ pathname: '/sesija/[id]/objavi', params: { id: session.id } })
          }
        >
          <Text style={styles.stepLabel}>
            3 · {session.mode === 'photo' ? 'Objavi i na wagen.hr' : 'Objavi oglas'}
          </Text>
          <Text style={styles.stepValue}>
            {session.mode === 'photo'
              ? 'Oglas je vec 90% gotov →'
              : 'Cijena, kilometraza i objava →'}
          </Text>
        </Pressable>
      )}
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
  stepPrimary: { borderColor: colors.cyan },
  stepLabel: { color: colors.cyan, fontSize: 14, fontWeight: '600', marginBottom: 4 },
  stepValue: { color: colors.white, fontSize: 16 },
  muted: { color: colors.gray, fontSize: 14 },
  capability: { color: colors.gray, fontSize: 12, marginBottom: 12 },
});
