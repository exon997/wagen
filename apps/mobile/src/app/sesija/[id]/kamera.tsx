import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import * as ScreenOrientation from 'expo-screen-orientation';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { alphaone } from '@wagen/domain';
import { IconCircle, T } from '@/ui/kit';
import { getSession, mutateSession, type LocalPhoto, type LocalSession } from '@/lib/sessions';
import { syncSession } from '@/lib/sync';
import { GUIDED_SHOTS } from '@/lib/guided-shots';

/**
 * Kamera v4 (dizajn vlasnika 2026-09-07): svijetli okvir oko kamere,
 * lijeva info kartica (broj kadra sa strelicama, naslov, uputa, zadnja
 * snimka kadra), desni rail (crveni okidac - JEDINA crvena u aplikaciji,
 * ponovi, preskoci) i CTA "Nastavi na obradu".
 *
 * Vodilice u kadru: zelena "ograda" (kutne zagrade + linija poda) za
 * dijagonale - radi za svaki oblik vozila, bez modelskih silueta;
 * horizontalne linije za ravnanje sprijeda/straga.
 *
 * Format: SVE fotke izlaze kao tocno 4:3 landscape (13.1), centralni
 * crop + resize na max 2400px sirine. Ponovljeni kadar ZAMJENJUJE stari.
 */

const ZONE_SHOTS = new Set(['ext-front-left', 'ext-front-right', 'ext-rear-right', 'ext-rear-left']);
const LINE_SHOTS = new Set(['ext-front', 'ext-rear']);

