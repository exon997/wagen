import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '@wagen/domain';
import { DEFAULT_LOOK, getSession, updateSession, type LookSettings } from '@/lib/sessions';

/**
 * Korak 2 flowa: Priprema - odabir izgleda PRIJE fotografiranja.
 * Pozadina: Original / Diskretna (zamucena) / Studio (predlozak);
 * toggles: sakrij registarske oznake, automatska dorada.
 */
export default function PrepScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [look, setLook] = useState<LookSettings>(DEFAULT_LOOK);

  useEffect(() => {
    if (id) {
      void getSession(id).then((s) => {
        if (s?.look) setLook(s.look);
      });
    }
  }, [id]);

  const save = async (next: LookSettings) => {
    setLook(next);
    if (id) await updateSession(id, { look: next });
  };

  const backgrounds: { key: LookSettings['background']; title: string; desc: string }[] = [
    { key: 'original', title: 'Original', desc: 'Fotografije bez promjene pozadine' },
    { key: 'blur', title: 'Diskretna', desc: 'Pozadina se zamuti, auto ostaje ostar' },
    { key: 'studio', title: 'Studio', desc: 'Auto u wagen studiju (eksperimentalno)' },
  ];

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Priprema' }} />
      <Text style={styles.sectionTitle}>Pozadina fotografija</Text>
      {backgrounds.map((b) => (
        <Pressable
          key={b.key}
          style={[styles.option, look.background === b.key && styles.optionActive]}
          onPress={() => void save({ ...look, background: b.key })}
        >
          <Text style={styles.optionTitle}>{b.title}</Text>
          <Text style={styles.optionDesc}>{b.desc}</Text>
        </Pressable>
      ))}

      <View style={styles.toggleRow}>
        <View style={styles.toggleText}>
          <Text style={styles.optionTitle}>Sakrij registarske oznake</Text>
          <Text style={styles.optionDesc}>Tablice se automatski zamute</Text>
        </View>
        <Switch
          value={look.hidePlates}
          onValueChange={(v) => void save({ ...look, hidePlates: v })}
          trackColor={{ true: colors.cyan, false: colors.gray }}
        />
      </View>
      <View style={styles.toggleRow}>
        <View style={styles.toggleText}>
          <Text style={styles.optionTitle}>Automatska dorada</Text>
          <Text style={styles.optionDesc}>Blago poboljsanje boja i kontrasta</Text>
        </View>
        <Switch
          value={look.enhance}
          onValueChange={(v) => void save({ ...look, enhance: v })}
          trackColor={{ true: colors.cyan, false: colors.gray }}
        />
      </View>

      <Pressable
        style={styles.primary}
        onPress={() => {
          if (id) router.replace({ pathname: '/sesija/[id]/kamera', params: { id } });
        }}
      >
        <Text style={styles.primaryText}>Kreni na fotografiranje</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black, padding: 24 },
  sectionTitle: { color: colors.gray, fontSize: 13, marginBottom: 10, textTransform: 'uppercase' },
  option: {
    borderColor: colors.gray,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  optionActive: { borderColor: colors.cyan, borderWidth: 2, backgroundColor: '#0a1a1c' },
  optionTitle: { color: colors.white, fontSize: 16, fontWeight: '600' },
  optionDesc: { color: colors.gray, fontSize: 13, marginTop: 2 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  toggleText: { flex: 1, paddingRight: 12 },
  primary: {
    backgroundColor: colors.cyan,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  primaryText: { color: colors.black, fontWeight: '700', fontSize: 16 },
});
