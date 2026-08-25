import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@wagen/domain';
import { createSession } from '@/lib/sessions';
import { clearLastCrash, getLastCrash } from '@/lib/crash-log';
import { syncSession } from '@/lib/sync';

/**
 * Home: JEDAN ulaz (terenska odluka 2026-08-25 - dva ulaza radila su
 * identicno i zbunjivala). Mod je 'photo'; hoce li fotografije zavrsiti
 * samo u galeriji ili i kao oglas, korisnik bira na kraju flowa (J1).
 */
export default function HomeScreen() {
  const router = useRouter();
  const [crash, setCrash] = useState<string | null>(null);

  useEffect(() => {
    void getLastCrash().then((c) => setCrash(c ? `${c.at}${c.fatal ? ' (fatal)' : ''}\n${c.error}` : null));
  }, []);

  const start = async () => {
    const session = await createSession('photo');
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
          Od broja sasije do profesionalnih fotografija u par minuta - besplatno
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
});
