import { useCallback, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { colors } from '@wagen/domain';
import { getSession, updateSession, type LocalPhoto, type LocalSession } from '@/lib/sessions';
import { syncSession } from '@/lib/sync';

const ANGLE_LABELS: Record<string, string> = {
  exterior: 'Eksterijer',
  interior: 'Interijer',
  detail: 'Detalji',
};

/**
 * H2: Pregled fotografija sesije - grid s kategorijama kutova (13.3),
 * promjena redoslijeda i brisanje. Obrada (blok I) i izvoz (blok J)
 * nadovezuju se na ovaj ekran.
 */
export default function PhotosScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<LocalSession | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (id) void getSession(id).then(setSession);
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
      <FlatList
        data={session.photos}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        ListEmptyComponent={<Text style={styles.muted}>Jos nema fotografija.</Text>}
        renderItem={({ item, index }) => (
          <View style={styles.cell}>
            <Image source={{ uri: item.uri }} style={styles.thumb} resizeMode="cover" />
            <View style={styles.meta}>
              <Text style={styles.angle}>
                {item.angleCategory ? (ANGLE_LABELS[item.angleCategory] ?? '') : '—'}
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
});
