import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@wagen/domain';
import { createSession, type SessionMode } from '@/lib/sessions';

/**
 * Home: dva ulaza, jedan pipeline (4.2). Ulazni mod odredjuje default
 * izlaza - foto mod dijeli fotografije, oglasni mod objavljuje na wagen.hr.
 */
export default function HomeScreen() {
  const router = useRouter();

  const start = async (mode: SessionMode) => {
    const session = await createSession(mode);
    router.push({ pathname: '/sesija/[id]', params: { id: session.id } });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>wagen</Text>

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
});
