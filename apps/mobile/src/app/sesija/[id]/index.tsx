import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { colors, decodeVinLocally } from '@wagen/domain';
import { getSession, updateSession, type LocalSession } from '@/lib/sessions';
import { decodeVinRemote } from '@/lib/decode';
import { syncSession } from '@/lib/sync';
import { detectProcessingCapability, type ProcessingCapability } from '@/lib/capabilities';

const LOOK_LABELS: Record<string, string> = {
  original: 'Original',
  blur: 'Diskretna',
  studio: 'Studio',
};

/**
 * Flow sesije (spec vlasnika, 2026-08-25): "Od broja sasije do oglasa u
 * par minuta" - Identifikacija -> Priprema -> Fotografiranje -> Oglas.
 */
export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<LocalSession | null>(null);
  const [capability, setCapability] = useState<ProcessingCapability | null>(null);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [decodePending, setDecodePending] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      void getSession(id).then(async (s) => {
        setSession(s);
        // Samoizljecenje: VIN postoji, a decode nije uspio (timeout/offline).
        // Promasaj dobavljaca (miss) se pamti - njega ne ponavljamo.
        if (s?.vin && !s.vehicleId && !s.vinLookupMiss) {
          setDecodePending(true);
          const { info, error, miss } = await decodeVinRemote(s.vin);
          setDecodePending(false);
          if (info) {
            const { vehicleId, vin: canonicalVin, correctedFrom, ...vehicleInfo } = info;
            const updated = await updateSession(id, {
              vehicleInfo,
              vehicleId,
              ...(canonicalVin && canonicalVin !== s.vin ? { vin: canonicalVin } : {}),
            });
            setSession(updated);
            setDecodeError(null);
            void syncSession(updated);
            if (correctedFrom && canonicalVin) {
              Alert.alert(
                'VIN ispravljen',
                `Sken je bio zamijenio slican znak (npr. 2 i Z). Ispravan VIN:\n${canonicalVin}\n\nPrepoznato: ${vehicleInfo.make} ${vehicleInfo.model} - provjeri da odgovara vozilu.`,
              );
            }
          } else if (miss) {
            const updated = await updateSession(id, { vinLookupMiss: true });
            setSession(updated);
            setDecodeError(null);
          } else {
            setDecodeError(error);
          }
        }
      });
      void detectProcessingCapability().then(setCapability);
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
  const go = (screen: string) =>
    router.push({ pathname: `/sesija/[id]/${screen}` as never, params: { id: session.id } });

  const vehicleLine = session.vehicleInfo
    ? `${session.vehicleInfo.make} ${session.vehicleInfo.model}${session.vehicleInfo.engineLabel ? ` ${session.vehicleInfo.engineLabel}` : ''}${session.vehicleInfo.modelYear ? ` · ${session.vehicleInfo.modelYear}.` : ''} ✓`
    : session.vin
      ? `${session.vin}${decoded?.manufacturer ? ` (${decoded.manufacturer})` : ''}`
      : 'Skeniraj ili unesi →';

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{ title: session.mode === 'photo' ? 'Fotografiranje' : 'Novi oglas' }}
      />

      <Pressable style={styles.step} onPress={() => go('vin')}>
        <Text style={styles.stepLabel}>1 · Identifikacija</Text>
        <Text style={styles.stepValue}>{vehicleLine}</Text>
        {!session.vehicleId && decodePending && (
          <Text style={styles.decodePending}>Prepoznajem vozilo… (do pola minute)</Text>
        )}
        {!session.vehicleId && !decodePending && decodeError && (
          <Text style={styles.decodeError}>Prepoznavanje nije uspjelo: {decodeError}</Text>
        )}
        {!session.vehicleId && !decodePending && !decodeError && session.vinLookupMiss && (
          <Text style={styles.decodeMiss}>
            VIN nije u bazi dobavljaca - podaci o vozilu se unose rucno pri objavi
          </Text>
        )}
      </Pressable>

      <Pressable style={styles.step} onPress={() => go('priprema')}>
        <Text style={styles.stepLabel}>2 · Priprema</Text>
        <Text style={styles.stepValue}>
          {session.look
            ? `${LOOK_LABELS[session.look.background]}${session.look.hidePlates ? ' · tablice sakrivene' : ''}${session.look.enhance ? ' · dorada' : ''}`
            : 'Odaberi izgled fotografija →'}
        </Text>
      </Pressable>

      <Pressable style={styles.step} onPress={() => go('kamera')}>
        <Text style={styles.stepLabel}>3 · Fotografiranje</Text>
        <Text style={styles.stepValue}>
          {session.photos.length > 0 ? `${session.photos.length} fotografija` : 'Kreni →'}
        </Text>
      </Pressable>

      {session.photos.length > 0 && (
        <>
          <Pressable style={styles.substep} onPress={() => go('fotografije')}>
            <Text style={styles.substepText}>Pregled i obrada fotografija</Text>
            <Text style={styles.substepArrow}>→</Text>
          </Pressable>
          {session.vehicleId && (
            <Pressable style={styles.substep} onPress={() => go('znacajke')}>
              <Text style={styles.substepText}>Znacajke i oprema</Text>
              <Text style={styles.substepArrow}>→</Text>
            </Pressable>
          )}
        </>
      )}

      {session.photos.length > 0 && (
        <Pressable style={[styles.step, styles.stepPrimary]} onPress={() => go('objavi')}>
          <Text style={styles.stepLabel}>
            4 · {session.mode === 'photo' ? 'Objavi i na wagen.hr' : 'Oglas'}
          </Text>
          <Text style={styles.stepValue}>
            {session.mode === 'photo' ? 'Oglas je vec 90% gotov →' : 'Zavrsi i objavi →'}
          </Text>
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
  stepPrimary: { borderColor: colors.cyan },
  stepLabel: { color: colors.cyan, fontSize: 14, fontWeight: '600', marginBottom: 4 },
  stepValue: { color: colors.white, fontSize: 16 },
  substep: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderColor: colors.cyan,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  substepText: { color: colors.cyan, fontSize: 15, fontWeight: '600' },
  substepArrow: { color: colors.cyan, fontSize: 16, fontWeight: '700' },
  muted: { color: colors.gray, fontSize: 14 },
  capability: { color: colors.gray, fontSize: 12, marginTop: 16 },
  decodeError: { color: '#ff9c9c', fontSize: 12, marginTop: 6 },
  decodeMiss: { color: colors.gray, fontSize: 12, marginTop: 6 },
  decodePending: { color: colors.cyan, fontSize: 12, marginTop: 6 },
});
