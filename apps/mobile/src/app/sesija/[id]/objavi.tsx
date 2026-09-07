import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { alphaone, decodeVinLocally, formatPrice, generateListingTitle } from '@wagen/domain';
import { Card, Cta, IconCircle, T, ToggleRow, Wordmark } from '@/ui/kit';
import { getSession, type LocalSession } from '@/lib/sessions';
import {
  confirmPhoneVerification,
  crosspostSession,
  isPhoneVerified,
  startPhoneVerification,
  type PhoneOtpChannel,
} from '@/lib/crosspost';
import { getSupabase } from '@/lib/supabase';
import { logEvent } from '@/lib/events';

type Step = 'form' | 'pregled' | 'phone' | 'code' | 'done';

const SERVICE_OPTIONS = [
  { value: 'da', label: 'Da' },
  { value: 'ne', label: 'Ne' },
  { value: 'djelomicno', label: 'Djelomično' },
] as const;

const CONDITION_OPTIONS = [
  { value: 'bez-stete', label: 'Bez štete' },
  { value: 'popravljena-steta', label: 'Popravljena šteta' },
  { value: 'osteceno', label: 'Oštećeno' },
] as const;

/**
 * Objava v2 (dizajn vlasnika 2026-09-07, Dodatno 2): trgovci i privatni
 * objavljuju IZRAVNO iz aplikacije - rucni unos, strukturirani PREGLED,
 * opis (slobodan ili AI), pa objava (OTP po potrebi). Naknadno ugradjena
 * oprema iz sesije ide u attributes.retrofit_equipment (Dodatno 4).
 */
