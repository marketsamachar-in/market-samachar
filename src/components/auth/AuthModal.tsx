import React, { useState, useRef } from 'react';
import { X, Phone, Mail, Chrome } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

// ─── Styles (inline to stay self-contained) ───────────────────────────────────
const s = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(7,7,14,0.92)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '1rem',
  },
  modal: {
    background: '#0d0d1e',
    border: '1px solid #1e1e2e',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '400px',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1.25rem 1.5rem 0',
  },
  logo: {
    color: '#00ff88',
    fontFamily: "'DM Mono', monospace",
    fontSize: '1rem',
    fontWeight: 500,
    letterSpacing: '0.06em',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#888899',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid #1e1e2e',
    margin: '1.25rem 0 0',
  },
  tab: (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '0.6rem 0',
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid #00ff88' : '2px solid transparent',
    color: active ? '#00ff88' : '#888899',
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.72rem',
    letterSpacing: '0.06em',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    transition: 'color 0.15s',
  }),
  body: { padding: '1.5rem' },
  label: {
    display: 'block',
    color: '#888899',
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.7rem',
    letterSpacing: '0.06em',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    background: '#07070e',
    border: '1px solid #1e1e2e',
    borderRadius: '6px',
    color: '#e8eaf0',
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.9rem',
    padding: '0.65rem 0.875rem',
    outline: 'none',
    boxSizing: 'border-box' as const,
    marginBottom: '1rem',
  },
  otpRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '1rem',
  },
  otpInput: {
    flex: 1,
    background: '#07070e',
    border: '1px solid #1e1e2e',
    borderRadius: '6px',
    color: '#e8eaf0',
    fontFamily: "'DM Mono', monospace",
    fontSize: '1.2rem',
    padding: '0.65rem 0',
    outline: 'none',
    textAlign: 'center' as const,
    width: '44px',
  },
  primaryBtn: {
    width: '100%',
    background: '#00ff88',
    border: 'none',
    borderRadius: '6px',
    color: '#07070e',
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.85rem',
    fontWeight: 600,
    padding: '0.7rem',
    cursor: 'pointer',
    letterSpacing: '0.04em',
    marginBottom: '0.75rem',
  },
  ghostBtn: {
    width: '100%',
    background: 'none',
    border: '1px solid #1e1e2e',
    borderRadius: '6px',
    color: '#888899',
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.85rem',
    padding: '0.7rem',
    cursor: 'pointer',
    letterSpacing: '0.04em',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  error: {
    color: '#ff4466',
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.72rem',
    marginBottom: '0.75rem',
  },
  hint: {
    color: '#444455',
    fontFamily: "'DM Mono', monospace",
    fontSize: '0.68rem',
    textAlign: 'center' as const,
    marginTop: '1rem',
    lineHeight: 1.6,
  },
};

// ─── Phone OTP Panel ──────────────────────────────────────────────────────────
function PhonePanel({ onSuccess }: { onSuccess: () => void }) {
  const { signInWithPhone, verifyPhoneOtp } = useAuth();
  const [phone, setPhone]     = useState('');
  const [step, setStep]       = useState<'phone' | 'otp'>('phone');
  const [otp, setOtp]         = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const inputRefs             = useRef<(HTMLInputElement | null)[]>([]);

  const handleSend = async () => {
    setError('');
    if (!phone.match(/^\+?[1-9]\d{9,14}$/)) {
      setError('Enter a valid phone number with country code, e.g. +919876543210');
      return;
    }
    setLoading(true);
    try {
      await signInWithPhone(phone.startsWith('+') ? phone : `+91${phone}`);
      setStep('otp');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (idx: number, val: string) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp];
    next[idx] = val;
    setOtp(next);
    if (val && idx < 5) inputRefs.current[idx + 1]?.focus();
    if (!val && idx > 0) inputRefs.current[idx - 1]?.focus();
  };

  const handleVerify = async () => {
    setError('');
    const token = otp.join('');
    if (token.length !== 6) { setError('Enter the 6-digit OTP'); return; }
    setLoading(true);
    try {
      await verifyPhoneOtp(phone.startsWith('+') ? phone : `+91${phone}`, token);
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'otp') return (
    <div>
      <label style={s.label}>OTP SENT TO {phone}</label>
      <div style={s.otpRow}>
        {otp.map((d, i) => (
          <input
            key={i}
            ref={el => { inputRefs.current[i] = el; }}
            style={s.otpInput}
            value={d}
            maxLength={1}
            inputMode="numeric"
            onChange={e => handleOtpChange(i, e.target.value)}
            onKeyDown={e => { if (e.key === 'Backspace' && !otp[i] && i > 0) inputRefs.current[i - 1]?.focus(); }}
            onPaste={e => {
              const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6).split('');
              const next = [...otp];
              digits.forEach((d, j) => { if (i + j < 6) next[i + j] = d; });
              setOtp(next);
              inputRefs.current[Math.min(i + digits.length, 5)]?.focus();
              e.preventDefault();
            }}
          />
        ))}
      </div>
      {error && <div style={s.error}>{error}</div>}
      <button style={s.primaryBtn} onClick={handleVerify} disabled={loading}>
        {loading ? 'VERIFYING...' : 'VERIFY OTP'}
      </button>
      <button style={s.ghostBtn} onClick={() => { setStep('phone'); setOtp(['','','','','','']); setError(''); }}>
        ← Change number
      </button>
    </div>
  );

  return (
    <div>
      <label style={s.label}>MOBILE NUMBER</label>
      <input
        style={s.input}
        placeholder="+91 98765 43210"
        value={phone}
        onChange={e => setPhone(e.target.value)}
        inputMode="tel"
        onKeyDown={e => e.key === 'Enter' && handleSend()}
      />
      {error && <div style={s.error}>{error}</div>}
      <button style={s.primaryBtn} onClick={handleSend} disabled={loading}>
        {loading ? 'SENDING...' : 'SEND OTP'}
      </button>
      <p style={s.hint}>We'll send a one-time password via SMS.<br />No password to remember.</p>
    </div>
  );
}

