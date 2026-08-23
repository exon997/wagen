import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@wagen/domain';
import { createSession, type SessionMode } from '@/lib/sessions';
import { clearLastCrash, getLastCrash } from '@/lib/crash-log';
import { syncSession } from '@/lib/sync';

/**
 * Home: dva ulaza, jedan pipeline (4.2). Ulazni mod odredjuje default
 * izlaza - foto mod dijeli fotografije, oglasni mod objavljuje na wagen.hr.
 */
export default function HomeScreen() {
  const router = useRouter();
  const [crash, setCrash] = useState<string | null>(null);

  useEffect(() => {
    void getLastCrash().then((c) =>
      setCrash(
        c
          ? `
`
          : null,
      ),
    );
  }, []);

  const start = async (mode: SessionMode) => {
    const session = await createSession(mode);
    void syncSession(session);
    router.push({ pathname: '/sesija/[id]', params: { id: session.id } });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>wagen</Text>

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
        style={[styles.entry, styles.entryPrimary]}
        onPress={() => void start('photo')}
        accessibilityLabel="Fotografiraj vozilo"
      >
        <Text style={styles.entryTitle}>Fotografiraj vozilo</Text>
        <Text style={styles.entrySubtitle}>Profesionalne fotografije tvog auta, besplatno</Text>
      </Pressable>

      <Pressable
        style={styles.entry}
        onPress={() => void start('listing')}
        accessibilityLabel="Predaj oglas"
      >
        <Text style={styles.entryTitle}>Predaj oglas</Text>
        <Text style={styles.entrySubtitle}>VIN sken, fotografije i objava u par minuta</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black, padding: 24, justifyContent: 'center' },
  brand: { color: colors.white, fontSize: 40, fontWeight: '700', marginBottom: 48 },
  entry: {
    borderColor: colors.gray,
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  entryPrimary: { borderColor: colors.cyan, backgroundColor: '#0a1a1c' },
  entryTitle: { color: colors.white, fontSize: 20, fontWeight: '600' },
  entrySubtitle: { color: colors.gray, fontSize: 14, marginTop: 4 },
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