export default function PublishScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<LocalSession | null>(null);
  const [step, setStep] = useState<Step>('form');
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const [price, setPrice] = useState('');
  const [mileage, setMileage] = useState('');
  const [year, setYear] = useState('');
  const [model, setModel] = useState('');
  const [owners, setOwners] = useState('');
  const [serviceBook, setServiceBook] = useState<'da' | 'ne' | 'djelomicno' | null>(null);
  const [condition, setCondition] = useState<'bez-stete' | 'popravljena-steta' | 'osteceno' | null>(
    null,
  );
  const [isNew, setIsNew] = useState(false);
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('385');
  const [code, setCode] = useState('');
  const [otpChannel, setOtpChannel] = useState<PhoneOtpChannel>('phone_change');
  const [listingId, setListingId] = useState<string | null>(null);

  useEffect(() => {
    if (id) void getSession(id).then(setSession);
  }, [id]);

  const decoded = session?.vin ? decodeVinLocally(session.vin) : null;
  const knownModel = session?.vehicleInfo?.model ?? null;

  const title = generateListingTitle({
    firstRegistrationYear: year ? Number(year) : (session?.vehicleInfo?.modelYear ?? null),
    make: session?.vehicleInfo?.make ?? decoded?.manufacturer ?? '',
    model: knownModel ?? model,
    engineLabel: session?.vehicleInfo?.engineLabel ?? null,
  });

  const suggestDescription = async () => {
    if (aiBusy || !session) return;
    setAiBusy(true);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Nema veze');
      const { data, error } = await supabase.functions.invoke('generate-description', {
        body: {
          make: session.vehicleInfo?.make ?? decoded?.manufacturer ?? null,
          model: knownModel ?? (model || null),
          engineLabel: session.vehicleInfo?.engineLabel ?? null,
          firstRegistrationYear: year ? Number(year) : null,
          mileageKm: mileage ? Number(mileage) : null,
          ownersCount: owners ? Number(owners) : null,
          serviceBook,
          condition,
          isNew,
          vehicleId: session.vehicleId ?? null,
        },
      });
      if (error) throw new Error(error.message);
      const text = (data as { description?: string } | null)?.description;
      if (text) setDescription(text);
      logEvent('ai_description_used');
    } catch (e) {
      Alert.alert('Prijedlog nije uspio', e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  };

  const publish = async () => {
    if (!session) return;
    try {
      const { listingId: newId } = await crosspostSession(session, {
        priceEur: price ? Math.round(Number(price)) : null,
        mileageKm: mileage ? Math.round(Number(mileage)) : null,
        firstRegistrationYear: year ? Number(year) : null,
        ownersCount: owners ? Number(owners) : null,
        serviceBook,
        condition,
        isNew,
        description: description.trim() || null,
        retrofitEquipment: session.retrofitEquipment,
        model: knownModel ?? (model || undefined),
        make: session.vehicleInfo?.make,
      });
      setListingId(newId);
      setStep('done');
      logEvent('listing_published');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message === 'MAKE_MODEL_REQUIRED') {
        Alert.alert('Nedostaje model', 'Upiši model vozila (npr. X3).');
        setStep('form');
      } else {
        Alert.alert('Objava nije uspjela', message);
      }
    }
  };

  const continueFromPreview = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (await isPhoneVerified()) await publish();
      else setStep('phone');
    } finally {
      setBusy(false);
    }
  };

  if (!session) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <T color={alphaone.muted}>Učitavanje…</T>
      </View>
    );
  }

  const chip = (selected: boolean, label: string, onPress: () => void, key: string) => (
    <Pressable key={key} style={[styles.chip, selected && styles.chipActive]} onPress={onPress}>
      <T w="semibold" size={14} color={selected ? alphaone.green : alphaone.ink}>
        {label}
        {selected ? ' ✓' : ''}
      </T>
    </Pressable>
  );

  const label = (text: string) => (
    <T w="semibold" size={13} color={alphaone.muted} style={styles.label}>
      {text}
    </T>
  );

  const retrofitCount = session.retrofitEquipment?.length ?? 0;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Wordmark small />
          <IconCircle glyph="⌂" onPress={() => router.dismissTo('/')} />
        </View>

        {step === 'form' && (
          <>
            <T w="extrabold" size={24}>
              Objavi na wagen.hr
            </T>
            <T size={14} color={alphaone.muted} style={{ marginBottom: 12 }}>
              {session.photos.length} fotografija spremno. Još par podataka:
            </T>

            <Card>
              {!knownModel && (
                <>
                  {label('Model (npr. X3)')}
                  <TextInput
                    style={styles.input}
                    value={model}
                    onChangeText={setModel}
                    placeholder="X3"
                    placeholderTextColor={alphaone.muted}
                  />
                </>
              )}

              {label('Cijena u EUR (prazno = "Na upit")')}
              <TextInput
                style={styles.input}
                value={price}
                onChangeText={(t) => setPrice(t.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                placeholder="21500"
                placeholderTextColor={alphaone.muted}
              />
              {price !== '' && (
                <T w="bold" size={15} style={{ marginTop: 4 }}>
                  {formatPrice(Number(price))}
                </T>
              )}

              {label('Kilometraža')}
              <TextInput
                style={styles.input}
                value={mileage}
                onChangeText={(t) => setMileage(t.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                placeholder="95000"
                placeholderTextColor={alphaone.muted}
              />

              {label('Godina prve registracije')}
              <TextInput
                style={styles.input}
                value={year}
                onChangeText={(t) => setYear(t.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={4}
                placeholder={session.vehicleInfo?.modelYear?.toString() ?? '2018'}
                placeholderTextColor={alphaone.muted}
              />

              {label('Broj vlasnika')}
              <TextInput
                style={styles.input}
                value={owners}
                onChangeText={(t) => setOwners(t.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="1"
                placeholderTextColor={alphaone.muted}
              />

              {label('Servisna povijest')}
              <View style={styles.chipRow}>
                {SERVICE_OPTIONS.map((o) =>
                  chip(serviceBook === o.value, o.label, () => setServiceBook(o.value), o.value),
                )}
              </View>

              {label('Stanje vozila')}
              <View style={styles.chipRow}>
                {CONDITION_OPTIONS.map((o) =>
                  chip(condition === o.value, o.label, () => setCondition(o.value), o.value),
                )}
              </View>

              <ToggleRow
                title="Novo vozilo"
                subtitle="Vozilo bez prve registracije"
                value={isNew}
                onChange={setIsNew}
              />
            </Card>

            <Cta label="Pregled oglasa" onPress={() => setStep('pregled')} />
          </>
        )}

        {step === 'pregled' && (
          <>
            <T w="extrabold" size={24} style={{ marginBottom: 12 }}>
              Pregled oglasa
            </T>

            <Card>
              <T w="bold" size={19}>
                {title.line1 || '—'}
              </T>
              {!!title.line2 && (
                <T size={15} color={alphaone.muted}>
                  {title.line2}
                </T>
              )}
              <View style={styles.priceBar}>
                <T w="bold" size={17} style={{ fontStyle: 'italic' }}>
                  {price ? formatPrice(Number(price)) : 'Na upit'}
                </T>
              </View>
              <T size={13} style={{ marginTop: 10 }}>
                {[
                  mileage ? `${Number(mileage).toLocaleString('hr-HR')} km` : null,
                  owners ? `${owners}. vlasnik` : null,
                  serviceBook ? `servisna: ${serviceBook}` : null,
                  condition ? CONDITION_OPTIONS.find((c) => c.value === condition)?.label : null,
                  isNew ? 'NOVO' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </T>
              <T size={12} color={alphaone.muted} style={{ marginTop: 4 }}>
                {session.photos.length} fotografija
                {retrofitCount > 0
                  ? ` · naknadno ugrađena oprema: ${retrofitCount} ${retrofitCount === 1 ? 'stavka' : 'stavke'}`
                  : ''}
              </T>
            </Card>

            <Card>
              {label('Opis oglasa')}
              <TextInput
                style={[styles.input, styles.textarea]}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={6}
                placeholder="Napiši opis sam, ili dodirni 'Predloži mi'…"
                placeholderTextColor={alphaone.muted}
              />
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => void suggestDescription()}
                disabled={aiBusy}
              >
                <T w="bold" size={14}>
                  {aiBusy ? 'Pišem…' : '✨ Predloži mi opis'}
                </T>
              </Pressable>
            </Card>

            <Cta
              label={busy ? 'Trenutak…' : 'Objavi potpuno besplatno'}
              onPress={() => void continueFromPreview()}
              disabled={busy}
            />
            <Pressable style={styles.linkRow} onPress={() => setStep('form')}>
              <T w="semibold" size={14} color={alphaone.muted}>
                Natrag na podatke
              </T>
            </Pressable>
          </>
        )}

        {step === 'phone' && (
          <>
            <T w="extrabold" size={24}>
              Još samo broj mobitela
            </T>
            <T size={14} color={alphaone.muted} style={{ marginBottom: 12 }}>
              Poslat ćemo ti SMS kod za potvrdu — to je sve što treba za objavu. Bez lozinki, bez
              registracije.
            </T>
            <Card>
              {label('Broj (385...)')}
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, ''))}
                keyboardType="phone-pad"
                placeholder="385911234567"
                placeholderTextColor={alphaone.muted}
              />
            </Card>
            <Cta
              label={busy ? 'Šaljem…' : 'Pošalji kod'}
              onPress={() => {
                setBusy(true);
                startPhoneVerification(phone.replace(/\s/g, ''))
                  .then((ch) => {
                    setOtpChannel(ch);
                    setStep('code');
                  })
                  .catch((e: unknown) =>
                    Alert.alert('SMS nije poslan', e instanceof Error ? e.message : String(e)),
                  )
                  .finally(() => setBusy(false));
              }}
              disabled={busy || phone.length < 11}
              style={busy || phone.length < 11 ? { opacity: 0.4 } : undefined}
            />
          </>
        )}

        {step === 'code' && (
          <>
            <T w="extrabold" size={24}>
              Upiši kod iz SMS-a
            </T>
            <T size={14} color={alphaone.muted} style={{ marginBottom: 12 }}>
              Poslan na {phone}
            </T>
            <Card>
              <TextInput
                style={[styles.input, styles.codeInput]}
                value={code}
                onChangeText={(t) => setCode(t.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                placeholder="123456"
                placeholderTextColor={alphaone.muted}
              />
            </Card>
            <Cta
              label={busy ? 'Objavljujem…' : 'Potvrdi i objavi'}
              onPress={() => {
                setBusy(true);
                confirmPhoneVerification(phone.replace(/\s/g, ''), code.trim(), otpChannel)
                  .then(() => publish())
                  .catch((e: unknown) =>
                    Alert.alert('Kod nije prihvaćen', e instanceof Error ? e.message : String(e)),
                  )
                  .finally(() => setBusy(false));
              }}
              disabled={busy || code.length !== 6}
              style={busy || code.length !== 6 ? { opacity: 0.4 } : undefined}
            />
          </>
        )}

        {step === 'done' && (
          <>
            <T w="extrabold" size={24}>
              Oglas je predan 🎉
            </T>
            <T size={14} color={alphaone.muted} style={{ marginBottom: 12 }}>
              Tvoj oglas čeka aktivaciju i bit će među prvima kad wagen.hr krene. Fotografije i
              podaci su sigurno spremljeni.
            </T>
            {listingId && (
              <T size={13} color={alphaone.muted} style={{ marginBottom: 12 }}>
                Broj oglasa: {listingId.slice(0, 8)}
              </T>
            )}

            <Pressable
              style={styles.secondaryBtn}
              onPress={() =>
                id && router.replace({ pathname: '/sesija/[id]/fotografije', params: { id } })
              }
            >
              <T w="bold" size={14}>
                📄 Preuzmi Dossier (PDF)
              </T>
            </Pressable>

            <Cta label="Gotovo" onPress={() => router.dismissAll()} style={{ marginTop: 14 }} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: alphaone.bg },
  scroll: { padding: 18, paddingTop: 40, paddingBottom: 48 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  label: { marginTop: 12, marginBottom: 6 },
  input: {
    fontFamily: 'Exo2-Medium',
    fontSize: 17,
    color: alphaone.ink,
    backgroundColor: alphaone.cardAlt,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  textarea: { minHeight: 120, textAlignVertical: 'top' },
  codeInput: { letterSpacing: 8, fontSize: 24, textAlign: 'center' },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    borderWidth: 2,
    borderColor: alphaone.line,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: alphaone.card,
  },
  chipActive: { borderColor: alphaone.green },
  // Cijena: UVIJEK crna bold italic na cyan #1EDCE8 (13.1) - i u AlphaOne
  priceBar: {
    backgroundColor: '#1EDCE8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginTop: 10,
  },
  secondaryBtn: {
    backgroundColor: alphaone.card,
    borderWidth: 2,
    borderColor: alphaone.amber,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  linkRow: { alignItems: 'center', paddingVertical: 14 },
});
