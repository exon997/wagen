'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Faza B: prijava u Kokpit telefonom (isti broj kao u aplikaciji - SMS OTP).
 * Web nema anonimnu sesiju, pa je signInWithOtp izravan i jedini put.
 */
export function KokpitPrijava() {
  const router = useRouter();
  const [phone, setPhone] = useState('385');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase.auth.signInWithOtp({ phone: phone.replace(/\s/g, '') });
    setBusy(false);
    if (e) setError(e.message);
    else setStep('code');
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase.auth.verifyOtp({
      phone: phone.replace(/\s/g, ''),
      token: code.trim(),
      type: 'sms',
    });
    if (e) {
      setBusy(false);
      setError(e.message);
      return;
    }
    await supabase.rpc('claim_dealer_invites');
    router.refresh();
  };

  return (
    <main style={{ maxWidth: 420, margin: '80px auto', fontFamily: 'system-ui', padding: 16 }}>
      <h1 style={{ fontSize: 24 }}>wagen Kokpit</h1>
      <p style={{ color: '#555' }}>
        Prijavi se brojem telefona koji je prijavljen za tvoj salon.
      </p>
      {step === 'phone' ? (
        <>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            style={{ width: '100%', padding: 12, fontSize: 18, letterSpacing: 2 }}
          />
          <button
            onClick={() => void sendCode()}
            disabled={busy || phone.length < 11}
            style={buttonStyle}
          >
            {busy ? 'Saljem…' : 'Posalji SMS kod'}
          </button>
        </>
      ) : (
        <>
          <p style={{ color: '#555' }}>Kod je poslan na {phone}</p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            maxLength={6}
            autoFocus
            style={{ width: '100%', padding: 12, fontSize: 18, letterSpacing: 6 }}
          />
          <button
            onClick={() => void confirm()}
            disabled={busy || code.length !== 6}
            style={buttonStyle}
          >
            {busy ? 'Provjeravam…' : 'Prijavi se'}
          </button>
        </>
      )}
      {error && <p style={{ color: '#c0392b' }}>{error}</p>}
    </main>
  );
}

const buttonStyle: React.CSSProperties = {
  width: '100%',
  marginTop: 12,
  padding: 12,
  fontSize: 16,
  fontWeight: 700,
  background: '#1EDCE8',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
};
