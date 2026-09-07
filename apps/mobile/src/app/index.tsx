import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors } from '@wagen/domain';
import { createSession, listSessions, type LocalSession } from '@/lib/sessions';
import { clearLastCrash, getLastCrash } from '@/lib/crash-log';
import { getCachedDealerContext, refreshDealerContext, type DealerContext } from '@/lib/dealer';
import { syncSession } from '@/lib/sync';

/**
 * Home: JEDAN ulaz (terenska odluka 2026-08-25 - dva ulaza radila su
 * identicno i zbunjivala). Mod je 'photo'; hoce li fotografije zavrsiti
 * samo u galeriji ili i kao oglas, korisnik bira na kraju flowa (J1).
 */
export default function HomeScreen() {
  const router = useRouter();
  const [crash, setCrash] = useState<string | null>(null);
  const [dealer, setDealer] = useState<DealerContext | null>(null);
  const [recent, setRecent] = useState<LocalSession[]>([]);

  useEffect(() => {
    void getLastCrash().then((c) => setCrash(c ? `${c.at}${c.fatal ? ' (fatal)' : ''}\n${c.error}` : null));
    void refreshDealerContext().then(setDealer);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void getCachedDealerContext().then(setDealer);
      // Nastavak zapocetih vozila (spec vlasnika 2026-09-07): prekinuto
      // fotografiranje se nastavlja odavde, ne ispocetka
      void listSessions().then((all) => setRecent(all.slice(0, 5)));
    }, []),
  );

  const sessionLine = (s: LocalSession): string => {
    const vehicle = s.vehicleInfo
      ? `${s.vehicleInfo.make} ${s.vehicleInfo.model}`
      : (s.vin ?? 'Bez VIN-a');
    return `${vehicle} · ${s.photos.length} fotki`;
  };

  const start = async () => {
    const session = await createSession('photo', dealer?.dealerId ?? null);
    void syncSession(session);
    router.push({ pathname: '/sesija/[id]', params: { id: session.id } });
  };

  return (
    <View style={styles.container}>
      <Image
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro trazi require() za staticke assete
        source={require('../../assets/brand-logo-white.png')}
        style={styles.brand}
        resizeMode="contain"
        accessibilityLabel="wagen"
      />

      {crash && (
        <ScrollView style={styles.crashBox}>
          <Text style={styles.crashTitle}>Zadnje rusenje (slikaj ovo):</Text>
          <Text style={styles.crashText}>{crash}</Text>
          <Pressable
            onPress={() => {
              void clearLastCrash();
              setCrash(null);
            }}
          >
            <Text style={styles.crashDismiss}>Zatvori</Text>
          </Pressable>
        </ScrollView>
      )}

      <Pressable
        style={styles.entry}
        onPress={() => void start()}
        accessibilityLabel="Fotografiraj auto"
      >
        <Text style={styles.entryTitle}>Fotografiraj auto</Text>
        <Text style={styles.entrySubtitle}>
          {dealer
            ? `Brandirano za ${dealer.displayName}`
            : 'Od broja sasije do profesionalnih fotografija u par minuta - besplatno'}
        </Text>
      </Pressable>

      {recent.length > 0 && (
        <View style={styles.recentBox}>
          <Text style={styles.recentTitle}>Nastavi započeto</Text>
          {recent.map((s) => (
            <Pressable
              key={s.id}
              style={styles.recentRow}
              onPress={() => router.push({ pathname: '/sesija/[id]', params: { id: s.id } })}
            >
              {s.photos[0] ? (
                <Image
                  source={{ uri: s.photos[0].processedUri ?? s.photos[0].uri }}
                  style={styles.recentThumb}
                />
              ) : (
                <View style={[styles.recentThumb, styles.recentThumbEmpty]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.recentLine}>{sessionLine(s)}</Text>
                <Text style={styles.recentDate}>
                  {new Date(s.updatedAt).toLocaleDateString('hr-HR')}
                </Text>
              </View>
              <Text style={styles.recentArrow}>→</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Pressable style={styles.salonLink} onPress={() => router.push('/salon')}>
        <Text style={styles.salonLinkText}>
          {dealer ? `Salon: ${dealer.displayName} →` : 'Imate salon? Prijava za trgovce →'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black, padding: 24, justifyContent: 'center' },
  brand: { width: 180, height: 44, marginBottom: 48, alignSelf: 'flex-start' },
  entry: {
    backgroundColor: colors.cyan,
    borderRadius: 14,
    padding: 22,
  },
  entryTitle: { color: colors.black, fontSize: 22, fontWeight: '700' },
  entrySubtitle: { color: '#053b40', fontSize: 14, marginTop: 6 },
  crashBox: {
    maxHeight: 220,
    borderColor: '#FF5555',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
  },
  crashTitle: { color: '#FF5555', fontWeight: '700', marginBottom: 6 },
  crashText: { color: colors.white, fontSize: 11, fontFamily: 'monospace' },
  crashDismiss: { color: colors.cyan, marginTop: 10 },
  recentBox: { marginTop: 22 },
  recentTitle: {
    color: colors.gray,
    fontSize: 13,
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 1,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    borderBottomWidth: 1,
  },
  recentThumb: { width: 56, height: 42, borderRadius: 6, backgroundColor: '#222' },
  recentThumbEmpty: { borderWidth: 1, borderColor: colors.gray },
  recentLine: { color: colors.white, fontSize: 15, fontWeight: '600' },
  recentDate: { color: colors.gray, fontSize: 12, marginTop: 2 },
  recentArrow: { color: colors.cyan, fontSize: 20 },
  salonLink: { marginTop: 20, alignSelf: 'flex-start', paddingVertical: 8 },
  salonLinkText: { color: colors.gray, fontSize: 14 },
});
