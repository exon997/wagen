import { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import * as ScreenOrientation from 'expo-screen-orientation';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { colors } from '@wagen/domain';
import { getSession, updateSession, type LocalPhoto, type LocalSession } from '@/lib/sessions';
import { syncSession } from '@/lib/sync';
import { GUIDED_SHOTS } from '@/lib/guided-shots';

/**
 * H1 v3: Vodjeno fotografiranje (spec vlasnika 2026-09-07):
 * - prikaz kamere je TOCNO 4:3 (isto sto i fotografija - korisnik zna sto slika)
 * - dijagonale: ZONA (kutne zagrade) u koju se auto smjesta - radi za
 *   svaki oblik vozila (Smart, XM, V-klasa...), bez modelskih silueta
 * - sprijeda/straga: horizontalne linije za ravnanje auta; bez libele
 * - veliki, suncano-citljivi natpisi: gore "EKSTERIJER 1/16", dolje
 *   naslov kadra + uputa + visina slikanja
 * - robusni gumbi: velika strelica natrag, velik Preskoci
 *
 * Format: SVE fotke izlaze kao tocno 4:3 landscape (13.1), centralni
 * crop + resize na max 2400px sirine.
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

  const isNaslovna = shot?.key === 'ext-front-left';

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Lijeva traka: natrag + kadrovi s napretkom */}
      <View style={styles.leftRail}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={16}
          style={styles.backButton}
          accessibilityLabel="Natrag"
        >
          <Text style={styles.backArrow}>←</Text>
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

      {/* Kamera: TOCNO 4:3, letterbox oko toga */}
      <View style={styles.cameraArea}>
        <View style={styles.cameraBox}>
          <CameraView ref={setCameraRef} style={StyleSheet.absoluteFill} facing="back" />

          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {/* Zona za dijagonale: kutne zagrade + linija poda */}
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

            {/* Gore: sekcija i brojac - veliko i citljivo na suncu */}
            <View style={styles.topPill}>
              <Text style={styles.topPillText}>
                {shot ? `${shot.section.toUpperCase()} ${stepIndex + 1}/${GUIDED_SHOTS.length}` : ''}
              </Text>
            </View>

            {/* Dolje: naslov kadra + uputa + visina */}
            {shot && (
              <View style={styles.bottomPill}>
                <Text style={styles.bottomTitle}>
                  {shot.title}
                  {isNaslovna ? '  (Naslovna)' : ''}
                </Text>
                <Text style={styles.bottomHint}>{shot.hint}</Text>
                {shot.angleCategory === 'exterior' && (
                  <Text style={styles.bottomHeight}>Slikaj s visine 80–90 cm</Text>
                )}
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Desna traka: okidac + preskoci */}
      <View style={styles.rightRail}>
        <Pressable
          style={[styles.shutter, busy && styles.shutterBusy]}
          onPress={() => void capture()}
          disabled={busy}
          accessibilityLabel="Slikaj"
        >
          <View style={styles.shutterInner} />
        </Pressable>

        <Pressable
          style={styles.skipButton}
          onPress={() =>
            stepIndex + 1 >= GUIDED_SHOTS.length ? router.back() : setStepIndex((i) => i + 1)
          }
          hitSlop={10}
        >
          <Text style={styles.skipText}>Preskoci</Text>
        </Pressable>
      </View>
    </View>
  );
}

const GUIDE = 'rgba(30, 220, 232, 0.9)';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black, flexDirection: 'row' },
  leftRail: { width: 96, alignItems: 'center', paddingVertical: 10, gap: 8 },
  backButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  backArrow: { color: colors.white, fontSize: 28, lineHeight: 30 },
  shotCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 2,
    borderColor: colors.gray,
    marginVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  shotCircleActive: { borderColor: colors.cyan, borderWidth: 3 },
  shotThumb: { width: '100%', height: '100%' },
  shotNumber: { color: colors.gray, fontSize: 18, fontWeight: '600' },

  cameraArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cameraBox: {
    height: '100%',
    aspectRatio: 4 / 3,
    maxWidth: '100%',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#000',
  },

  zone: {
    position: 'absolute',
    left: '6%',
    right: '6%',
    top: '20%',
    bottom: '10%',
  },
  corner: { position: 'absolute', width: 42, height: 42, borderColor: GUIDE },
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
    backgroundColor: 'rgba(30, 220, 232, 0.45)',
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
    top: 10,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  topPillText: { color: colors.white, fontSize: 20, fontWeight: '800', letterSpacing: 1 },
  bottomPill: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 8,
    maxWidth: '92%',
  },
  bottomTitle: { color: colors.white, fontSize: 22, fontWeight: '800' },
  bottomHint: { color: '#e8e8e8', fontSize: 15, marginTop: 2, textAlign: 'center' },
  bottomHeight: { color: colors.cyan, fontSize: 15, fontWeight: '700', marginTop: 2 },

  hint: { color: colors.gray, fontSize: 14, textAlign: 'center', marginTop: 40 },
  rightRail: { width: 112, alignItems: 'center', justifyContent: 'center', gap: 26 },
  shutter: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 4,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterBusy: { opacity: 0.5 },
  shutterInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.white },
  skipButton: {
    borderColor: colors.gray,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  skipText: { color: colors.white, fontSize: 16, fontWeight: '600' },
});
