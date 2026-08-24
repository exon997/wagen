import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { colors, decodeVinLocally, formatPrice } from '@wagen/domain';
import { getSession, type LocalSession } from '@/lib/sessions';
import {
  confirmPhoneVerification,
  crosspostSession,
  isPhoneVerified,
  startPhoneVerification,
} from '@/lib/crosspost';

type Step = 'form' | 'phone' | 'code' | 'done';

/**
 * J2: Crosspost ekran - "najvazniji ekran u aplikaciji" (sekcija 20).
 * Copy je v1 PRIJEDLOG i ceka odobrenje/A-B u Fazi 0 - oznaceno u TBD.
 *
 * Foto mod: ovo je sekundarni izlaz (4.2) - korisnik je dosao po fotke,
 * oglas mu se NUDI. Oglasni mod: ovo je primarni cilj.
 */
export default function PublishScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<LocalSession | null>(null);
  const [step, setStep] = useState<Step>('form');
  const [busy, setBusy] = useState(false);

  const [price, setPrice] = useState('');
  const [mileage, setMileage] = useState('');
  const [year, setYear] = useState('');
  const [model, setModel] = useState('');
  const [phone, setPhone] = useState('385');
  const [code, setCode] = useState('');
  const [listingId, setListingId] = useState<string | null>(null);

  useEffect(() => {
    if (id) void getSession(id).then(setSession);
  }, [id]);

  const decoded = session?.vin ? decodeVinLocally(session.vin) : null;
  const needsModel = true; // Outvin cache jos ne puni model - E2 ceka kredite

  const submitForm = async () => {
    if (busy || !session) return;
    setBusy(true);
    try {
      if ((await isPhoneVerified()) === true) {
        await publish();
      } else {
        setStep('phone');
      }
    } finally {
      setBusy(false);
    }
  };

  const sendOtp = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await startPhoneVerification(phone.replace(/\s/g, ''));
      setStep('code');
    } catch (e) {
      Alert.alert('SMS nije poslan', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const verifyAndPublish = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await confirmPhoneVerification(phone.replace(/\s/g, ''), code.trim());
      await publish();
    } catch (e) {
      Alert.alert('Kod nije prihvacen', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!session) return;
    try {
      const { listingId: newId } = await crosspostSession(session, {
        priceEur: price ? Math.round(Number(price)) : null,
        mileageKm: mileage ? Math.round(Number(mileage)) : null,
        firstRegistrationYear: year ? Number(year) : null,
        model: model || undefined,
      });
      setListingId(newId);
      setStep('done');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message === 'MAKE_MODEL_REQUIRED') {
        Alert.alert('Nedostaje model', 'Upisi model vozila (npr. X3).');
      } else {
        Alert.alert('Objava nije uspjela', message);
      }
    }
  };

  if (!session) {
    return (
      <View style={styles.container}>
        <Text style={styles.muted}>Ucitavanje…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Objavi na wagen.hr' }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {step === 'form' && (
          <>
            <Text style={styles.headline}>Oglas je vec 90% gotov</Text>
            <Text style={styles.sub}>
              Fotografije i podaci o vozilu su spremni. Dodaj jos par stvari i objavi.
            </Text>

            <Text style={styles.summary}>
              {session.photos.length} fotografija
              {session.vin ? ` · VIN ${session.vin.slice(0, 8)}…` : ''}
              {decoded?.manufacturer ? ` · ${decoded.manufacturer}` : ''}
            </Text>

            {needsModel && (
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
              placeholder={decoded?.year ? String(decoded.year) : '2018'}
              placeholderTextColor={colors.gray}
            />

            <Pressable style={styles.primary} onPress={() => void submitForm()} disabled={busy}>
              <Text style={styles.primaryText}>{busy ? 'Trenutak…' : 'Objavi oglas'}</Text>
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
              onPress={() => void sendOtp()}
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
              placeholder="123456"
              placeholderTextColor={colors.gray}
              autoFocus
            />
            <Pressable
              style={styles.primary}
              onPress={() => void verifyAndPublish()}
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
  scroll: { padding: 24 },
  headline: { color: colors.white, fontSize: 24, fontWeight: '700', marginBottom: 8 },
  sub: { color: colors.gray, fontSize: 15, marginBottom: 20, lineHeight: 21 },
  summary: { color: colors.cyan, fontSize: 14, marginBottom: 16 },
  label: { color: colors.gray, marginTop: 12, marginBottom: 6, fontSize: 13 },
  input: {
    borderColor: colors.gray,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.white,
    fontSize: 17,
    padding: 12,
  },
  codeInput: { letterSpacing: 8, fontSize: 24, textAlign: 'center' },
  pricePreview: { color: colors.cyan, fontSize: 15, fontWeight: '700', marginTop: 6 },
  primary: {
    backgroundColor: colors.cyan,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  primaryText: { color: colors.black, fontWeight: '700', fontSize: 16 },
  muted: { color: colors.gray, fontSize: 14, marginBottom: 16 },
});
