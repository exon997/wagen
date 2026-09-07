import { useCallback, useState } from 'react';
import { Alert, FlatList, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { alphaone } from '@wagen/domain';
import { Card, Cta, IconCircle, T, Wordmark } from '@/ui/kit';
import { getSupabase } from '@/lib/supabase';
import { getCachedDealerContext } from '@/lib/dealer';
import { getSession, updateSession, type LocalPhoto, type LocalSession } from '@/lib/sessions';
import { syncSession } from '@/lib/sync';

const ANGLE_LABELS: Record<string, string> = {
  exterior: 'Eksterijer',
  interior: 'Interijer',
  detail: 'Detalji',
  trunk: 'Prtljažnik',
  feature: 'Značajke i oprema',
  mechanical: 'Mehanika',
};

/**
 * Pregled i obrada v2 (dizajn vlasnika 2026-09-07): AlphaOne kartice,
 * amber CTA za obradu, "Preuzmi Dossier (PDF)" na obradjenom vozilu
 * (Dodatno 3) - dijeli se ravno s telefona. Izlog ostaje samo u Kokpitu.
 */
export default function PhotosScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<LocalSession | null>(null);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [dossierBusy, setDossierBusy] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  // I2: obrada zivi u modulu (ne u ekranu) i svaku fotku sprema odmah -
  // izlazak s ekrana nista ne gubi, povratak se prikvaci na napredak
  const processAllFrom = async (target: LocalSession | null) => {
    if (!target || processing) return;
    setProcessing(true);
    try {
      const { processSessionPhotos } = await import('@/lib/processing');
      const { result } = await processSessionPhotos(target, (done, total) =>
        setProgress(`${done}/${total}`),
      );
      const fresh = await getSession(target.id);
      if (fresh) setSession(fresh);
      if (result.processed === 0 && result.failed === 0 && result.skipped > 0) {
        Alert.alert(
          'Bez obrade',
          'Uređaj ne podržava punu obradu ili su sve eksterijer fotke već obrađene.',
        );
      } else if (result.failed > 0) {
        Alert.alert('Djelomično', `Obrađeno ${result.processed}, palo ${result.failed}.`);
      }
    } finally {
      setProcessing(false);
      setProgress('');
    }
  };

  const processAll = () => processAllFrom(session);

  // Ponovna obrada: ocisti processedUri (original se UVIJEK cuva) pa
  // pokreni ispocetka. Fair-use se ne broji duplo (sesija vec oznacena).
  const reprocessAll = async () => {
    if (!session || processing) return;
    const cleared = await updateSession(session.id, {
      photos: session.photos.map(({ processedUri: _drop, processedRemotePath: _drop2, ...p }) => p),
    });
    setSession(cleared);
    await processAllFrom(cleared);
  };

  // J1: spremanje u galeriju telefona - fotke koje korisnik nosi dalje
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
      const errorSuffix = firstError ? `\n\nGreška: ${firstError}` : '';
      Alert.alert(
        saved > 0 ? 'Spremljeno' : 'Spremanje nije uspjelo',
        `${saved} od ${session.photos.length} fotografija je u galeriji.${errorSuffix}`,
      );
    } finally {
      setSaving(false);
    }
  };

  // Dodatno 3: Dossier PDF ravno iz aplikacije - podijeli kupcu s telefona
  const makeDossier = async () => {
    if (!session || dossierBusy) return;
    setDossierBusy(true);
    try {
      let equipment: string[] = [];
      const supabase = getSupabase();
      if (session.vehicleId && supabase) {
        const { data } = await supabase
          .from('vehicle_equipment')
          .select('equipment_codes(name_hr)')
          .eq('vehicle_id', session.vehicleId);
        equipment = (data ?? [])
          .map((r) => r.equipment_codes?.name_hr)
          .filter((n): n is string => !!n);
      }
      const dealer = await getCachedDealerContext();
      const { generateDossierPdf } = await import('@/lib/dossier');
      const uri = await generateDossierPdf({
        session,
        dealerName: dealer?.displayName ?? null,
        equipment,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
      } else {
        Alert.alert('Dossier spreman', `PDF je spremljen: ${uri}`);
      }
    } catch (e) {
      Alert.alert('Dossier nije uspio', e instanceof Error ? e.message : String(e));
    } finally {
      setDossierBusy(false);
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
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <T color={alphaone.muted}>Učitavanje…</T>
      </View>
    );
  }

  const processedCount = session.photos.filter((p) => p.processedUri).length;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Wordmark small />
        <IconCircle glyph="⌂" onPress={() => router.dismissTo('/')} />
      </View>

      <T w="extrabold" size={24} style={{ marginBottom: 10 }}>
        Pregled i obrada ({session.photos.length})
      </T>

      {session.photos.length > 0 && (
        <>
          <Cta
            label={processing ? `Obrađujem… ${progress}` : 'Obradi fotografije'}
            arrow={!processing}
            onPress={() => void processAll()}
            disabled={processing}
            style={[styles.topCta, processing && { opacity: 0.6 }]}
          />
          {!processing && processedCount > 0 && (
            <Pressable style={styles.linkRow} onPress={() => void reprocessAll()}>
              <T w="semibold" size={13} color={alphaone.muted}>
                Obradi ponovno (nove postavke) — originali su sačuvani
              </T>
            </Pressable>
          )}
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.secondaryBtn, saving && { opacity: 0.5 }]}
              onPress={() => void saveAllToGallery()}
              disabled={saving}
            >
              <T w="bold" size={14}>
                {saving ? 'Spremam…' : 'Spremi u galeriju'}
              </T>
            </Pressable>
            {processedCount > 0 && (
              <Pressable
                style={[styles.secondaryBtn, dossierBusy && { opacity: 0.5 }]}
                onPress={() => void makeDossier()}
                disabled={dossierBusy}
              >
                <T w="bold" size={14}>
                  {dossierBusy ? 'Slažem PDF…' : 'Preuzmi Dossier (PDF)'}
                </T>
              </Pressable>
            )}
          </View>
        </>
      )}

      <FlatList
        data={session.photos}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        ListEmptyComponent={
          <T color={alphaone.muted} style={{ marginTop: 24, textAlign: 'center' }}>
            Još nema fotografija.
          </T>
        }
        renderItem={({ item, index }) => (
          <Card style={styles.cell}>
            <Pressable onPress={() => setViewerUri(item.processedUri ?? item.uri)}>
              <Image
                source={{ uri: item.processedUri ?? item.uri }}
                style={styles.thumb}
                resizeMode="cover"
              />
            </Pressable>
            <View style={styles.meta}>
              <T w="semibold" size={11} color={item.processedUri ? alphaone.green : alphaone.muted}>
                {item.angleCategory ? (ANGLE_LABELS[item.angleCategory] ?? '') : '—'}
                {item.processedUri ? ' · obrađeno ✓' : ''}
              </T>
              <T size={10} color={alphaone.muted}>
                {item.remotePath ? '☁' : '⌛'}
              </T>
            </View>
            <View style={styles.actions}>
              <Pressable onPress={() => move(index, -1)} hitSlop={8}>
                <T w="bold" size={16}>
                  ◀
                </T>
              </Pressable>
              <Pressable onPress={() => remove(index)} hitSlop={8}>
                <T w="bold" size={16} color={alphaone.muted}>
                  ✕
                </T>
              </Pressable>
              <Pressable onPress={() => move(index, 1)} hitSlop={8}>
                <T w="bold" size={16}>
                  ▶
                </T>
              </Pressable>
            </View>
          </Card>
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
          <T size={12} color="#bbb" style={{ marginTop: 8 }}>
            Dodirni za zatvaranje
          </T>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: alphaone.bg, padding: 18, paddingTop: 40 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  topCta: { marginBottom: 8 },
  linkRow: { alignItems: 'center', paddingVertical: 6 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 12, marginTop: 4 },
  secondaryBtn: {
    flex: 1,
    backgroundColor: alphaone.card,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: alphaone.amber,
    paddingVertical: 12,
    alignItems: 'center',
  },
  row: { gap: 12 },
  cell: { flex: 1, marginBottom: 12, padding: 8, borderRadius: 14 },
  thumb: { width: '100%', aspectRatio: 4 / 3, borderRadius: 8, backgroundColor: alphaone.cardAlt },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    marginTop: 4,
  },
  viewer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: { width: '100%', height: '86%' },
});
