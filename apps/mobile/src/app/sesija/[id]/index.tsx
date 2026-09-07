import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { alphaone, decodeVinLocally } from '@wagen/domain';
import { Card, IconCircle, T, Wordmark } from '@/ui/kit';
import { getSession, updateSession, type LocalSession } from '@/lib/sessions';
import { decodeVinRemote } from '@/lib/decode';
import { syncSession } from '@/lib/sync';

const LOOK_LABELS: Record<string, string> = {
  original: 'Original',
  blur: 'Diskretna',
  studio: 'Studio',
};

/**
 * Koraci sesije v2 (dizajn vlasnika 2026-09-07): 6 numeriranih koraka s
 * amber brojevima i stanjem, kartica "Uputstvo za upotrebu" te Social
 * media kartice (video/carousel) oznacene "uskoro" dok render-worker ne
 * stigne - MORAJU biti u aplikaciji prije lansiranja (doc 4.5).
 */
export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<LocalSession | null>(null);
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
                `Sken je bio zamijenio sličan znak (npr. 2 i Z). Ispravan VIN:\n${canonicalVin}\n\nPrepoznato: ${vehicleInfo.make} ${vehicleInfo.model} — provjeri da odgovara vozilu.`,
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
    }, [id]),
  );

  if (!session) {
    return (
      <View style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <T color={alphaone.muted}>Učitavanje…</T>
      </View>
    );
  }

  const decoded = session.vin ? decodeVinLocally(session.vin) : null;
  const go = (screen: string) =>
    router.push({ pathname: `/sesija/[id]/${screen}` as never, params: { id: session.id } });

  const vehicleLine = session.vehicleInfo
    ? `${session.vehicleInfo.make} ${session.vehicleInfo.model}${session.vehicleInfo.modelYear ? ` · ${session.vehicleInfo.modelYear}.` : ''} ✓`
    : session.vin
      ? `${session.vin}${decoded?.manufacturer ? ` (${decoded.manufacturer})` : ''}`
      : 'Skeniraj ili upiši VIN';

  const vinSub = decodePending
    ? 'Prepoznajem vozilo… (do pola minute)'
    : decodeError
      ? `Prepoznavanje nije uspjelo: ${decodeError}`
      : session.vinLookupMiss
        ? 'VIN nije u bazi dobavljača — podaci se unose ručno pri objavi'
        : null;

  const processedCount = session.photos.filter((p) => p.processedUri).length;

  const steps: {
    n: number;
    title: string;
    state: string;
    done: boolean;
    screen: string;
    sub?: string | null;
  }[] = [
    {
      n: 1,
      title: 'Identifikacija',
      state: vehicleLine,
      done: !!session.vehicleId,
      screen: 'vin',
      sub: !session.vehicleId ? vinSub : null,
    },
    {
      n: 2,
      title: 'Priprema',
      state: session.look
        ? `${LOOK_LABELS[session.look.background]}${session.look.hidePlates ? ' · tablice skrivene' : ''}`
        : 'Odaberi izgled fotografija',
      done: !!session.look,
      screen: 'priprema',
    },
    {
      n: 3,
      title: 'Fotografiranje',
      state:
        session.photos.length > 0 ? `${session.photos.length} fotografija ✓` : 'Vođeno slikanje',
      done: session.photos.length > 0,
      screen: 'kamera',
    },
    {
      n: 4,
      title: 'Pregled i obrada',
      state:
        processedCount > 0
          ? `${processedCount}/${session.photos.length} obrađeno ✓`
          : session.photos.length > 0
            ? 'Obradi i spremi fotografije'
            : 'Nakon fotografiranja',
      done: processedCount > 0,
      screen: 'fotografije',
    },
    {
      n: 5,
      title: 'Značajke i oprema',
      state: session.vehicleId ? 'Popis opreme + fotografije značajki' : 'Nakon identifikacije',
      done: false,
      screen: 'znacajke',
    },
    {
      n: 6,
      title: 'Objavi na wagen.hr',
      state: session.photos.length > 0 ? 'Oglas je već 90% gotov' : 'Nakon fotografiranja',
      done: false,
      screen: 'objavi',
    },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Wordmark small />
        <IconCircle glyph="⌂" onPress={() => router.dismissTo('/')} />
      </View>

      <T w="extrabold" size={24} style={{ marginBottom: 12 }}>
        Koraci
      </T>

      <Card style={{ paddingVertical: 8 }}>
        {steps.map((s, i) => (
          <Pressable
            key={s.n}
            style={[styles.stepRow, i < steps.length - 1 && styles.stepDivider]}
            onPress={() => go(s.screen)}
          >
            <View style={[styles.stepNum, s.done && styles.stepNumDone]}>
              <T w="extrabold" size={20} color={s.done ? '#fff' : alphaone.ink}>
                {s.done ? '✓' : String(s.n)}
              </T>
            </View>
            <View style={{ flex: 1 }}>
              <T w="bold" size={17}>
                {s.title}
              </T>
              <T size={13} color={s.done ? alphaone.green : alphaone.muted}>
                {s.state}
              </T>
              {s.sub && (
                <T size={12} color={decodeError ? alphaone.red : alphaone.muted}>
                  {s.sub}
                </T>
              )}
            </View>
            <T w="extrabold" size={18} color={alphaone.muted}>
              ›
            </T>
          </Pressable>
        ))}
      </Card>

      {/* Social media paket - u aplikaciji PRIJE lansiranja (doc 4.5);
          "uskoro" dok render-worker ne krene generirati video/carousel */}
      <View style={styles.socialRow}>
        <Card style={styles.socialCard}>
          <T w="bold" size={16}>
            Social video
          </T>
          <T size={12} color={alphaone.muted}>
            9:16 video za Reels i TikTok
          </T>
          <View style={styles.soonBadge}>
            <T w="semibold" size={11} color={alphaone.muted}>
              uskoro
            </T>
          </View>
        </Card>
        <Card style={styles.socialCard}>
          <T w="bold" size={16}>
            Carousel
          </T>
          <T size={12} color={alphaone.muted}>
            Objava za Instagram i Facebook
          </T>
          <View style={styles.soonBadge}>
            <T w="semibold" size={11} color={alphaone.muted}>
              uskoro
            </T>
          </View>
        </Card>
      </View>

      <Pressable
        onPress={() =>
          Alert.alert(
            'Uputstvo za upotrebu',
            '1. Skeniraj VIN — aplikacija prepozna vozilo.\n2. Odaberi pozadinu i postavke tablica.\n3. Fotografiraj po vodiču (16 kadrova).\n4. Pokreni obradu — AI studio sredi pozadinu.\n5. Provjeri opremu i dodaj naknadno ugrađenu.\n6. Objavi na wagen.hr — oglas je već 90% gotov.',
          )
        }
      >
        <Card style={styles.helpCard}>
          <View style={styles.helpIcon}>
            <T w="bold" size={20}>
              ?
            </T>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <T w="bold" size={16}>
              Uputstvo za upotrebu
            </T>
            <T size={12} color={alphaone.muted}>
              Prođi korake redom — od VIN-a do objave u par minuta
            </T>
          </View>
        </Card>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: alphaone.bg },
  content: { padding: 18, paddingTop: 40, paddingBottom: 36 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  stepDivider: { borderBottomWidth: 1, borderBottomColor: alphaone.cardAlt },
  stepNum: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: alphaone.amber,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  stepNumDone: { backgroundColor: alphaone.green },
  socialRow: { flexDirection: 'row', gap: 14 },
  socialCard: { flex: 1, paddingVertical: 16 },
  soonBadge: {
    alignSelf: 'flex-start',
    backgroundColor: alphaone.cardAlt,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 8,
  },
  helpCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  helpIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: alphaone.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
