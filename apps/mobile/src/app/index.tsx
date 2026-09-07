import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { alphaone } from '@wagen/domain';
import { Card, Cta, IconCircle, T, Wordmark } from '@/ui/kit';
import { createSession, listSessions, type LocalSession } from '@/lib/sessions';
import { clearLastCrash, getLastCrash } from '@/lib/crash-log';
import { getCachedDealerContext, refreshDealerContext, type DealerContext } from '@/lib/dealer';
import { syncSession } from '@/lib/sync';

/**
 * Home (dizajn vlasnika 2026-09-07): zaliha na prvom mjestu - "Zadnje
 * dodano" s thumbnailovima i VIN-om, "Dodaj novo vozilo" kao glavna
 * akcija, salon kartica s profilom. Svijetla AlphaOne tema, Exo 2.
 */
export default function HomeScreen() {
  const router = useRouter();
  const [crash, setCrash] = useState<string | null>(null);
  const [dealer, setDealer] = useState<DealerContext | null>(null);
  const [recent, setRecent] = useState<LocalSession[]>([]);

  useEffect(() => {
    void getLastCrash().then((c) =>
      setCrash(c ? `${c.at}${c.fatal ? ' (fatal)' : ''}\n${c.error}` : null),
    );
    void refreshDealerContext().then(setDealer);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void getCachedDealerContext().then(setDealer);
      void listSessions().then((all) => setRecent(all.slice(0, 3)));
    }, []),
  );

  const start = async () => {
    const session = await createSession('photo', dealer?.dealerId ?? null);
    void syncSession(session);
    router.push({ pathname: '/sesija/[id]', params: { id: session.id } });
  };

  const vehicleTitle = (s: LocalSession): string =>
    s.vehicleInfo
      ? `${s.vehicleInfo.make} ${s.vehicleInfo.model}${s.vehicleInfo.modelYear ? ` · ${s.vehicleInfo.modelYear}` : ''}`
      : 'Vozilo bez VIN-a';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.brandRow}>
        <Wordmark />
      </View>

      {crash && (
        <Card style={{ borderWidth: 2, borderColor: alphaone.red }}>
          <T w="bold" size={14} color={alphaone.red}>
            Zadnje rušenje (slikaj ovo):
          </T>
          <Text style={styles.crashText}>{crash}</Text>
          <Pressable
            onPress={() => {
              void clearLastCrash();
              setCrash(null);
            }}
          >
            <T w="semibold" size={14} color={alphaone.muted}>
              Zatvori
            </T>
          </Pressable>
        </Card>
      )}

      {/* Salon kartica */}
      <Card style={styles.salonCard}>
        <View style={{ flex: 1 }}>
          <T w="extrabold" size={30}>
            {dealer ? dealer.displayName : 'wagen AlphaOne'}
          </T>
          <T w="semibold" size={14} color={alphaone.muted}>
            {dealer
              ? `AI studio: ${dealer.studioUsedThisMonth}/${dealer.studioMonthlyLimit} vozila`
              : 'Prijavi salon za brandirane fotografije'}
          </T>
        </View>
        <IconCircle glyph="👤" size={56} onPress={() => router.push('/salon')} />
      </Card>

      {/* Zadnje dodano */}
      <Card>
        <T w="extrabold" size={22} style={{ marginBottom: 14 }}>
          Zadnje dodano
        </T>
        {recent.length === 0 && (
          <T size={14} color={alphaone.muted} style={{ marginBottom: 8 }}>
            Još nema vozila — dodaj prvo dolje.
          </T>
        )}
        {recent.map((s) => (
          <Pressable
            key={s.id}
            style={styles.vehicleRow}
            onPress={() => router.push({ pathname: '/sesija/[id]', params: { id: s.id } })}
          >
            {s.photos[0] ? (
              <Image
                source={{ uri: s.photos[0].processedUri ?? s.photos[0].uri }}
                style={styles.vehicleThumb}
              />
            ) : (
              <View style={[styles.vehicleThumb, styles.vehicleThumbEmpty]} />
            )}
            <View style={{ flex: 1 }}>
              <T w="bold" size={17}>
                {vehicleTitle(s)}
              </T>
              <T size={14} color={alphaone.muted} style={styles.vinText}>
                {s.vin ?? `${s.photos.length} fotografija`}
              </T>
            </View>
          </Pressable>
        ))}
        {recent.length > 0 && (
          <Cta label="Prikaži sve" arrow={false} style={{ marginTop: 10 }} onPress={() => router.push('/vozila')} />
        )}
      </Card>

      {/* Akcije */}
      <Card>
        <Pressable style={styles.actionRow} onPress={() => void start()}>
          <T w="extrabold" size={22} style={{ flex: 1, textAlign: 'right', marginRight: 16 }}>
            Dodaj novo vozilo
          </T>
          <IconCircle glyph="+" size={62} onPress={() => void start()} />
        </Pressable>
        <Pressable style={styles.actionRow} onPress={() => router.push('/salon')}>
          <T w="extrabold" size={22} style={{ flex: 1, textAlign: 'right', marginRight: 16 }}>
            Postavke
          </T>
          <IconCircle glyph="⚙" size={62} onPress={() => router.push('/salon')} />
        </Pressable>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: alphaone.bg },
  content: { padding: 18, paddingTop: 40, paddingBottom: 40 },
  brandRow: { alignItems: 'center', marginBottom: 24 },
  salonCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 32 },
  vehicleRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    marginBottom: 14,
  },
  vehicleThumb: { width: 96, height: 76, borderRadius: 8, backgroundColor: alphaone.cardAlt },
  vehicleThumbEmpty: { borderWidth: 1, borderColor: alphaone.line },
  vinText: { letterSpacing: 1.5 },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  crashText: { color: alphaone.ink, fontSize: 11, fontFamily: 'monospace', marginVertical: 8 },
});