// ─── Google Panel ─────────────────────────────────────────────────────────────
function GooglePanel() {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setLoading(true);
    try { await signInWithGoogle(); } finally { setLoading(false); }
  };

  return (
    <div style={{ paddingTop: '0.5rem' }}>
      <button style={{ ...s.primaryBtn, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }} onClick={handle} disabled={loading}>
        <Chrome size={16} />
        {loading ? 'REDIRECTING...' : 'CONTINUE WITH GOOGLE'}
      </button>
      <p style={s.hint}>You'll be redirected to Google to sign in.<br />We only read your name and email.</p>
    </div>
  );
}

// ─── Email Panel ──────────────────────────────────────────────────────────────
function EmailPanel({ onSuccess }: { onSuccess: () => void }) {
  const { signInWithEmail, signUpWithEmail } = useAuth();
  const [mode, setMode]       = useState<'signin' | 'signup'>('signin');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [info, setInfo]       = useState('');

  const handle = async () => {
    setError(''); setInfo('');
    if (!email || !password) { setError('Email and password required'); return; }
    setLoading(true);
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
        onSuccess();
      } else {
        await signUpWithEmail(email, password);
        setInfo('Check your email for a confirmation link.');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <label style={s.label}>EMAIL</label>
      <input style={s.input} type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
      <label style={s.label}>PASSWORD</label>
      <input style={s.input} type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handle()} />
      {error && <div style={s.error}>{error}</div>}
      {info  && <div style={{ ...s.error, color: '#00ff88' }}>{info}</div>}
      <button style={s.primaryBtn} onClick={handle} disabled={loading}>
        {loading ? '...' : mode === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT'}
      </button>
      <button style={s.ghostBtn} onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(''); setInfo(''); }}>
        {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
      </button>
    </div>
  );
}

// ─── AuthModal ────────────────────────────────────────────────────────────────
type Tab = 'phone' | 'google' | 'email';

interface AuthModalProps {
  onClose: () => void;
  defaultTab?: Tab;
}

export function AuthModal({ onClose, defaultTab = 'phone' }: AuthModalProps) {
  const [tab, setTab] = useState<Tab>(defaultTab);

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={s.modal}>
        <div style={s.header}>
          <span style={s.logo}>MARKET SAMACHAR</span>
          <button style={s.closeBtn} onClick={onClose}><X size={18} /></button>
        </div>

        <div style={s.tabs}>
          <button style={s.tab(tab === 'phone')}  onClick={() => setTab('phone')}>
            <Phone size={12} /> PHONE
          </button>
          <button style={s.tab(tab === 'google')} onClick={() => setTab('google')}>
            <Chrome size={12} /> GOOGLE
          </button>
          <button style={s.tab(tab === 'email')}  onClick={() => setTab('email')}>
            <Mail size={12} /> EMAIL
          </button>
        </div>

        <div style={s.body}>
          {tab === 'phone'  && <PhonePanel  onSuccess={onClose} />}
          {tab === 'google' && <GooglePanel />}
          {tab === 'email'  && <EmailPanel  onSuccess={onClose} />}
        </div>
      </div>
    </div>
  );
}
