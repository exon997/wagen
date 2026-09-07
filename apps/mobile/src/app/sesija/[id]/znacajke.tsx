import { useEffect, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Crypto from 'expo-crypto';
import { alphaone } from '@wagen/domain';
import { Card, IconCircle, T, Wordmark } from '@/ui/kit';
import { getSupabase } from '@/lib/supabase';
import { getSession, mutateSession, updateSession, type LocalPhoto } from '@/lib/sessions';
import { syncSession } from '@/lib/sync';

interface EquipmentItem {
  code: string;
  name: string;
  photoSuggest: boolean;
  rank: number;
  hint: string;
  photoUri?: string;
}

/**
 * Znacajke i oprema v2 (Dodatno 4, 2026-09-07): oprema vozila kao
 * PREGLEDNA LISTA (ne cipovi) - stavke vrijedne fotografiranja imaju
 * ikonu kamere; ispod je "Naknadno ugradjena oprema" s (+) unosom -
 * odvojena kategorija koju je prodavac sam ugradio, ide u
 * listings.attributes.retrofit_equipment pri objavi.
 */
export default function FeaturesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [items, setItems] = useState<EquipmentItem[] | null>(null);
  const [retrofit, setRetrofit] = useState<string[]>([]);
  const [newEntry, setNewEntry] = useState('');
  const [adding, setAdding] = useState(false);
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraRef, setCameraRef] = useState<CameraView | null>(null);

  useEffect(() => {
    void (async () => {
      if (!id) return;
      const session = await getSession(id);
      setRetrofit(session?.retrofitEquipment ?? []);
      const supabase = getSupabase();
      if (!session?.vehicleId || !supabase) {
        setItems([]);
        return;
      }
      const { data } = await supabase
        .from('vehicle_equipment')
        .select('equipment_codes(code, name_hr, photo_suggest, photo_rank, photo_hint)')
        .eq('vehicle_id', session.vehicleId);
      const list: EquipmentItem[] = (data ?? [])
        .map((r) => r.equipment_codes)
        .filter((e) => e && e.name_hr)
        .map((e) => ({
          code: e!.code,
          name: e!.name_hr!,
          photoSuggest: !!e!.photo_suggest,
          rank: e!.photo_rank ?? 0,
          hint: e!.photo_hint ?? '',
        }))
        // Fotogenicne znacajke na vrh, ostalo abecedno - citljiva lista
        .sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name, 'hr'));
      for (const s of list) {
        const taken = session.photos.find((p) => p.uri.includes(`feature-${s.code}-`));
        if (taken) s.photoUri = taken.uri;
      }
      setItems(list);
    })();
  }, [id]);

  const saveRetrofit = async (next: string[]) => {
    setRetrofit(next);
    if (id) {
      const updated = await updateSession(id, { retrofitEquipment: next });
      void syncSession(updated);
    }
  };

  const addRetrofit = () => {
    const value = newEntry.trim();
    if (!value) return;
    setNewEntry('');
    setAdding(false);
    void saveRetrofit([...retrofit, value]);
  };

  const capture = async () => {
    if (!cameraRef || busy || !id || !activeCode) return;
    setBusy(true);
    try {
      const photo = await cameraRef.takePictureAsync({ quality: 0.9 });

      // Isti 4:3 format kao svi ostali kadrovi (13.1) - centralni crop
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
      const stored = new File(dir, `feature-${activeCode}-${Crypto.randomUUID().slice(0, 8)}.jpg`);
      await new File(saved.uri).move(stored);
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
      setItems(
        (prev) =>
          prev?.map((s) => (s.code === activeCode ? { ...s, photoUri: stored.uri } : s)) ?? null,
      );
      setActiveCode(null);
    } finally {
      setBusy(false);
    }
  };

  const active = items?.find((s) => s.code === activeCode);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Wordmark small />
        <IconCircle glyph="⌂" onPress={() => router.dismissTo('/')} />
      </View>

      <T w="extrabold" size={24} style={{ marginBottom: 12 }}>
        Značajke i oprema
      </T>

      <Card>
        <T w="bold" size={18} style={{ marginBottom: 4 }}>
          Oprema vozila
        </T>
        {items === null ? (
          <T size={13} color={alphaone.muted}>
            Učitavanje opreme…
          </T>
        ) : items.length === 0 ? (
          <T size={13} color={alphaone.muted}>
            Nema podataka — vozilo nije dekodirano ili dobavljač ne vraća opremu.
          </T>
        ) : (
          <>
            <T size={12} color={alphaone.muted} style={{ marginBottom: 8 }}>
              Stavke s 📷 vrijedi fotografirati — dodirni ih:
            </T>
            {items.map((item, i) => (
              <Pressable
                key={item.code}
                style={[styles.listRow, i < items.length - 1 && styles.listDivider]}
                onPress={item.photoSuggest ? () => setActiveCode(item.code) : undefined}
              >
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <T size={15}>
                    {item.name}
                    {item.rank >= 4 ? '  🔥' : ''}
                  </T>
                  {item.photoSuggest && !item.photoUri && (
                    <T size={11} color={alphaone.muted}>
                      📷 {item.hint || 'Fotografiraj ovu značajku'}
                    </T>
                  )}
                  {item.photoUri && (
                    <T w="semibold" size={11} color={alphaone.green}>
                      Fotografirano ✓
                    </T>
                  )}
                </View>
                {item.photoUri && <Image source={{ uri: item.photoUri }} style={styles.rowThumb} />}
              </Pressable>
            ))}
          </>
        )}
      </Card>

      <Card>
        <View style={styles.retrofitHead}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <T w="bold" size={18}>
              Naknadno ugrađena oprema
            </T>
            <T size={12} color={alphaone.muted}>
              Kuka, glazba, felge… — što je ugrađeno nakon kupnje
            </T>
          </View>
          <IconCircle glyph="+" size={44} onPress={() => setAdding(true)} />
        </View>

        {retrofit.map((item, i) => (
          <View key={`${item}-${i}`} style={[styles.listRow, styles.listDivider]}>
            <T size={15} style={{ flex: 1 }}>
              {item}
            </T>
            <Pressable onPress={() => void saveRetrofit(retrofit.filter((_, j) => j !== i))} hitSlop={10}>
              <T w="bold" size={16} color={alphaone.muted}>
                ✕
              </T>
            </Pressable>
          </View>
        ))}
        {retrofit.length === 0 && !adding && (
          <T size={13} color={alphaone.muted} style={{ marginTop: 8 }}>
            Još ništa dodano.
          </T>
        )}

        {adding && (
          <View style={styles.addRow}>
            <TextInput
              style={styles.addInput}
              value={newEntry}
              onChangeText={setNewEntry}
              placeholder="npr. Kuka za prikolicu"
              placeholderTextColor={alphaone.muted}
              autoFocus
              onSubmitEditing={addRetrofit}
              returnKeyType="done"
            />
            <Pressable style={styles.addBtn} onPress={addRetrofit}>
              <T w="bold" size={14}>
                Dodaj
              </T>
            </Pressable>
          </View>
        )}
      </Card>

      <Modal
        visible={!!activeCode}
        animationType="slide"
        onRequestClose={() => setActiveCode(null)}
      >
        <View style={styles.cameraModal}>
          {permission?.granted ? (
            <>
              <View style={styles.cameraArea}>
                {/* Okvir 4:3 - identican formatu svih ostalih fotografija */}
                <View style={styles.cameraWrap}>
                  <CameraView ref={setCameraRef} style={StyleSheet.absoluteFill} facing="back" />
                  <View style={styles.cameraHint}>
                    <T w="bold" size={14} color="#fff" style={{ textAlign: 'center' }}>
                      {active?.name}
                    </T>
                    {!!active?.hint && (
                      <T size={12} color="#ddd" style={{ textAlign: 'center' }}>
                        {active.hint}
                      </T>
                    )}
                  </View>
                </View>
              </View>
              <View style={styles.cameraControls}>
                <Pressable onPress={() => setActiveCode(null)} hitSlop={10}>
                  <T w="semibold" size={15} color={alphaone.muted}>
                    Odustani
                  </T>
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
            <Pressable
              style={[styles.cameraModal, { alignItems: 'center', justifyContent: 'center' }]}
              onPress={() => void requestPermission()}
            >
              <T color={alphaone.muted}>Dodirni za dozvolu kamere</T>
            </Pressable>
          )}
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: alphaone.bg },
  content: { padding: 18, paddingTop: 40, paddingBottom: 36 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  listDivider: { borderBottomWidth: 1, borderBottomColor: alphaone.cardAlt },
  rowThumb: { width: 56, height: 42, borderRadius: 6 },
  retrofitHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  addRow: { flexDirection: 'row', gap: 10, marginTop: 12, alignItems: 'center' },
  addInput: {
    flex: 1,
    fontFamily: 'Exo2-Medium',
    fontSize: 15,
    color: alphaone.ink,
    backgroundColor: alphaone.cardAlt,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  addBtn: {
    backgroundColor: alphaone.amber,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  cameraModal: { flex: 1, backgroundColor: '#111' },
  cameraArea: { flex: 1, justifyContent: 'center', paddingHorizontal: 12 },
  cameraWrap: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 12,
    overflow: 'hidden',
  },
  cameraHint: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    maxWidth: '90%',
  },
  cameraControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingBottom: 24,
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: alphaone.red },
});
