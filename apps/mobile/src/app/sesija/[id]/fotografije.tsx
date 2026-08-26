import { useCallback, useState } from 'react';
import { Alert, FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as MediaLibrary from 'expo-media-library/legacy';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { colors } from '@wagen/domain';
import { getSession, updateSession, type LocalPhoto, type LocalSession } from '@/lib/sessions';
import { syncSession } from '@/lib/sync';

const ANGLE_LABELS: Record<string, string> = {
  exterior: 'Eksterijer',
  interior: 'Interijer',
  detail: 'Detalji',
  trunk: 'Prtljaznik',
  feature: 'Znacajke i oprema',
  mechanical: 'Mehanika',
};

/**
 * H2: Pregled fotografija sesije - grid s kategorijama kutova (13.3),
 * promjena redoslijeda i brisanje. Obrada (blok I) i izvoz (blok J)
 * nadovezuju se na ovaj ekran.
 */
export default function PhotosScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<LocalSession | null>(null);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  // I2: obrada zivi u modulu (ne u ekranu) i svaku fotku sprema odmah -
  // izlazak s ekrana nista ne gubi, povratak se prikvaci na napredak
  const processAll = async () => {
    if (!session || processing) return;
    setProcessing(true);
    try {
      const { processSessionPhotos } = await import('@/lib/processing');
      const { result } = await processSessionPhotos(session, (done, total) =>
        setProgress(`${done}/${total}`),
      );
      const fresh = await getSession(session.id);
      if (fresh) setSession(fresh);
      if (result.processed === 0 && result.failed === 0 && result.skipped > 0) {
        Alert.alert(
          'Bez obrade',
          'Uredjaj ne podrzava punu obradu ili su sve eksterijer fotke vec obradjene.',
        );
      } else if (result.failed > 0) {
        Alert.alert('Djelomicno', `Obradjeno ${result.processed}, palo ${result.failed}.`);
      }
    } finally {
      setProcessing(false);
      setProgress('');
    }
  };

  // J1 (izvucen naprijed): spremanje u galeriju telefona - srce foto moda.
  // Album 'wagen' = fotke koje korisnik nosi na FB/Njuskalo (distribucija 4.4).
  const saveAllToGallery = async () => {
    if (!session || saving) return;
    setSaving(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Bez dozvole', 'Za spremanje u galeriju treba dozvola za fotografije.');
        return;
      }
      let saved = 0;
      let firstError: string | null = null;
      for (const photo of session.photos) {
        try {
          await MediaLibrary.saveToLibraryAsync(photo.processedUri ?? photo.uri);
          saved += 1;
        } catch (e) {
          if (!firstError) firstError = e instanceof Error ? e.message : String(e);
        }
      }
      const errorSuffix = firstError ? `\n\nGreska: ${firstError}` : '';
      Alert.alert(
        saved > 0 ? 'Spremljeno' : 'Spremanje nije uspjelo',
        `${saved} od ${session.photos.length} fotografija je u galeriji.${errorSuffix}`,
      );
    } finally {
      setSaving(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      void getSession(id).then(setSession);
      // Prikvaci se na obradu koja mozda vec tece (povratak na ekran)
      let unsub: (() => void) | undefined;
      void import('@/lib/processing').then(({ getActiveProcessing, subscribeProcessing }) => {
        const active = getActiveProcessing();
        if (active?.sessionId === id) {
          setProcessing(true);
          setProgress(`${active.done}/${active.total}`);
        }
        unsub = subscribeProcessing((run) => {
          if (run && run.sessionId === id) {
            setProcessing(true);
            setProgress(`${run.done}/${run.total}`);
          } else {
            setProcessing(false);
            setProgress('');
          }
          void getSession(id).then(setSession);
        });
      });
      return () => unsub?.();
    }, [id]),
  );

  const mutate = async (photos: LocalPhoto[]) => {
    if (!id) return;
    const normalized = photos.map((p, i) => ({ ...p, sortOrder: i }));
    const updated = await updateSession(id, { photos: normalized });
    setSession(updated);
    void syncSession(updated);
  };

  const move = (index: number, dir: -1 | 1) => {
    if (!session) return;
    const photos = [...session.photos];
    const target = index + dir;
    if (target < 0 || target >= photos.length) return;
    const a = photos[index]!;
    photos[index] = photos[target]!;
    photos[target] = a;
    void mutate(photos);
  };

  const remove = (index: number) => {
    if (!session) return;
    void mutate(session.photos.filter((_, i) => i !== index));
  };

  if (!session) {
    return (
      <View style={styles.container}>
        <Text style={styles.muted}>Ucitavanje…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: `Fotografije (${session.photos.length})` }} />

      {session.photos.length > 0 && (
        <>
          <Pressable
            style={[styles.processButton, processing && styles.saveButtonBusy]}
            onPress={() => void processAll()}
            disabled={processing}
          >
            <Text style={styles.processButtonText}>
              {processing ? `Obradjujem… ${progress}` : 'Obradi fotografije'}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.saveButton, saving && styles.saveButtonBusy]}
            onPress={() => void saveAllToGallery()}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>
              {saving ? 'Spremam…' : 'Spremi sve u galeriju'}
            </Text>
          </Pressable>
        </>
      )}
      <FlatList
        data={session.photos}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        ListEmptyComponent={<Text style={styles.muted}>Jos nema fotografija.</Text>}
        renderItem={({ item, index }) => (
          <View style={styles.cell}>
            <Pressable onPress={() => setViewerUri(item.processedUri ?? item.uri)}>
              <Image
                source={{ uri: item.processedUri ?? item.uri }}
                style={styles.thumb}
                resizeMode="cover"
              />
            </Pressable>
            <View style={styles.meta}>
              <Text style={styles.angle}>
                {item.angleCategory ? (ANGLE_LABELS[item.angleCategory] ?? '') : '—'}
                {item.processedUri ? ' · obradjeno ✨' : ''}
              </Text>
              <Text style={styles.cloud}>{item.remotePath ? '☁ u oblaku' : '⌛ ceka upload'}</Text>
            </View>
            <View style={styles.actions}>
              <Pressable onPress={() => move(index, -1)} hitSlop={8}>
                <Text style={styles.action}>◀</Text>
              </Pressable>
              <Pressable onPress={() => remove(index)} hitSlop={8}>
                <Text style={[styles.action, styles.delete]}>✕</Text>
              </Pressable>
              <Pressable onPress={() => move(index, 1)} hitSlop={8}>
                <Text style={styles.action}>▶</Text>
              </Pressable>
            </View>
          </View>
        )}
      />

      <Modal
        visible={!!viewerUri}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerUri(null)}
      >
        <Pressable style={styles.viewer} onPress={() => setViewerUri(null)}>
          {viewerUri && (
            <Image source={{ uri: viewerUri }} style={styles.viewerImage} resizeMode="contain" />
          )}
          <Text style={styles.viewerHint}>Dodirni za zatvaranje</Text>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black, padding: 12 },
  row: { gap: 12 },
  cell: { flex: 1, marginBottom: 12 },
  thumb: { width: '100%', aspectRatio: 4 / 3, borderRadius: 8, backgroundColor: '#111' },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  angle: { color: colors.cyan, fontSize: 12 },
  cloud: { color: colors.gray, fontSize: 11 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginTop: 4,
  },
  action: { color: colors.white, fontSize: 16, padding: 4 },
  delete: { color: '#FF5555' },
  muted: { color: colors.gray, fontSize: 14 },
  saveButton: {
    backgroundColor: colors.cyan,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  saveButtonBusy: { opacity: 0.5 },
  viewer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: { width: '100%', height: '86%' },
  viewerHint: { color: colors.gray, fontSize: 12, marginTop: 8 },
  processButton: {
    borderColor: colors.cyan,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  processButtonText: { color: colors.cyan, fontWeight: '700', fontSize: 15 },
  saveButtonText: { color: colors.black, fontWeight: '700', fontSize: 15 },
});
