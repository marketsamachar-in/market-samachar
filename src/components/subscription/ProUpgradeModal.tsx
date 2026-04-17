import React, { useState, useEffect } from 'react';
import {
  X, Check, Zap, Crown, TrendingUp, Bell, BarChart2,
  Shield, Trophy, Loader2, Sparkles, ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif" };

// ─── Types ────────────────────────────────────────────────────────────────────

interface Plan {
  key:     'daily' | 'monthly' | 'yearly';
  label:   string;
  price:   string;
  per:     string;
  amount:  number;   // INR whole number
  badge?:  string;
  color:   string;
  saving?: string;
}

const PLANS: Plan[] = [
  {
    key:    'daily',
    label:  'Daily',
    price:  '₹1',
    per:    '/ day',
    amount: 1,
    color:  '#556688',
  },
  {
    key:    'monthly',
    label:  'Monthly',
    price:  '₹30',
    per:    '/ month',
    amount: 30,
    color:  '#3b9eff',
    saving: 'Save ₹0.99/day vs Daily',
  },
  {
    key:    'yearly',
    label:  'Yearly',
    price:  '₹299',
    per:    '/ year',
    amount: 299,
    badge:  'Best Value',
    color:  '#00ff88',
    saving: '≈₹0.82/day — 18% off',
  },
];

const PRO_FEATURES = [
  { icon: BarChart2,  text: 'Advanced market analytics dashboard' },
  { icon: Bell,       text: 'Real-time Nifty & stock price alerts' },
  { icon: Zap,        text: 'Priority AI news summaries (instant)' },
  { icon: TrendingUp, text: 'Exclusive macro & FII/DII flow data' },
  { icon: Crown,      text: 'Pro badge on Market Quiz leaderboard' },
  { icon: Shield,     text: 'Ad-free experience across all pages' },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface ProUpgradeModalProps {
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProUpgradeModal({ onClose }: ProUpgradeModalProps) {
  const { user, session } = useAuth();
  const [selected, setSelected] = useState<Plan['key']>('yearly');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState(false);

  // Detect return from Instamojo payment page (?payment=success)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      setSuccess(true);
      // Clean the query param without a full reload
      const clean = window.location.pathname;
      window.history.replaceState({}, '', clean);
    }
  }, []);

  // ── Payment flow ────────────────────────────────────────────────────────────
  const handlePay = async () => {
    if (!user || !session) {
      setError('Please sign in first.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/payment/create-link', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan: selected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create payment link');

      // Redirect to Instamojo hosted payment page
      window.location.href = data.payment_url;
    } catch (err: any) {
      setError(err?.message ?? 'Payment setup failed. Please try again.');
      setLoading(false);
    }
    // Note: don't reset loading=false on success — we're navigating away
  };

  // ── Success screen ──────────────────────────────────────────────────────────
  if (success) {
    return (
      <Backdrop onClose={onClose}>
        <div
          style={{
            background: '#0d0d1e',
            border: '1px solid #00ff8840',
            borderTop: '3px solid #00ff88',
            borderRadius: 14,
            width: '100%',
            maxWidth: 440,
          }}
          className="p-8 text-center"
        >
          <div
            style={{
              width: 72, height: 72, borderRadius: '50%',
              background: '#00ff8818', border: '2px solid #00ff8840',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}
          >
            <Sparkles size={32} style={{ color: '#00ff88' }} />
          </div>

          <p style={{ color: '#00ff88', ...MONO, fontSize: 11, letterSpacing: '0.1em' }}
            className="uppercase mb-2">
            Welcome to Pro
          </p>
          <h2 style={{ color: '#e8eaf0', ...SANS, fontSize: 24, fontWeight: 700 }} className="mb-3">
            You're now a Pro member! 🎉
          </h2>
          <p style={{ color: '#556688', ...SANS, fontSize: 14 }} className="mb-6 leading-relaxed">
            Your account has been upgraded. Enjoy all Pro features — analytics,
            real-time alerts, ad-free reading, and your Pro badge on the leaderboard.
          </p>
          <button
            onClick={onClose}
            style={{ background: '#00ff88', color: '#07070e', ...MONO }}
            className="w-full py-3 rounded text-[12px] font-semibold uppercase tracking-wider"
          >
            Start Exploring →
          </button>
        </div>
      </Backdrop>
    );
  }

  // ── Main modal ──────────────────────────────────────────────────────────────
  return (
    <Backdrop onClose={onClose}>
      <div
        style={{
          background:   '#0d0d1e',
          border:       '1px solid #1e1e2e',
          borderTop:    '3px solid #00ff88',
          borderRadius: 14,
          width:        '100%',
          maxWidth:     520,
          maxHeight:    '92vh',
          overflowY:    'auto',
        }}
      >
        {/* Header */}
        <div
          style={{ background: '#07070e', borderBottom: '1px solid #1e1e2e' }}
          className="px-5 py-3 flex items-center gap-2"
        >
          <Crown size={14} style={{ color: '#00ff88' }} />
          <span style={{ color: '#00ff88', ...MONO }} className="text-[10px] uppercase tracking-widest">
            Upgrade to Pro
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#334466', marginLeft: 'auto' }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">

          {/* Headline */}
          <div className="text-center">
            <h2 style={{ color: '#e8eaf0', ...SANS, fontSize: 20, fontWeight: 700 }} className="mb-1">
              Take your market edge further
            </h2>
            <p style={{ color: '#556688', ...SANS, fontSize: 13 }}>
              Full analytics, real-time alerts, and the Pro badge — all yours.
            </p>
          </div>

          {/* Feature list */}
          <div
            style={{ background: '#07070e', border: '1px solid #1e1e2e', borderRadius: 10 }}
            className="p-4 space-y-2.5"
          >
            {PRO_FEATURES.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div
                  style={{
                    width: 26, height: 26, borderRadius: 6,
                    background: '#00ff8812', border: '1px solid #00ff8820',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon size={13} style={{ color: '#00ff88' }} />
                </div>
                <span style={{ color: '#8899aa', ...SANS, fontSize: 13 }}>{text}</span>
                <Check size={12} style={{ color: '#00ff88', marginLeft: 'auto', flexShrink: 0 }} />
              </div>
            ))}
          </div>

          {/* Plan cards */}
          <div>
            <p style={{ color: '#334466', ...MONO }} className="text-[9px] uppercase tracking-wider mb-2">
              Choose a plan
            </p>
            <div className="space-y-2">
              {PLANS.map(plan => {
                const active = selected === plan.key;
                return (
                  <button
                    key={plan.key}
                    onClick={() => setSelected(plan.key)}
                    style={{
                      width:        '100%',
                      background:   active ? `${plan.color}12` : '#07070e',
                      border:       `1px solid ${active ? plan.color + '60' : '#1e1e2e'}`,
                      borderRadius: 10,
                      cursor:       'pointer',
                      transition:   'all 0.15s',
                      textAlign:    'left',
                      padding:      '12px 14px',
                      display:      'flex',
                      alignItems:   'center',
                      gap:          12,
                    }}
                  >
                    {/* Radio dot */}
                    <div
                      style={{
                        width: 16, height: 16, borderRadius: '50%',
                        border: `2px solid ${active ? plan.color : '#334466'}`,
                        background: active ? plan.color : 'transparent',
                        flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {active && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#07070e' }} />}
                    </div>

                    {/* Plan info */}
                    <div style={{ flex: 1 }}>
                      <div className="flex items-center gap-2">
                        <span style={{ color: active ? plan.color : '#8899aa', ...MONO, fontSize: 13, fontWeight: 700 }}>
                          {plan.label}
                        </span>
                        {plan.badge && (
                          <span
                            style={{
                              background: '#00ff8818', border: '1px solid #00ff8840',
                              color: '#00ff88', ...MONO, fontSize: 9,
                              padding: '1px 7px', borderRadius: 20,
                            }}
                          >
                            {plan.badge}
                          </span>
                        )}
                      </div>
                      {plan.saving && (
                        <p style={{ color: '#334466', ...MONO, fontSize: 10, marginTop: 2 }}>{plan.saving}</p>
                      )}
                    </div>

                    {/* Price */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ color: active ? plan.color : '#e8eaf0', ...MONO, fontSize: 18, fontWeight: 700 }}>
                        {plan.price}
                      </span>
                      <span style={{ color: '#334466', ...MONO, fontSize: 11 }}> {plan.per}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              style={{ background: '#ff446610', border: '1px solid #ff446630', borderRadius: 8 }}
              className="px-3 py-2"
            >
              <p style={{ color: '#ff4466', ...MONO }} className="text-[11px]">{error}</p>
            </div>
          )}

          {/* Pay button */}
          <button
            onClick={handlePay}
            disabled={loading}
            style={{
              background: loading ? '#00cc6a' : '#00ff88',
              color: '#07070e', ...MONO,
              border: 'none', cursor: loading ? 'wait' : 'pointer',
              borderRadius: 8, width: '100%',
              padding: '14px',
              transition: 'background 0.2s',
            }}
            className="text-[12px] font-semibold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {loading
              ? <><Loader2 size={14} className="animate-spin" /> Creating payment link…</>
              : <><ExternalLink size={14} /> Pay {PLANS.find(p => p.key === selected)?.price} — Continue to Payment</>
            }
          </button>

          <p style={{ color: '#2a2a4a', ...MONO }} className="text-[9px] text-center uppercase">
            Secured by Instamojo · UPI, Cards, Netbanking accepted
          </p>

          {/* Win Pro free */}
          <div
            style={{
              background: '#ffdd3b08', border: '1px solid #ffdd3b20',
              borderRadius: 10, padding: '12px 14px',
            }}
            className="flex items-center gap-3"
          >
            <Trophy size={20} style={{ color: '#ffdd3b', flexShrink: 0 }} />
            <div>
              <p style={{ color: '#ffdd3b', ...MONO, fontSize: 11, fontWeight: 700 }}>
                🏆 Top the leaderboard → Win Pro FREE
              </p>
              <p style={{ color: '#556688', ...SANS, fontSize: 11, marginTop: 3 }}>
                Score 5/5 and finish #1 on the daily leaderboard to earn 7 free Pro days — no payment needed.
              </p>
            </div>
          </div>

        </div>
      </div>
    </Backdrop>
  );
}

// ─── Backdrop wrapper ─────────────────────────────────────────────────────────

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(7,7,14,0.92)',
        zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {children}
    </div>
  );
}
