import { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import * as ScreenOrientation from 'expo-screen-orientation';
import { DeviceMotion } from 'expo-sensors';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { colors } from '@wagen/domain';
import { getSession, updateSession, type LocalPhoto, type LocalSession } from '@/lib/sessions';
import { syncSession } from '@/lib/sync';
import { GUIDED_SHOTS } from '@/lib/guided-shots';

/**
 * H1 v2: Vodjeno fotografiranje u LANDSCAPE modu (auto je horizontalan
 * objekt). Layout po uzoru na profesionalne foto alate: lijeva traka =
 * kadrovi s napretkom (thumbnail za snimljene), desna traka = okidac +
 * libela. Overlay je staticna silueta (4.4 - pravi AR s detekcijom je v2).
 *
 * Format: SVE fotke izlaze kao tocno 4:3 landscape (13.1 - kartica je 4:3),
 * centralni crop + resize na max 2400px sirine.
 */
export default function CameraScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<LocalSession | null>(null);
  const [cameraRef, setCameraRef] = useState<CameraView | null>(null);
  const [tilt, setTilt] = useState<{ roll: number; pitch: number } | null>(null);

  const shot = GUIDED_SHOTS[stepIndex];

  // Landscape SAMO na ovom ekranu; povratak na portrait pri izlasku
  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    return () => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  // Libela: rotacija uredjaja u stupnjevima (gamma = roll u landscapeu)
  useEffect(() => {
    DeviceMotion.setUpdateInterval(200);
    const sub = DeviceMotion.addListener((m) => {
      if (m.rotation) {
        // U landscapeu je beta naklon oko duge osi (roll horizonta)
        setTilt({
          roll: (m.rotation.beta * 180) / Math.PI,
          pitch: (m.rotation.gamma * 180) / Math.PI,
        });
      }
    });
    return () => sub.remove();
  }, []);

  const load = useCallback(() => {
    if (id) void getSession(id).then(setSession);
  }, [id]);
  useEffect(load, [load]);

  const takenFor = (shotKey: string): LocalPhoto | undefined =>
    session?.photos.find((p) => p.uri.includes(`/${shotKey}-`) || p.uri.includes(`${shotKey}-`));

  const capture = async () => {
    if (!cameraRef || busy || !id || !shot) return;
    setBusy(true);
    try {
      const photo = await cameraRef.takePictureAsync({ quality: 0.92 });

      // Tocno 4:3 landscape: centralni crop pa resize (13.1)
      const targetRatio = 4 / 3;
      const ratio = photo.width / photo.height;
      let cropW = photo.width;
      let cropH = photo.height;
      if (ratio > targetRatio) cropW = Math.round(photo.height * targetRatio);
      else cropH = Math.round(photo.width / targetRatio);
      const context = ImageManipulator.manipulate(photo.uri);
      context.crop({
        originX: Math.round((photo.width - cropW) / 2),
        originY: Math.round((photo.height - cropH) / 2),
        width: cropW,
        height: cropH,
      });
      if (cropW > 2400) context.resize({ width: 2400 });
      const rendered = await context.renderAsync();
      const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });

      const dir = new Directory(Paths.document, 'sessions', id);
      dir.create({ intermediates: true, idempotent: true });
      const stored = new File(dir, `${shot.key}-${Crypto.randomUUID().slice(0, 8)}.jpg`);
      await new File(saved.uri).move(stored);

      const current = await getSession(id);
      if (!current) return;
      const local: LocalPhoto = {
        id: Crypto.randomUUID(),
        uri: stored.uri,
        angleCategory: shot.angleCategory,
        sortOrder: current.photos.length,
      };
      const updated = await updateSession(id, { photos: [...current.photos, local] });
      setSession(updated);
      void syncSession(updated);
      if (stepIndex + 1 >= GUIDED_SHOTS.length) router.back();
      else setStepIndex((i) => i + 1);
    } finally {
      setBusy(false);
    }
  };

  if (!permission?.granted) {
    void requestPermission();
    return (
      <View style={styles.container}>
        <Text style={styles.hint}>Cekam dozvolu za kameru…</Text>
      </View>
    );
  }

  const levelOk = tilt ? Math.abs(tilt.roll) < 2 : false;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Lijeva traka: kadrovi s napretkom */}
      <View style={styles.leftRail}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>
        <FlatList
          data={GUIDED_SHOTS}
          keyExtractor={(s) => s.key}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => {
            const taken = takenFor(item.key);
            const isCurrent = index === stepIndex;
            return (
              <Pressable
                style={[styles.shotCircle, isCurrent && styles.shotCircleActive]}
                onPress={() => setStepIndex(index)}
              >
                {taken ? (
                  <Image source={{ uri: taken.uri }} style={styles.shotThumb} />
                ) : (
                  <Text style={styles.shotNumber}>{index + 1}</Text>
                )}
              </Pressable>
            );
          }}
        />
      </View>

      {/* Kamera + overlay */}
      <View style={styles.cameraWrap}>
        <CameraView ref={setCameraRef} style={StyleSheet.absoluteFill} facing="back" />
        <View pointerEvents="none" style={styles.overlay}>
          <View style={styles.silhouette} />
          <Text style={styles.overlayLabel}>
            {shot ? `${shot.title} · ${shot.hint}` : ''}
          </Text>
        </View>
      </View>

      {/* Desna traka: libela + okidac */}
      <View style={styles.rightRail}>
        <View style={styles.level}>
          <View
            style={[
              styles.levelDot,
              { backgroundColor: levelOk ? colors.cyan : '#FF5555' },
              tilt && {
                transform: [
                  { translateX: Math.max(-14, Math.min(14, (tilt.pitch ?? 0) * 1.5)) },
                  { translateY: Math.max(-14, Math.min(14, (tilt.roll ?? 0) * 1.5)) },
                ],
              },
            ]}
          />
          <Text style={styles.levelText}>{tilt ? `${tilt.roll.toFixed(1)}°` : '—'}</Text>
        </View>

        <Pressable
          style={[styles.shutter, busy && styles.shutterBusy]}
          onPress={() => void capture()}
          disabled={busy}
          accessibilityLabel="Slikaj"
        >
          <View style={[styles.shutterInner, levelOk && styles.shutterInnerOk]} />
        </Pressable>

        <Pressable
          onPress={() =>
            stepIndex + 1 >= GUIDED_SHOTS.length ? router.back() : setStepIndex((i) => i + 1)
          }
          hitSlop={8}
        >
          <Text style={styles.skipText}>Preskoci</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black, flexDirection: 'row' },
  leftRail: { width: 92, alignItems: 'center', paddingVertical: 12, gap: 8 },
  backArrow: { color: colors.white, fontSize: 34, lineHeight: 36, marginBottom: 4 },
  shotCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: colors.gray,
    marginVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  shotCircleActive: { borderColor: colors.cyan, borderWidth: 3 },
  shotThumb: { width: '100%', height: '100%' },
  shotNumber: { color: colors.gray, fontSize: 18, fontWeight: '600' },
  cameraWrap: { flex: 1, borderRadius: 12, overflow: 'hidden', marginVertical: 8 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  silhouette: {
    width: '82%',
    height: '68%',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(30, 220, 232, 0.55)',
    borderRadius: 16,
  },
  overlayLabel: {
    position: 'absolute',
    bottom: 10,
    color: colors.white,
    fontSize: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
  hint: { color: colors.gray, fontSize: 14, textAlign: 'center', marginTop: 40 },
  rightRail: { width: 110, alignItems: 'center', justifyContent: 'center', gap: 22 },
  level: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.gray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelDot: { width: 10, height: 10, borderRadius: 5 },
  levelText: { position: 'absolute', bottom: -18, color: colors.gray, fontSize: 10 },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterBusy: { opacity: 0.5 },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.white },
  shutterInnerOk: { backgroundColor: colors.cyan },
  skipText: { color: colors.gray, fontSize: 14 },
});
