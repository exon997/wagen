import { useEffect, useState } from 'react';
import { FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { colors } from '@wagen/domain';
import { getSupabase } from '@/lib/supabase';
import { getSession, mutateSession, type LocalPhoto } from '@/lib/sessions';
import { syncSession } from '@/lib/sync';

interface Suggestion {
  code: string;
  name: string;
  rank: number;
  hint: string;
  photoUri?: string;
}

/**
 * Znacajke i oprema (spec 2026-08-25): app PREDLAZE sto fotografirati iz
 * dekodirane opreme vozila - samo znacajke koje standardnih 16 kadrova ne
 * pokriva, rangirane po prodajnoj vrijednosti (klasifikacija u rjecniku).
 * Fotka se veze uz kod opreme -> oglas kasnije pokazuje "dokaz" znacajke.
 */
export default function FeaturesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraRef, setCameraRef] = useState<CameraView | null>(null);

  useEffect(() => {
    void (async () => {
      if (!id) return;
      const session = await getSession(id);
      const supabase = getSupabase();
      if (!session?.vehicleId || !supabase) {
        setSuggestions([]);
        return;
      }
      const { data } = await supabase
        .from('vehicle_equipment')
        .select('equipment_codes(code, name_hr, photo_suggest, photo_rank, photo_hint)')
        .eq('vehicle_id', session.vehicleId);
      const items: Suggestion[] = (data ?? [])
        .map((r) => r.equipment_codes)
        .filter((e) => e && e.photo_suggest && e.name_hr)
        .map((e) => ({
          code: e!.code,
          name: e!.name_hr!,
          rank: e!.photo_rank ?? 1,
          hint: e!.photo_hint ?? '',
        }))
        .sort((a, b) => b.rank - a.rank);
      // vec snimljene znacajke iz sesije
      for (const s of items) {
        const taken = session.photos.find((p) => p.uri.includes(`feature-${s.code}-`));
        if (taken) s.photoUri = taken.uri;
      }
      setSuggestions(items);
    })();
  }, [id]);

  const capture = async () => {
    if (!cameraRef || busy || !id || !activeCode) return;
    setBusy(true);
    try {
      const photo = await cameraRef.takePictureAsync({ quality: 0.9 });
      const dir = new Directory(Paths.document, 'sessions', id);
      dir.create({ intermediates: true, idempotent: true });
      const stored = new File(dir, `feature-${activeCode}-${Crypto.randomUUID().slice(0, 8)}.jpg`);
      await new File(photo.uri).move(stored);
      const local: LocalPhoto = {
        id: Crypto.randomUUID(),
        uri: stored.uri,
        angleCategory: 'feature',
        sortOrder: 999,
      };
      const updated = await mutateSession(id, (current) => ({
        photos: [...current.photos, local],
      }));
      void syncSession(updated);
      setSuggestions(
        (prev) =>
          prev?.map((s) => (s.code === activeCode ? { ...s, photoUri: stored.uri } : s)) ?? null,
      );
      setActiveCode(null);
    } finally {
      setBusy(false);
    }
  };

  const active = suggestions?.find((s) => s.code === activeCode);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Znacajke i oprema' }} />
      {suggestions === null ? (
        <Text style={styles.muted}>Ucitavanje opreme…</Text>
      ) : suggestions.length === 0 ? (
        <Text style={styles.muted}>
          Nema prijedloga - vozilo nije dekodirano ili oprema nema posebnih znacajki.
        </Text>
      ) : (
        <>
          <Text style={styles.intro}>
            Ovo vozilo ima opremu koju vrijedi pokazati. Dodirni znacajku i fotografiraj je:
          </Text>
          <FlatList
            data={suggestions}
            keyExtractor={(s) => s.code}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.chip, item.photoUri && styles.chipDone]}
                onPress={() => setActiveCode(item.code)}
              >
                <View style={styles.chipText}>
                  <Text style={styles.chipTitle}>
                    {item.photoUri ? '✓ ' : ''}
                    {item.name}
                    {item.rank >= 4 ? ' 🔥' : ''}
                  </Text>
                  <Text style={styles.chipHint}>{item.hint}</Text>
                </View>
                {item.photoUri && (
                  <Image source={{ uri: item.photoUri }} style={styles.chipThumb} />
                )}
              </Pressable>
            )}
          />
        </>
      )}

      <Modal
        visible={!!activeCode}
        animationType="slide"
        onRequestClose={() => setActiveCode(null)}
      >
        <View style={styles.cameraModal}>
          {permission?.granted ? (
            <>
              <View style={styles.cameraWrap}>
                <CameraView ref={setCameraRef} style={StyleSheet.absoluteFill} facing="back" />
                <Text style={styles.cameraHint}>
                  {active?.name}
                  {'\n'}
                  {active?.hint}
                </Text>
              </View>
              <View style={styles.cameraControls}>
                <Pressable onPress={() => setActiveCode(null)}>
                  <Text style={styles.cancel}>Odustani</Text>
                </Pressable>
                <Pressable
                  style={[styles.shutter, busy && { opacity: 0.5 }]}
                  onPress={() => void capture()}
                  disabled={busy}
                >
                  <View style={styles.shutterInner} />
                </Pressable>
                <View style={{ width: 60 }} />
              </View>
            </>
          ) : (
            <Pressable style={styles.container} onPress={() => void requestPermission()}>
              <Text style={styles.muted}>Dodirni za dozvolu kamere</Text>
            </Pressable>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black, padding: 16 },
  intro: { color: colors.gray, fontSize: 14, marginBottom: 14 },
  muted: { color: colors.gray, fontSize: 14, marginTop: 24, textAlign: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: colors.gray,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  chipDone: { borderColor: colors.cyan },
  chipText: { flex: 1 },
  chipTitle: { color: colors.white, fontSize: 15, fontWeight: '600' },
  chipHint: { color: colors.gray, fontSize: 12, marginTop: 2 },
  chipThumb: { width: 56, height: 42, borderRadius: 6, marginLeft: 10 },
  cameraModal: { flex: 1, backgroundColor: colors.black },
  cameraWrap: { flex: 1, margin: 12, borderRadius: 12, overflow: 'hidden' },
  cameraHint: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    color: colors.white,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    fontSize: 13,
    textAlign: 'center',
  },
  cameraControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingBottom: 24,
  },
  cancel: { color: colors.gray, fontSize: 15, width: 60 },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.cyan },
});
