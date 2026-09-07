import { useEffect, useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { alphaone } from '@wagen/domain';
import { Card, Cta, IconCircle, T, Wordmark } from '@/ui/kit';
import {
  confirmPhoneVerification,
  startPhoneVerification,
  type PhoneOtpChannel,
} from '@/lib/crosspost';
import { getCachedDealerContext, refreshDealerContext, type DealerContext } from '@/lib/dealer';
import { logEvent } from '@/lib/events';

/**
 * Faza A (9): prijava salona, AlphaOne izgled (2026-09-07). Vlasnik/clan
 * upise telefon s pozivnice, potvrdi SMS kodom, claim_dealer_invites()
 * preuzme clanstvo i aplikacija postaje brandirana za taj salon.
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
        Alert.alert('Dobrodošli', `Aplikacija je sada brandirana za: ${ctx.displayName}`);
        router.back();
      } else {
        Alert.alert(
          'Broj nije povezan sa salonom',
          'Telefon je potvrđen, ali za njega ne postoji pozivnica salona. Javite se wagenu.',
        );
      }
    } catch (e) {
      Alert.alert('Kod nije prihvaćen', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const statusRow = (label: string, ok: boolean, okText: string, noText: string) => (
    <View style={styles.statusRow}>
      <T size={15} style={{ flex: 1 }}>
        {label}
      </T>
      <T w="semibold" size={14} color={ok ? alphaone.green : alphaone.muted}>
        {ok ? `${okText} ✓` : noText}
      </T>
    </View>
  );

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Wordmark small />
        <IconCircle glyph="⌂" onPress={() => router.dismissTo('/')} />
      </View>

      {dealer ? (
        <>
          <T w="extrabold" size={24} style={{ marginBottom: 12 }}>
            {dealer.displayName}
          </T>
          <Card>
            {statusRow(
              'AI studio ovaj mjesec',
              true,
              `${dealer.studioUsedThisMonth} / ${dealer.studioMonthlyLimit}`,
              '',
            )}
            {statusRow(
              'Brandirana pozadina',
              dealer.hasBrandedBackground,
              'aktivna',
              'još nije postavljena',
            )}
            {statusRow(
              'Reklamne tablice',
              !!dealer.plateOverlayUri,
              'aktivne',
              'još nisu postavljene',
            )}
          </Card>
          <T size={13} color={alphaone.muted}>
            Nova fotografiranja s početnog ekrana automatski nose branding salona.
          </T>
        </>
      ) : step === 'idle' ? (
        <>
          <T w="extrabold" size={24} style={{ marginBottom: 12 }}>
            Prijava salona
          </T>
          <Card>
            <T size={14} color={alphaone.muted} style={{ lineHeight: 20 }}>
              Za salone s wagen foto pretplatom. Prijavi se brojem telefona koji je prijavljen za
              salon — aplikacija postaje brandirana: tvoja pozadina studija i tvoje reklamne tablice
              na svakoj fotografiji.
            </T>
          </Card>
          <Cta label="Prijavi se telefonom" onPress={() => setStep('phone')} />
        </>
      ) : step === 'phone' ? (
        <>
          <T w="extrabold" size={24} style={{ marginBottom: 12 }}>
            Broj telefona
          </T>
          <Card>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoFocus
            />
          </Card>
          <Cta
            label={busy ? 'Šaljem…' : 'Pošalji SMS kod'}
            disabled={busy || phone.length < 11}
            onPress={() => void sendCode()}
            style={busy || phone.length < 11 ? { opacity: 0.4 } : undefined}
          />
        </>
      ) : (
        <>
          <T w="extrabold" size={24}>
            SMS kod
          </T>
          <T size={14} color={alphaone.muted} style={{ marginBottom: 12 }}>
            Poslan na {phone}
          </T>
          <Card>
            <TextInput
              style={[styles.input, styles.codeInput]}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
          </Card>
          <Cta
            label={busy ? 'Provjeravam…' : 'Potvrdi'}
            disabled={busy || code.trim().length < 6}
            onPress={() => void confirm()}
            style={busy || code.trim().length < 6 ? { opacity: 0.4 } : undefined}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: alphaone.bg, padding: 18, paddingTop: 40 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  input: {
    fontFamily: 'Exo2-SemiBold',
    fontSize: 18,
    letterSpacing: 2,
    color: alphaone.ink,
    backgroundColor: alphaone.cardAlt,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontVariant: ['tabular-nums'],
  },
  codeInput: { letterSpacing: 8, fontSize: 24, textAlign: 'center' },
});
