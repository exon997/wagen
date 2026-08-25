import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import { colors, decodeVinLocally, isStructurallyValidVin } from '@wagen/domain';
import { updateSession } from '@/lib/sessions';
import { syncSession } from '@/lib/sync';
import { isOcrAvailable, scanVinFromImage } from '@/lib/vin-scan';
import { decodeVinRemote } from '@/lib/decode';

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
  const [clipboardVin, setClipboardVin] = useState<string | null>(null);
  const [ocrReady, setOcrReady] = useState(false);

  useEffect(() => {
    void isOcrAvailable().then(setOcrReady);
  }, []);

  // Privatni prodavaci cesto imaju VIN u aplikaciji proizvodjaca (myBMW i
  // sl.) - kopiranje jednim tapom. Ako medjuspremnik nosi validan VIN,
  // ponudi ga. Trgovci ovo nemaju (nema app po autu na zalihi) - njima sken.
  useEffect(() => {
    void Clipboard.getStringAsync().then((text) => {
      const candidate = text.trim().toUpperCase();
      if (isStructurallyValidVin(candidate)) setClipboardVin(candidate);
    });
  }, []);

  const decoded = manualVin.length >= 5 ? decodeVinLocally(manualVin) : null;

  // Flow nikad ne staje (3.2): VIN se spremi i odmah natrag - decode se
  // zagrije ovdje, a ekran sesije dijeli isti in-flight poziv i pokazuje
  // zivo stanje (Prepoznajem… -> ✓ / nije u bazi / greska). Provjera
  // varijanti na serveru zna trajati 15+ s - zato nema cekanja ni timeouta.
  const accept = async (vin: string | null) => {
    if (!id) return;
    const updated = await updateSession(id, {
      vin,
      vinLookupMiss: false,
      vehicleInfo: null,
      vehicleId: null,
    });
    void syncSession(updated);
    if (vin) void decodeVinRemote(vin);
    router.back();
  };

  const snapAndScan = async () => {
    if (!cameraRef || busy) return;
    setBusy(true);
    try {
      const photo = await cameraRef.takePictureAsync({ quality: 0.8 });
      // Prvi ML Kit poziv zna zapeti na inicijalizaciji modela - timeout + retry
      const result = await Promise.race([
        scanVinFromImage(photo.uri),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 12000)),
      ]);
      if (!result) {
        Alert.alert(
          'Prepoznavanje je zapelo',
          'Pokusaj ponovno - drugi pokusaj obicno radi odmah.',
        );
        return;
      }
      const { vin, candidates } = result;
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
          Najlakse: skeniraj VIN iz prometne dozvole. Na autu: naljepnica na stoku vrata; neki auti
          i vjetrobran dolje lijevo.
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

      {ocrReady && (
        <Pressable style={styles.primary} onPress={() => setScanning(true)}>
          <Text style={styles.primaryText}>Skeniraj kamerom</Text>
        </Pressable>
      )}

      {clipboardVin && clipboardVin !== manualVin && (
        <Pressable style={styles.clipboardChip} onPress={() => setManualVin(clipboardVin)}>
          <Text style={styles.clipboardChipText}>Zalijepi {clipboardVin} ✓</Text>
        </Pressable>
      )}

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
  clipboardChip: {
    borderColor: colors.cyan,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    alignItems: 'center',
  },
  clipboardChipText: { color: colors.cyan, fontSize: 14, fontVariant: ['tabular-nums'] },
});
