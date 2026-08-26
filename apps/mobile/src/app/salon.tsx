import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { colors } from '@wagen/domain';
import {
  confirmPhoneVerification,
  startPhoneVerification,
  type PhoneOtpChannel,
} from '@/lib/crosspost';
import { getCachedDealerContext, refreshDealerContext, type DealerContext } from '@/lib/dealer';
import { logEvent } from '@/lib/events';

/**
 * Faza A (9): prijava salona. Vlasnik/clan upise telefon s pozivnice,
 * potvrdi SMS kodom, claim_dealer_invites() preuzme clanstvo i aplikacija
 * postaje brandirana za taj salon. Ista OTP mehanika kao objava (5.2).
 */
export default function SalonScreen() {
  const router = useRouter();
  const [dealer, setDealer] = useState<DealerContext | null>(null);
  const [step, setStep] = useState<'idle' | 'phone' | 'code'>('idle');
  const [phone, setPhone] = useState('385');
  const [code, setCode] = useState('');
  const [channel, setChannel] = useState<PhoneOtpChannel>('phone_change');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getCachedDealerContext().then(setDealer);
    void refreshDealerContext().then((ctx) => ctx && setDealer(ctx));
  }, []);

  const sendCode = async () => {
    setBusy(true);
    try {
      setChannel(await startPhoneVerification(phone.replace(/\s/g, '')));
      setStep('code');
    } catch (e) {
      Alert.alert('SMS nije poslan', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      await confirmPhoneVerification(phone.replace(/\s/g, ''), code.trim(), channel);
      const ctx = await refreshDealerContext();
      setDealer(ctx);
      setStep('idle');
      if (ctx) {
        logEvent('dealer_login', { dealer: ctx.dealerId });
        Alert.alert('Dobrodosli', `Aplikacija je sada brandirana za: ${ctx.displayName}`);
        router.back();
      } else {
        Alert.alert(
          'Broj nije povezan sa salonom',
          'Telefon je potvrdjen, ali za njega ne postoji pozivnica salona. Javite se wagenu.',
        );
      }
    } catch (e) {
      Alert.alert('Kod nije prihvacen', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Salon' }} />

      {dealer ? (
        <>
          <Text style={styles.title}>{dealer.displayName}</Text>
          <Text style={styles.row}>
            AI studio ovaj mjesec: {dealer.studioUsedThisMonth} / {dealer.studioMonthlyLimit}{' '}
            vozila
          </Text>
          <Text style={styles.row}>
            Brandirana pozadina: {dealer.hasBrandedBackground ? 'aktivna ✓' : 'jos nije postavljena'}
          </Text>
          <Text style={styles.row}>
            Reklamne tablice: {dealer.plateOverlayUri ? 'aktivne ✓' : 'jos nisu postavljene'}
          </Text>
          <Text style={styles.hint}>
            Nova fotografiranja s pocetnog ekrana automatski nose branding salona.
          </Text>
        </>
      ) : step === 'idle' ? (
        <>
          <Text style={styles.title}>Prijava salona</Text>
          <Text style={styles.hint}>
            Za salone s wagen foto pretplatom. Prijavi se brojem telefona koji je prijavljen za
            salon - aplikacija postaje brandirana: tvoja pozadina studija i tvoje reklamne
            tablice na svakoj fotografiji.
          </Text>
          <Pressable style={styles.primary} onPress={() => setStep('phone')}>
            <Text style={styles.primaryText}>Prijavi se telefonom</Text>
          </Pressable>
        </>
      ) : step === 'phone' ? (
        <>
          <Text style={styles.title}>Broj telefona</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoFocus
          />
          <Pressable
            style={[styles.primary, (busy || phone.length < 11) && styles.disabled]}
            disabled={busy || phone.length < 11}
            onPress={() => void sendCode()}
          >
            <Text style={styles.primaryText}>{busy ? 'Saljem…' : 'Posalji SMS kod'}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.title}>SMS kod</Text>
          <Text style={styles.hint}>Poslan na {phone}</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
          />
          <Pressable
            style={[styles.primary, (busy || code.trim().length < 6) && styles.disabled]}
            disabled={busy || code.trim().length < 6}
            onPress={() => void confirm()}
          >
            <Text style={styles.primaryText}>{busy ? 'Provjeravam…' : 'Potvrdi'}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black, padding: 24 },
  title: { color: colors.white, fontSize: 22, fontWeight: '700', marginBottom: 12 },
  row: { color: colors.white, fontSize: 15, marginBottom: 8 },
  hint: { color: colors.gray, fontSize: 14, marginBottom: 20, lineHeight: 20 },
  input: {
    borderColor: colors.gray,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.white,
    fontSize: 18,
    letterSpacing: 2,
    padding: 12,
    marginBottom: 16,
    fontVariant: ['tabular-nums'],
  },
  primary: { backgroundColor: colors.cyan, borderRadius: 8, padding: 16, alignItems: 'center' },
  primaryText: { color: colors.black, fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.35 },
});
