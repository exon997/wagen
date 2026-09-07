import { useCallback, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { alphaone } from '@wagen/domain';
import { Card, IconCircle, T, Wordmark } from '@/ui/kit';
import { listSessions, type LocalSession } from '@/lib/sessions';

/** "Prikazi sve" - puna lista vozila (sesija) na uredjaju. */
export default function VozilaScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<LocalSession[]>([]);

  useFocusEffect(
    useCallback(() => {
      void listSessions().then(setSessions);
    }, []),
  );

  const title = (s: LocalSession): string =>
    s.vehicleInfo
      ? `${s.vehicleInfo.make} ${s.vehicleInfo.model}${s.vehicleInfo.modelYear ? ` · ${s.vehicleInfo.modelYear}` : ''}`
      : 'Vozilo bez VIN-a';

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Wordmark small />
        <IconCircle glyph="⌂" onPress={() => router.dismissTo('/')} />
      </View>
      <FlatList
        data={sessions}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: 18, paddingTop: 6 }}
        ListHeaderComponent={
          <T w="extrabold" size={24} style={{ marginBottom: 12 }}>
            Sva vozila ({sessions.length})
          </T>
        }
        renderItem={({ item: s }) => (
          <Card style={styles.row}>
            <Pressable
              style={styles.rowInner}
              onPress={() => router.push({ pathname: '/sesija/[id]', params: { id: s.id } })}
            >
              {s.photos[0] ? (
                <Image
                  source={{ uri: s.photos[0].processedUri ?? s.photos[0].uri }}
                  style={styles.thumb}
                />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]} />
              )}
              <View style={{ flex: 1 }}>
                <T w="bold" size={17}>
                  {title(s)}
                </T>
                <T size={13} color={alphaone.muted} style={{ letterSpacing: 1.2 }}>
                  {s.vin ?? '—'}
                </T>
                <T size={13} color={alphaone.muted}>
                  {s.photos.length} fotografija · {new Date(s.updatedAt).toLocaleDateString('hr-HR')}
                </T>
              </View>
              <T w="bold" size={22} color={alphaone.amber}>
                ›
              </T>
            </Pressable>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: alphaone.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 40,
    paddingBottom: 8,
  },
  row: { marginBottom: 12, padding: 14 },
  rowInner: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  thumb: { width: 92, height: 70, borderRadius: 8, backgroundColor: alphaone.cardAlt },
  thumbEmpty: { borderWidth: 1, borderColor: alphaone.line },
});
