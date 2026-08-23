import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { colors } from '@wagen/domain';
import { getSession, updateSession, type LocalPhoto } from '@/lib/sessions';
import { syncSession } from '@/lib/sync';
import { GUIDED_SHOTS } from '@/lib/guided-shots';

/**
 * H1: Vodjeno fotografiranje (4.4) - staticni poluprozirni overlay po kutu,
 * NE pravi AR (90% efekta za 10% posla). Svaka fotka nosi angle_category
 * (13.3). Overlay siluete su placeholder okviri dok dizajn ne isporuci prave.
 */
export default function CameraScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [taken, setTaken] = useState(0);
  const [cameraRef, setCameraRef] = useState<CameraView | null>(null);

  const shot = GUIDED_SHOTS[stepIndex];
  const done = stepIndex >= GUIDED_SHOTS.length;

  const advance = useCallback(() => {
    if (stepIndex + 1 >= GUIDED_SHOTS.length) {
      router.back();
    } else {
      setStepIndex((i) => i + 1);
    }
  }, [stepIndex, router]);

  const capture = async () => {
    if (!cameraRef || busy || !id || !shot) return;
    setBusy(true);
    try {
      const photo = await cameraRef.takePictureAsync({ quality: 0.9 });
      // Kamera pise u cache koji OS smije pocistiti - premjesti u trajni dir
      const dir = new Directory(Paths.document, 'sessions', id);
      dir.create({ intermediates: true, idempotent: true });
      const stored = new File(dir, `${shot.key}-${Crypto.randomUUID().slice(0, 8)}.jpg`);
      await new File(photo.uri).move(stored);

      const session = await getSession(id);
      if (!session) return;
      const local: LocalPhoto = {
        id: Crypto.randomUUID(),
        uri: stored.uri,
        angleCategory: shot.angleCategory,
        sortOrder: session.photos.length,
      };
      const updated = await updateSession(id, { photos: [...session.photos, local] });
      void syncSession(updated);
      setTaken((t) => t + 1);
      advance();
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

  if (done || !shot) {
    return (
      <View style={styles.container}>
        <Text style={styles.hint}>Gotovo - {taken} fotografija</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{ title: `${stepIndex + 1}/${GUIDED_SHOTS.length} · ${shot.title}` }}
      />
      <View style={styles.cameraWrap}>
        <CameraView ref={setCameraRef} style={StyleSheet.absoluteFill} facing="back" />
        {/* Placeholder overlay: okvir + oznaka kuta; prava silueta iz dizajna (I5 susjed) */}
        <View pointerEvents="none" style={styles.overlay}>
          <View style={styles.silhouette} />
          <Text style={styles.overlayLabel}>{shot.title}</Text>
        </View>
      </View>

      <Text style={styles.hint}>{shot.hint}</Text>

      <View style={styles.controls}>
        <Pressable style={styles.skip} onPress={advance}>
          <Text style={styles.skipText}>Preskoci</Text>
        </Pressable>
        <Pressable
          style={[styles.shutter, busy && styles.shutterBusy]}
          onPress={() => void capture()}
          disabled={busy}
          accessibilityLabel="Slikaj"
        >
          <View style={styles.shutterInner} />
        </Pressable>
        <Pressable style={styles.skip} onPress={() => router.back()}>
          <Text style={styles.skipText}>Zavrsi</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  cameraWrap: { flex: 1, margin: 12, borderRadius: 12, overflow: 'hidden' },
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
    width: '85%',
    height: '55%',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(30, 220, 232, 0.55)',
    borderRadius: 16,
  },
  overlayLabel: {
    position: 'absolute',
    bottom: 16,
    color: colors.white,
    fontSize: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
  hint: { color: colors.gray, fontSize: 14, textAlign: 'center', marginHorizontal: 24 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingVertical: 20,
  },
  skip: { padding: 12, minWidth: 72, alignItems: 'center' },
  skipText: { color: colors.gray, fontSize: 14 },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterBusy: { opacity: 0.5 },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.cyan,
  },
});