export default function CameraScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<LocalSession | null>(null);
  const [cameraRef, setCameraRef] = useState<CameraView | null>(null);

  const shot = GUIDED_SHOTS[stepIndex];

  // Landscape SAMO na ovom ekranu; povratak na portrait pri izlasku
  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    return () => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  const load = useCallback(() => {
    if (id) void getSession(id).then(setSession);
  }, [id]);
  useEffect(load, [load]);

  const takenFor = (shotKey: string): LocalPhoto | undefined =>
    session?.photos.find((p) => p.uri.includes(`/${shotKey}-`) || p.uri.includes(`${shotKey}-`));

  const currentTaken = shot ? takenFor(shot.key) : undefined;
  const lastPhoto = session?.photos.length
    ? session.photos[session.photos.length - 1]
    : undefined;

  const advance = () => {
    if (stepIndex + 1 >= GUIDED_SHOTS.length) {
      if (id) router.replace({ pathname: '/sesija/[id]/fotografije', params: { id } });
    } else setStepIndex((i) => i + 1);
  };

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

      // Ponovljeni kadar zamjenjuje postojecu fotku (isti sortOrder)
      const updated = await mutateSession(id, (current) => {
        const existing = current.photos.find(
          (p) => p.uri.includes(`/${shot.key}-`) || p.uri.includes(`${shot.key}-`),
        );
        const local: LocalPhoto = {
          id: Crypto.randomUUID(),
          uri: stored.uri,
          angleCategory: shot.angleCategory,
          sortOrder: existing ? existing.sortOrder : current.photos.length,
        };
        return {
          photos: existing
            ? current.photos.map((p) => (p.id === existing.id ? local : p))
            : [...current.photos, local],
        };
      });
      setSession(updated);
      void syncSession(updated);
      advance();
    } finally {
      setBusy(false);
    }
  };

  if (!permission?.granted) {
    void requestPermission();
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <T color={alphaone.muted}>Čekam dozvolu za kameru…</T>
      </View>
    );
  }

  const isNaslovna = shot?.key === 'ext-front-left';

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Lijeva info kartica: navigacija kadrova + opis + zadnja snimka */}
      <View style={styles.infoCard}>
        <View style={styles.infoTop}>
          <IconCircle glyph="←" size={40} onPress={() => router.back()} />
          <T w="semibold" size={12} color={alphaone.muted}>
            {shot?.section.toUpperCase()}
          </T>
        </View>

        <View style={styles.stepper}>
          <Pressable
            onPress={() => setStepIndex((i) => Math.max(0, i - 1))}
            hitSlop={12}
            disabled={stepIndex === 0}
            style={stepIndex === 0 ? { opacity: 0.25 } : undefined}
          >
            <T w="extrabold" size={30}>
              ‹
            </T>
          </Pressable>
          <T w="extrabold" size={26}>
            {stepIndex + 1}/{GUIDED_SHOTS.length}
          </T>
          <Pressable
            onPress={() => setStepIndex((i) => Math.min(GUIDED_SHOTS.length - 1, i + 1))}
            hitSlop={12}
            disabled={stepIndex + 1 >= GUIDED_SHOTS.length}
            style={stepIndex + 1 >= GUIDED_SHOTS.length ? { opacity: 0.25 } : undefined}
          >
            <T w="extrabold" size={30}>
              ›
            </T>
          </Pressable>
        </View>

        <T w="extrabold" size={18}>
          {shot?.title}
          {isNaslovna ? ' ★' : ''}
        </T>
        <T size={12} color={alphaone.muted} style={{ marginTop: 2 }}>
          {shot?.hint}
        </T>
        {shot?.angleCategory === 'exterior' && (
          <T w="semibold" size={12} style={{ marginTop: 4 }}>
            Slikaj s visine 80–90 cm
          </T>
        )}

        <View style={{ flex: 1 }} />

        {currentTaken ? (
          <View>
            <Image source={{ uri: currentTaken.uri }} style={styles.refThumb} />
            <T w="semibold" size={11} color={alphaone.green}>
              Snimljeno ✓ — okidač zamjenjuje
            </T>
          </View>
        ) : (
          <View style={styles.refPlaceholder}>
            <T w="semibold" size={12} color={alphaone.muted}>
              Kadar još nije snimljen
            </T>
          </View>
        )}

        <Pressable
          style={styles.doneCta}
          onPress={() =>
            id && router.replace({ pathname: '/sesija/[id]/fotografije', params: { id } })
          }
        >
          <T w="bold" size={14}>
            Nastavi na obradu ⇥
          </T>
        </Pressable>
      </View>

      {/* Kamera: TOCNO 4:3, letterbox oko toga */}
      <View style={styles.cameraArea}>
        <View style={styles.cameraBox}>
          <CameraView ref={setCameraRef} style={StyleSheet.absoluteFill} facing="back" />

          <View pointerEvents="none" style={styles.overlay}>
            {/* Zelena ograda za dijagonale: kutne zagrade + linija poda */}
            {shot && ZONE_SHOTS.has(shot.key) && (
              <View style={styles.zone}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
                <View style={styles.zoneBaseline} />
              </View>
            )}

            {/* Horizontalne linije za sprijeda/straga */}
            {shot && LINE_SHOTS.has(shot.key) && (
              <>
                <View style={[styles.hLine, { top: '32%' }]} />
                <View style={[styles.hLine, { top: '50%' }]} />
                <View style={[styles.hLine, { top: '68%' }]} />
              </>
            )}

            {/* Naslov kadra u kadru - veliko i citljivo na suncu */}
            {shot && (
              <View style={styles.topPill}>
                <T w="extrabold" size={17} color="#fff">
                  {shot.title}
                </T>
              </View>
            )}
            {busy && (
              <View style={styles.busyOverlay}>
                <T w="extrabold" size={22} color="#fff">
                  Spremam…
                </T>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Desni rail: zadnja fotka + crveni okidac + ponovi + preskoci */}
      <View style={styles.rightRail}>
        {lastPhoto ? (
          <Image source={{ uri: lastPhoto.uri }} style={styles.lastThumb} />
        ) : (
          <View style={[styles.lastThumb, styles.lastThumbEmpty]} />
        )}

        <Pressable
          style={[styles.shutter, busy && { opacity: 0.5 }]}
          onPress={() => void capture()}
          disabled={busy}
          accessibilityLabel="Slikaj"
        >
          <View style={styles.shutterInner} />
        </Pressable>

        <View style={styles.railBtn}>
          <IconCircle glyph="⟳" size={48} onPress={() => setStepIndex((i) => Math.max(0, i - 1))} />
          <T w="semibold" size={11} color={alphaone.muted}>
            Natrag
          </T>
        </View>
        <View style={styles.railBtn}>
          <IconCircle glyph="⇥" size={48} onPress={advance} />
          <T w="semibold" size={11} color={alphaone.muted}>
            Preskoči
          </T>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: alphaone.bg,
    flexDirection: 'row',
    padding: 10,
    gap: 10,
  },
  infoCard: {
    width: 200,
    backgroundColor: alphaone.card,
    borderRadius: 18,
    padding: 14,
  },
  infoTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  refThumb: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 10,
    marginBottom: 4,
    backgroundColor: alphaone.cardAlt,
  },
  refPlaceholder: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 10,
    backgroundColor: alphaone.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  doneCta: {
    backgroundColor: alphaone.amber,
    borderRadius: 16,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
  },

  cameraArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cameraBox: {
    height: '100%',
    aspectRatio: 4 / 3,
    maxWidth: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  zone: {
    position: 'absolute',
    left: '6%',
    right: '6%',
    top: '20%',
    bottom: '10%',
  },
  corner: { position: 'absolute', width: 42, height: 42, borderColor: alphaone.green },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 },
  zoneBaseline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: 'rgba(47, 191, 79, 0.6)',
  },
  hLine: {
    position: 'absolute',
    left: '4%',
    right: '4%',
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
  },

  topPill: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  busyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  rightRail: { width: 100, alignItems: 'center', justifyContent: 'center', gap: 14 },
  lastThumb: {
    width: 76,
    height: 57,
    borderRadius: 8,
    backgroundColor: alphaone.cardAlt,
  },
  lastThumbEmpty: { borderWidth: 1, borderColor: alphaone.line },
  shutter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: '#fff',
    backgroundColor: alphaone.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: alphaone.red },
  railBtn: { alignItems: 'center', gap: 2 },
});
