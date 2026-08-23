import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, decodeVinLocally } from '@wagen/domain';
import { updateSession } from '@/lib/sessions';
import { syncSession } from '@/lib/sync';
import { scanVinFromImage } from '@/lib/vin-scan';

/**
 * G3: VIN korak (3.2) - sken kamerom ili rucni unos. Oldtimer (kratki
 * predstandardni broj sasije) ide direktno na rucni unos podataka, bez
 * Outvin pokusaja. Sve validacije su on-device (E1); Outvin poziv je
 * server-side i dolazi u G4.
 */
export default function VinScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manualVin, setManualVin] = useState('');
  const [cameraRef, setCameraRef] = useState<CameraView | null>(null);

  const decoded = manualVin.length >= 5 ? decodeVinLocally(manualVin) : null;

  const accept = async (vin: string | null) => {
    if (!id) return;
    const updated = await updateSession(id, { vin });
    void syncSession(updated);
    router.back();
  };

  const snapAndScan = async () => {
    if (!cameraRef || busy) return;
    setBusy(true);
    try {
      const photo = await cameraRef.takePictureAsync({ quality: 0.8 });
      const { vin, candidates } = await scanVinFromImage(photo.uri);
      if (vin) {
        setManualVin(vin);
        setScanning(false);
      } else {
        Alert.alert(
          'VIN nije prepoznat',
          candidates.length > 0
            ? 'Prepoznato vise kandidata - provjeri i unesi rucno.'
            : 'Pokusaj ponovno s manje odsjaja, ili unesi VIN rucno.',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  if (scanning) {
    if (!permission?.granted) {
      void requestPermission();
      return (
        <View style={styles.container}>
          <Text style={styles.muted}>Cekam dozvolu za kameru…</Text>
        </View>
      );
    }
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Skeniraj VIN' }} />
        <CameraView ref={setCameraRef} style={styles.camera} facing="back" />
        <Text style={styles.hint}>
          VIN je na vjetrobranu (dolje lijevo) ili na naljepnici dovratnika
        </Text>
        <Pressable style={styles.primary} onPress={() => void snapAndScan()} disabled={busy}>
          <Text style={styles.primaryText}>{busy ? 'Prepoznajem…' : 'Slikaj'}</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => setScanning(false)}>
          <Text style={styles.secondaryText}>Unesi rucno</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'VIN broj' }} />

      <Pressable style={styles.primary} onPress={() => setScanning(true)}>
        <Text style={styles.primaryText}>Skeniraj kamerom</Text>
      </Pressable>

      <Text style={styles.label}>ili unesi rucno:</Text>
      <TextInput
        style={styles.input}
        value={manualVin}
        onChangeText={(t) => setManualVin(t.toUpperCase())}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={17}
        placeholder="npr. WBAVA31070NL12345"
        placeholderTextColor={colors.gray}
      />

      {decoded && (
        <View style={styles.decodeBox}>
          {decoded.valid ? (
            <Text style={styles.decodeText}>
              {decoded.manufacturer ?? 'Nepoznat proizvodjac'}
              {decoded.year ? ` · ${decoded.year}.` : ''} ✓
            </Text>
          ) : decoded.likelyOldtimer ? (
            <Text style={styles.decodeText}>
              Izgleda kao stariji broj sasije (oldtimer) - podatke ces unijeti rucno
            </Text>
          ) : (
            <Text style={styles.decodeWarn}>VIN mora imati 17 znakova (bez I, O, Q)</Text>
          )}
        </View>
      )}

      <Pressable
        style={[styles.primary, !decoded?.valid && !decoded?.likelyOldtimer && styles.disabled]}
        disabled={!decoded?.valid && !decoded?.likelyOldtimer}
        onPress={() => void accept(decoded?.valid ? manualVin : null)}
      >
        <Text style={styles.primaryText}>Nastavi</Text>
      </Pressable>

      <Pressable style={styles.secondary} onPress={() => void accept(null)}>
        <Text style={styles.secondaryText}>Nemam VIN / preskoci</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black, padding: 24 },
  camera: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  hint: { color: colors.gray, fontSize: 13, textAlign: 'center', marginVertical: 12 },
  muted: { color: colors.gray, fontSize: 14 },
  label: { color: colors.gray, marginTop: 24, marginBottom: 8 },
  input: {
    borderColor: colors.gray,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.white,
    fontSize: 18,
    letterSpacing: 2,
    padding: 12,
    fontVariant: ['tabular-nums'],
  },
  decodeBox: { marginTop: 12 },
  decodeText: { color: colors.cyan, fontSize: 15 },
  decodeWarn: { color: colors.gray, fontSize: 14 },
  primary: {
    backgroundColor: colors.cyan,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  primaryText: { color: colors.black, fontWeight: '700', fontSize: 16 },
  secondary: { padding: 16, alignItems: 'center' },
  secondaryText: { color: colors.gray, fontSize: 14 },
  disabled: { opacity: 0.35 },
});
