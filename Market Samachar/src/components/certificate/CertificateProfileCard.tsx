/**
 * CertificateProfileCard — Sidebar card shown to logged-in users.
 *
 * States:
 *  1. Streak < 30          → shows progress toward 30-day milestone
 *  2. Streak ≥ 30, not yet claimed → "Claim Certificate" CTA
 *  3. Certificate claimed   → gold badge + cert ID + LinkedIn share
 */

import React, { useState, useEffect } from 'react';
import {
  Award, Loader2, ExternalLink, Trophy,
} from 'lucide-react';
import type { CertificateData } from '../../lib/certificate';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  userName:    string | null;
  investorIq:  number;
  authToken?:  string | null;
  iqTitle:     string;
  iqEmoji:     string;
  streakCount: number;
  coins:       number;
  onShowCertificate: (data: CertificateData) => void;
}

// ─── Style constants ──────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif" };
const GOLD    = '#ffcc44';
const GREEN   = '#00ff88';
const DIM     = '#334466';
const DIMMER  = '#1e2840';
const TEXT    = '#e8eaf0';
const SUBTEXT = '#8899aa';

// LinkedIn icon
function LinkedinIcon({ size = 13 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CertificateProfileCard({
  userName, investorIq, iqTitle, iqEmoji, streakCount,
  coins, authToken, onShowCertificate,
}: Props) {
  const [claiming,  setClaiming]  = useState(false);
  const [certData,  setCertData]  = useState<CertificateData | null>(null);
  const [certError, setCertError] = useState<string | null>(null);
  const [loaded,    setLoaded]    = useState(false);

  const eligible = streakCount >= 30 && streakCount % 30 === 0;

  // On mount: silently check if a cert already exists for this streak milestone
  useEffect(() => {
    if (!eligible) { setLoaded(true); return; }
    fetch('/api/certificate/issue', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) } })
      .then(r => r.json())
      .then(data => {
        if (data.id) setCertData(data as CertificateData);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [eligible]);

  const handleClaim = async () => {
    setClaiming(true);
    setCertError(null);
    try {
      const res  = await fetch('/api/certificate/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate certificate');
      setCertData(data as CertificateData);
      onShowCertificate(data as CertificateData);
    } catch (e: any) {
      setCertError(e.message);
    } finally {
      setClaiming(false);
    }
  };

  const handleLinkedIn = (cert: CertificateData) => {
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(cert.verify_url)}`,
      '_blank', 'noopener,width=600,height=600',
    );
  };

  return (
    <div
      style={{
        background:   '#0d0d1e',
        border:       '1px solid #1a1a2e',
        borderRadius: 10,
        overflow:     'hidden',
      }}
    >
      {/* Profile header */}
      <div style={{ background: '#07070e', borderBottom: '1px solid #1a1a2e', padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
            {iqEmoji}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: TEXT, ...SANS, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {userName ?? 'Investor'}
            </div>
            <div style={{ color: DIM, ...MONO, fontSize: 9, marginTop: 1 }}>
              MEMBER
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {[
            { label: 'IQ',     value: String(investorIq), color: GOLD    },
            { label: 'STREAK', value: `🔥${streakCount}`, color: '#ff9f3b' },
            { label: 'COINS',  value: `⚡${coins}`,       color: GREEN   },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: '#0a0a18', borderRadius: 5, padding: '5px 6px', textAlign: 'center' }}>
              <div style={{ color: DIM, ...MONO, fontSize: 8 }}>{label}</div>
              <div style={{ color, ...MONO, fontSize: 11, fontWeight: 600, marginTop: 2 }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ color: DIMMER, ...MONO, fontSize: 9, marginTop: 6, textAlign: 'center' }}>
          {iqEmoji} {iqTitle}
        </div>
      </div>

      {/* Certificate section */}
      <div style={{ padding: '10px 14px' }}>

        {/* ── Already has a certificate ──────────────────────────────────── */}
        {certData ? (
          <div>
            <div
              style={{
                background: `${GOLD}0a`,
                border:     `1px solid ${GOLD}30`,
                borderRadius: 8,
                padding:    '10px 12px',
                marginBottom: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Trophy className="w-3.5 h-3.5" style={{ color: GOLD }} />
                <span style={{ color: GOLD, ...MONO, fontSize: 10, letterSpacing: 1 }}>
                  MARKET SAMACHAR CERTIFIED
                </span>
              </div>
              <div style={{ color: TEXT, ...SANS, fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
                {certData.iq_emoji} {certData.iq_title}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ color: GOLD, ...MONO, fontSize: 10, fontWeight: 700 }}>{certData.id}</span>
                <a
                  href={certData.verify_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: DIM, display: 'flex' }}
                  title="Verify certificate"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => onShowCertificate(certData)}
                  style={{
                    flex: 1,
                    background: `${GOLD}18`,
                    border:     `1px solid ${GOLD}40`,
                    color:      GOLD,
                    ...MONO,
                    fontSize:   10,
                    padding:    '5px 0',
                    borderRadius: 5,
                    cursor:     'pointer',
                    display:    'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap:        4,
                  }}
                >
                  <Award className="w-3 h-3" />
                  View PDF
                </button>
                <button
                  onClick={() => handleLinkedIn(certData)}
                  style={{
                    flex: 1,
                    background: '#0a1621',
                    border:     '1px solid #0A66C250',
                    color:      '#0A66C2',
                    ...MONO,
                    fontSize:   10,
                    padding:    '5px 0',
                    borderRadius: 5,
                    cursor:     'pointer',
                    display:    'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap:        4,
                  }}
                >
                  <LinkedinIcon size={12} />
                  LinkedIn
                </button>
              </div>
            </div>
          </div>
        ) : eligible && loaded ? (
          /* ── Eligible, not yet claimed ─────────────────────────────────── */
          <div>
            <div
              style={{
                background: `${GOLD}0a`,
                border:     `1px solid ${GOLD}30`,
                borderRadius: 8,
                padding:    '10px 12px',
                marginBottom: 8,
                textAlign:  'center',
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 4 }}>🏆</div>
              <div style={{ color: GOLD, ...MONO, fontSize: 10, marginBottom: 4 }}>
                30-DAY MILESTONE REACHED!
              </div>
              <div style={{ color: SUBTEXT, ...SANS, fontSize: 11, lineHeight: 1.4, marginBottom: 8 }}>
                You've completed a {streakCount}-day streak. Claim your certificate!
              </div>
              {certError && (
                <div style={{ color: '#ff4466', ...MONO, fontSize: 9, marginBottom: 6 }}>
                  {certError}
                </div>
              )}
              <button
                onClick={handleClaim}
                disabled={claiming}
                style={{
                  background:   GOLD,
                  color:        '#07070e',
                  border:       'none',
                  borderRadius: 6,
                  padding:      '8px 16px',
                  cursor:       'pointer',
                  ...MONO,
                  fontSize:     11,
                  fontWeight:   700,
                  width:        '100%',
                  display:      'flex',
                  alignItems:   'center',
                  justifyContent: 'center',
                  gap:          6,
                  opacity:      claiming ? 0.7 : 1,
                }}
              >
                {claiming
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating…</>
                  : <><Trophy className="w-3.5 h-3.5" />Claim Certificate</>
                }
              </button>
            </div>
          </div>
        ) : (
          /* ── Not yet eligible — streak progress ────────────────────────── */
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Award className="w-3 h-3" style={{ color: DIM }} />
              <span style={{ color: DIM, ...MONO, fontSize: 9 }}>CERTIFICATION PROGRESS</span>
            </div>

            {/* Progress bar */}
            <div style={{ background: '#0a0a18', borderRadius: 4, height: 6, marginBottom: 4, overflow: 'hidden' }}>
              <div
                style={{
                  height:     '100%',
                  width:      `${Math.min(100, (streakCount / 30) * 100)}%`,
                  background: streakCount > 0
                    ? `linear-gradient(90deg, #ff9f3b, ${GOLD})`
                    : '#1a1a2e',
                  borderRadius: 4,
                  transition: 'width 0.6s ease',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: streakCount > 0 ? '#ff9f3b' : DIMMER, ...MONO, fontSize: 9 }}>
                🔥 {streakCount} days
              </span>
              <span style={{ color: DIMMER, ...MONO, fontSize: 9 }}>
                30 days needed
              </span>
            </div>

            {streakCount > 0 && (
              <div style={{ color: DIMMER, ...MONO, fontSize: 9, marginTop: 4, textAlign: 'center' }}>
                {30 - streakCount} more day{30 - streakCount !== 1 ? 's' : ''} to earn your certificate
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
