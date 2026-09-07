import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import { alphaone, decodeVinLocally, isStructurallyValidVin } from '@wagen/domain';
import { Card, Cta, IconCircle, T, Wordmark } from '@/ui/kit';
import { updateSession } from '@/lib/sessions';
import { syncSession } from '@/lib/sync';
import { isOcrAvailable, scanVinFromImage } from '@/lib/vin-scan';
import { decodeVinRemote, type RemoteDecode } from '@/lib/decode';

/**
 * G3 v2 (dizajn vlasnika 2026-09-07): kamera s okvirom za VIN stalno
 * gore; JEDNO polje za VIN - sken ga puni, a tko nema sken upisuje rucno
 * u ISTO polje (placeholder to objasnjava). Prepoznato vozilo se odmah
 * pokazuje inline; CTA vodi ravno na Pripremu.
 */
export default function VinScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [vin, setVin] = useState('');
  const [cameraRef, setCameraRef] = useState<CameraView | null>(null);
  const [clipboardVin, setClipboardVin] = useState<string | null>(null);
  const [ocrReady, setOcrReady] = useState(false);
  const [preview, setPreview] = useState<RemoteDecode | null>(null);

  useEffect(() => {
    void isOcrAvailable().then(setOcrReady);
    void Clipboard.getStringAsync().then((text) => {
      const candidate = text.trim().toUpperCase();
      if (isStructurallyValidVin(candidate)) setClipboardVin(candidate);
    });
  }, []);

  useEffect(() => {
    if (permission && !permission.granted) void requestPermission();
  }, [permission, requestPermission]);

  const decoded = vin.length >= 5 ? decodeVinLocally(vin) : null;

  // Cim je VIN strukturno valjan: zagrij server decode i pokazi vozilo
  useEffect(() => {
    setPreview(null);
    if (isStructurallyValidVin(vin)) {
      let alive = true;
      void decodeVinRemote(vin).then(({ info }) => {
        if (alive && info) setPreview(info);
      });
      return () => {
        alive = false;
      };
    }
    return undefined;
  }, [vin]);

  const snapAndScan = async () => {
    if (!cameraRef || busy) return;
    setBusy(true);
    try {
      const photo = await cameraRef.takePictureAsync({ quality: 0.8 });
      const result = await Promise.race([
        scanVinFromImage(photo.uri),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 12000)),
      ]);
      if (!result) {
        Alert.alert('Prepoznavanje je zapelo', 'Pokušaj ponovno — drugi pokušaj obično radi odmah.');
        return;
      }
      if (result.vin) setVin(result.vin);
      else {
        Alert.alert(
          'VIN nije prepoznat',
          result.candidates.length > 0
            ? 'Prepoznato više kandidata — provjeri i upiši ručno.'
            : 'Pokušaj ponovno s manje odsjaja, ili upiši VIN ručno.',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const accept = async (value: string | null) => {
    if (!id) return;
    const updated = await updateSession(id, {
      vin: value,
      vinLookupMiss: false,
      vehicleInfo: null,
      vehicleId: null,
    });
    void syncSession(updated);
    if (value) void decodeVinRemote(value); // ekran sesije preuzima ishod
    router.replace({ pathname: '/sesija/[id]/priprema', params: { id } });
  };

  const canContinue = !!decoded?.valid || !!decoded?.likelyOldtimer;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Wordmark small />
        <IconCircle glyph="⌂" onPress={() => router.dismissTo('/')} />
      </View>

      <T w="extrabold" size={24} style={styles.title}>
        Skeniraj VIN
      </T>

      <Card style={styles.cameraCard}>
        {permission?.granted && ocrReady ? (
          <View style={styles.cameraWrap}>
            <CameraView ref={setCameraRef} style={StyleSheet.absoluteFill} facing="back" />
            <View pointerEvents="none" style={styles.frameArea}>
              <View style={styles.vinFrame} />
              <View style={styles.frameLabel}>
                <T w="bold" size={16} color="#fff">
                  Smjesti VIN u okvir
                </T>
              </View>
            </View>
            {busy && (
              <View style={styles.busyOverlay}>
                <T w="extrabold" size={24} color={alphaone.amber}>
                  Prepoznajem VIN…
                </T>
                <T size={14} color="#ddd">
                  par sekundi
                </T>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.noCamera}>
            <T size={14} color={alphaone.muted}>
              {permission?.granted
                ? 'Prepoznavanje teksta nije dostupno — upiši VIN ručno dolje.'
                : 'Čekam dozvolu za kameru… VIN možeš upisati i ručno dolje.'}
            </T>
          </View>
        )}
        <View style={styles.controls}>
          <IconCircle glyph="⟳" onPress={() => setVin('')} />
          <Pressable
            style={[styles.shutter, busy && { opacity: 0.5 }]}
            onPress={() => void snapAndScan()}
            disabled={busy || !permission?.granted || !ocrReady}
            accessibilityLabel="Slikaj VIN"
          >
            <View style={styles.shutterInner} />
          </Pressable>
          <IconCircle glyph="⇥" onPress={() => void accept(null)} />
        </View>
      </Card>

      {clipboardVin && clipboardVin !== vin && (
        <Pressable onPress={() => setVin(clipboardVin)}>
          <Card style={styles.clipCard}>
            <T w="semibold" size={14} color={alphaone.ink}>
              Zalijepi iz međuspremnika: {clipboardVin}
            </T>
          </Card>
        </Pressable>
      )}

      {/* JEDNO polje: sken ga puni, rucni unos ide u isto (Dodatno 1) */}
      <Card style={styles.vinCard}>
        <TextInput
          style={styles.vinInput}
          value={vin}
          onChangeText={(t) => setVin(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={17}
          placeholder="Skeniraj ili upiši VIN ručno"
          placeholderTextColor={alphaone.muted}
        />
      </Card>

      {(preview || decoded) && (
        <Card style={styles.vehicleCard}>
          <T w="bold" size={18}>
            {preview
              ? `${preview.make} ${preview.model}${preview.modelYear ? ` · ${preview.modelYear}` : ''} ✓`
              : decoded?.valid
                ? `${decoded.manufacturer ?? 'Vozilo'}${decoded.year ? ` · ${decoded.year}.` : ''} — provjeravam…`
                : decoded?.likelyOldtimer
                  ? 'Stariji broj šasije (oldtimer) — podaci se unose ručno'
                  : 'VIN mora imati 17 znakova (bez I, O, Q)'}
          </T>
        </Card>
      )}

      <View style={{ flex: 1 }} />
      <Cta
        label="Nastavi na pripremu"
        onPress={() => void accept(decoded?.valid ? vin : null)}
        disabled={!canContinue}
        style={!canContinue ? { opacity: 0.4 } : undefined}
      />
      <Pressable onPress={() => void accept(null)} style={styles.skipLink}>
        <T w="semibold" size={15} color={alphaone.muted}>
          Nemam VIN / preskoči
        </T>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: alphaone.bg, padding: 18, paddingTop: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { marginTop: 14, marginBottom: 10 },
  cameraCard: { flex: 1.4, padding: 12, marginBottom: 12 },
  cameraWrap: { flex: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: '#222' },
  frameArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vinFrame: {
    width: '90%',
    height: 62,
    borderWidth: 3,
    borderColor: alphaone.amber,
    borderRadius: 12,
  },
  frameLabel: {
    marginTop: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 8,
  },
  busyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noCamera: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingTop: 12,
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: alphaone.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: alphaone.red },
  clipCard: { paddingVertical: 12, marginBottom: 12, borderWidth: 1, borderColor: alphaone.amber },
  vinCard: { paddingVertical: 10, marginBottom: 12 },
  vinInput: {
    fontFamily: 'Exo2-SemiBold',
    fontSize: 20,
    letterSpacing: 2.5,
    color: alphaone.ink,
    textAlign: 'center',
    paddingVertical: 6,
  },
  vehicleCard: { paddingVertical: 14, marginBottom: 12, alignItems: 'center' },
  skipLink: { alignItems: 'center', paddingVertical: 14 },
});
