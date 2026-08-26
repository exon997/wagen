import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { colors, decodeVinLocally, formatPrice, generateListingTitle } from '@wagen/domain';
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
  { value: 'djelomicno', label: 'Djelomicno' },
] as const;

const CONDITION_OPTIONS = [
  { value: 'bez-stete', label: 'Bez stete' },
  { value: 'popravljena-steta', label: 'Popravljena steta' },
  { value: 'osteceno', label: 'Osteceno' },
] as const;

/**
 * Korak 4 flowa (spec 2026-08-25): Oglas - rucni unos, strukturirani
 * PREGLED oglasa, opis (slobodan ili AI), pa objava (OTP po potrebi).
 * Copy je v1 prijedlog (TBD sekcija 20).
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
        model: knownModel ?? (model || undefined),
        make: session.vehicleInfo?.make,
      });
      setListingId(newId);
      setStep('done');
      logEvent('listing_published');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message === 'MAKE_MODEL_REQUIRED') {
        Alert.alert('Nedostaje model', 'Upisi model vozila (npr. X3).');
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
      <View style={styles.container}>
        <Text style={styles.muted}>Ucitavanje…</Text>
      </View>
    );
  }

  const chip = (selected: boolean, label: string, onPress: () => void, key: string) => (
    <Pressable key={key} style={[styles.chip, selected && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, selected && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Oglas' }} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {step === 'form' && (
          <>
            <Text style={styles.headline}>Zavrsi oglas</Text>
            <Text style={styles.sub}>
              {session.photos.length} fotografija spremno. Jos par podataka:
            </Text>

            {!knownModel && (
              <>
                <Text style={styles.label}>Model (npr. X3)</Text>
                <TextInput
                  style={styles.input}
                  value={model}
                  onChangeText={setModel}
                  placeholder="X3"
                  placeholderTextColor={colors.gray}
                />
              </>
            )}

            <Text style={styles.label}>Cijena u EUR (prazno = "Na upit")</Text>
            <TextInput
              style={styles.input}
              value={price}
              onChangeText={(t) => setPrice(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="21500"
              placeholderTextColor={colors.gray}
            />
            {price !== '' && <Text style={styles.pricePreview}>{formatPrice(Number(price))}</Text>}

            <Text style={styles.label}>Kilometraza</Text>
            <TextInput
              style={styles.input}
              value={mileage}
              onChangeText={(t) => setMileage(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="95000"
              placeholderTextColor={colors.gray}
            />

            <Text style={styles.label}>Godina prve registracije</Text>
            <TextInput
              style={styles.input}
              value={year}
              onChangeText={(t) => setYear(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              maxLength={4}
              placeholder={session.vehicleInfo?.modelYear?.toString() ?? '2018'}
              placeholderTextColor={colors.gray}
            />

            <Text style={styles.label}>Broj vlasnika</Text>
            <TextInput
              style={styles.input}
              value={owners}
              onChangeText={(t) => setOwners(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              maxLength={2}
              placeholder="1"
              placeholderTextColor={colors.gray}
            />

            <Text style={styles.label}>Servisna povijest</Text>
            <View style={styles.chipRow}>
              {SERVICE_OPTIONS.map((o) =>
                chip(serviceBook === o.value, o.label, () => setServiceBook(o.value), o.value),
              )}
            </View>

            <Text style={styles.label}>Stanje vozila</Text>
            <View style={styles.chipRow}>
              {CONDITION_OPTIONS.map((o) =>
                chip(condition === o.value, o.label, () => setCondition(o.value), o.value),
              )}
            </View>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Novo vozilo</Text>
              <Switch
                value={isNew}
                onValueChange={setIsNew}
                trackColor={{ true: colors.cyan, false: colors.gray }}
              />
            </View>

            <Pressable style={styles.primary} onPress={() => setStep('pregled')}>
              <Text style={styles.primaryText}>Pregled oglasa</Text>
            </Pressable>
          </>
        )}

        {step === 'pregled' && (
          <>
            <Text style={styles.headline}>Pregled oglasa</Text>

            <View style={styles.previewCard}>
              <Text style={styles.previewTitle1}>{title.line1 || '—'}</Text>
              {!!title.line2 && <Text style={styles.previewTitle2}>{title.line2}</Text>}
              <View style={styles.priceBar}>
                <Text style={styles.priceText}>
                  {price ? formatPrice(Number(price)) : 'Na upit'}
                </Text>
              </View>
              <Text style={styles.previewSpec}>
                {[
                  mileage ? `${Number(mileage).toLocaleString('hr-HR')} km` : null,
                  owners ? `${owners}. vlasnik` : null,
                  serviceBook ? `servisna: ${serviceBook}` : null,
                  condition ? CONDITION_OPTIONS.find((c) => c.value === condition)?.label : null,
                  isNew ? 'NOVO' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              <Text style={styles.previewPhotos}>{session.photos.length} fotografija</Text>
            </View>

            <Text style={styles.label}>Opis oglasa</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={6}
              placeholder="Napisi opis sam, ili dodirni 'Predlozi mi'…"
              placeholderTextColor={colors.gray}
            />
            <Pressable
              style={styles.secondaryButton}
              onPress={() => void suggestDescription()}
              disabled={aiBusy}
            >
              <Text style={styles.secondaryButtonText}>
                {aiBusy ? 'Pisem…' : '✨ Predlozi mi opis'}
              </Text>
            </Pressable>

            <Pressable
              style={styles.primary}
              onPress={() => void continueFromPreview()}
              disabled={busy}
            >
              <Text style={styles.primaryText}>
                {busy ? 'Trenutak…' : 'Objavi potpuno besplatno'}
              </Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={() => setStep('form')}>
              <Text style={styles.secondaryText}>Natrag na podatke</Text>
            </Pressable>
          </>
        )}

        {step === 'phone' && (
          <>
            <Text style={styles.headline}>Jos samo broj mobitela</Text>
            <Text style={styles.sub}>
              Poslat cemo ti SMS kod za potvrdu - to je sve sto treba za objavu. Bez lozinki, bez
              registracije.
            </Text>
            <Text style={styles.label}>Broj (385...)</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, ''))}
              keyboardType="phone-pad"
              placeholder="385911234567"
              placeholderTextColor={colors.gray}
            />
            <Pressable
              style={styles.primary}
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
            >
              <Text style={styles.primaryText}>{busy ? 'Saljem…' : 'Posalji kod'}</Text>
            </Pressable>
          </>
        )}

        {step === 'code' && (
          <>
            <Text style={styles.headline}>Upisi kod iz SMS-a</Text>
            <Text style={styles.sub}>Poslan na {phone}</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              value={code}
              onChangeText={(t) => setCode(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              placeholder="123456"
              placeholderTextColor={colors.gray}
            />
            <Pressable
              style={styles.primary}
              onPress={() => {
                setBusy(true);
                confirmPhoneVerification(phone.replace(/\s/g, ''), code.trim(), otpChannel)
                  .then(() => publish())
                  .catch((e: unknown) =>
                    Alert.alert('Kod nije prihvacen', e instanceof Error ? e.message : String(e)),
                  )
                  .finally(() => setBusy(false));
              }}
              disabled={busy || code.length !== 6}
            >
              <Text style={styles.primaryText}>{busy ? 'Objavljujem…' : 'Potvrdi i objavi'}</Text>
            </Pressable>
          </>
        )}

        {step === 'done' && (
          <>
            <Text style={styles.headline}>Oglas je predan 🎉</Text>
            <Text style={styles.sub}>
              Tvoj oglas ceka aktivaciju i bit ce medju prvima kad wagen.hr krene. Fotografije i
              podaci su sigurno spremljeni.
            </Text>
            {listingId && <Text style={styles.muted}>Broj oglasa: {listingId.slice(0, 8)}</Text>}

            <Pressable
              style={styles.secondaryButton}
              onPress={() => {
                logEvent('pdf_profile_interest');
                Alert.alert('Uskoro', 'PDF profil vozila stize uskoro - zabiljezili smo interes!');
              }}
            >
              <Text style={styles.secondaryButtonText}>📄 PDF profil vozila (uskoro)</Text>
            </Pressable>

            <Pressable style={styles.primary} onPress={() => router.dismissAll()}>
              <Text style={styles.primaryText}>Gotovo</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  scroll: { padding: 24, paddingBottom: 48 },
  headline: { color: colors.white, fontSize: 24, fontWeight: '700', marginBottom: 8 },
  sub: { color: colors.gray, fontSize: 15, marginBottom: 16, lineHeight: 21 },
  label: { color: colors.gray, marginTop: 12, marginBottom: 6, fontSize: 13 },
  input: {
    borderColor: colors.gray,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.white,
    fontSize: 17,
    padding: 12,
  },
  textarea: { minHeight: 120, textAlignVertical: 'top' },
  codeInput: { letterSpacing: 8, fontSize: 24, textAlign: 'center' },
  pricePreview: { color: colors.cyan, fontSize: 15, fontWeight: '700', marginTop: 6 },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    borderColor: colors.gray,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chipActive: { borderColor: colors.cyan, backgroundColor: '#0a1a1c' },
  chipText: { color: colors.gray, fontSize: 14 },
  chipTextActive: { color: colors.cyan, fontWeight: '600' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  toggleLabel: { color: colors.white, fontSize: 15 },
  previewCard: {
    borderColor: colors.gray,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  previewTitle1: { color: colors.white, fontSize: 19, fontWeight: '500' },
  previewTitle2: { color: colors.gray, fontSize: 15, marginTop: 2 },
  priceBar: {
    backgroundColor: colors.cyan,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginTop: 10,
  },
  priceText: { color: colors.black, fontWeight: '700', fontStyle: 'italic', fontSize: 17 },
  previewSpec: { color: colors.white, fontSize: 13, marginTop: 10 },
  previewPhotos: { color: colors.gray, fontSize: 12, marginTop: 4 },
  primary: {
    backgroundColor: colors.cyan,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  primaryText: { color: colors.black, fontWeight: '700', fontSize: 16 },
  secondary: { padding: 14, alignItems: 'center' },
  secondaryText: { color: colors.gray, fontSize: 14 },
  secondaryButton: {
    borderColor: colors.cyan,
    borderWidth: 1,
    borderRadius: 8,
    padding: 13,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryButtonText: { color: colors.cyan, fontSize: 15, fontWeight: '600' },
  muted: { color: colors.gray, fontSize: 14, marginBottom: 12 },
});
