import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { alphaone } from '@wagen/domain';
import { Card, Cta, IconCircle, T, ToggleRow, Wordmark } from '@/ui/kit';
import { getCachedDealerContext, type DealerContext } from '@/lib/dealer';
import { DEFAULT_LOOK, getSession, updateSession, type LookSettings } from '@/lib/sessions';

/**
 * Priprema v2 (dizajn vlasnika 2026-09-07): opcije pozadine kao kartice
 * (zeleni obrub + kvacica = odabrano), pozadine salona kao THUMBNAILI,
 * tri prekidaca (Sakrij/Zamijeni tablice, Dorada) s tekstualnim stanjem,
 * CTA vodi ravno na fotografiranje.
 */
export default function PrepScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [look, setLook] = useState<LookSettings>(DEFAULT_LOOK);
  const [dealer, setDealer] = useState<DealerContext | null>(null);

  useEffect(() => {
    if (id) {
      void getSession(id).then((s) => {
        if (s?.look) setLook({ ...DEFAULT_LOOK, ...s.look });
        if (s?.dealerId) void getCachedDealerContext().then(setDealer);
      });
    }
  }, [id]);

  const save = async (next: LookSettings) => {
    setLook(next);
    if (id) await updateSession(id, { look: next });
  };

  const backgrounds: { key: LookSettings['background']; title: string; desc: string }[] = [
    { key: 'original', title: 'Original', desc: 'Fotografije bez promjene pozadine' },
    { key: 'blur', title: 'Diskretna', desc: 'Pozadina se zamuti, auto ostaje oštar' },
    {
      key: 'studio',
      title: 'Studio',
      desc: 'AI studio obrada — potreban internet, ~15 s po fotografiji',
    },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Wordmark small />
        <IconCircle glyph="⌂" onPress={() => router.dismissTo('/')} />
      </View>

      <Card>
        <T w="extrabold" size={24} style={{ marginBottom: 14 }}>
          Pozadina fotografija
        </T>
        {backgrounds.map((b) => {
          const active = look.background === b.key;
          return (
            <Pressable
              key={b.key}
              style={[styles.option, active && styles.optionActive]}
              onPress={() => void save({ ...look, background: b.key })}
            >
              <View style={{ flex: 1 }}>
                <T w="bold" size={18}>
                  {b.title}
                  {active ? '  ✓' : ''}
                </T>
                <T size={13} color={alphaone.muted}>
                  {b.desc}
                </T>
              </View>
            </Pressable>
          );
        })}

        {look.background === 'studio' && dealer && dealer.backgrounds.length > 0 && (
          <>
            <T w="semibold" size={15} color={alphaone.muted} style={{ marginTop: 8, marginBottom: 8, fontStyle: 'italic' }}>
              Odaberi pozadinu
            </T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {dealer.backgrounds.map((bg, i) => {
                const active = look.backgroundId ? look.backgroundId === bg.id : i === 0;
                return (
                  <Pressable
                    key={bg.id}
                    style={[styles.bgThumbWrap, active && styles.bgThumbActive]}
                    onPress={() => void save({ ...look, backgroundId: bg.id })}
                  >
                    {bg.localUri ? (
                      <Image source={{ uri: bg.localUri }} style={styles.bgThumb} />
                    ) : (
                      <View style={[styles.bgThumb, { backgroundColor: alphaone.cardAlt }]} />
                    )}
                    <T w="semibold" size={12} color={active ? alphaone.green : alphaone.muted}>
                      {bg.name}
                      {active ? ' ✓' : ''}
                    </T>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        )}
      </Card>

      <Card>
        <ToggleRow
          title="Sakrij registarske oznake"
          subtitle="Tablice se automatski zamute"
          value={look.hidePlates}
          onChange={(v) => void save({ ...look, hidePlates: v })}
        />
        {dealer && (
          <ToggleRow
            title="Zamijeni registarske tablice"
            subtitle="Zamjena brendiranim tablicama salona"
            value={look.replacePlates !== false}
            onChange={(v) => void save({ ...look, replacePlates: v })}
          />
        )}
        <ToggleRow
          title="Automatska dorada"
          subtitle="Prilagođavanje kontrasta i boje"
          value={look.enhance}
          onChange={(v) => void save({ ...look, enhance: v })}
        />
      </Card>

      <Cta
        label="Nastavi na fotografiranje"
        onPress={() => router.replace({ pathname: '/sesija/[id]/kamera', params: { id: id! } })}
      />
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
    marginBottom: 16,
  },
  option: {
    borderWidth: 3,
    borderColor: alphaone.line,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
  },
  optionActive: { borderColor: alphaone.green },
  bgThumbWrap: {
    marginRight: 12,
    borderWidth: 3,
    borderColor: 'transparent',
    borderRadius: 12,
    padding: 3,
    alignItems: 'center',
  },
  bgThumbActive: { borderColor: alphaone.green },
  bgThumb: { width: 132, height: 96, borderRadius: 8 },
});
