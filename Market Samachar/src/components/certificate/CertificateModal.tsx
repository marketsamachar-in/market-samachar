import React, { useState, useEffect, useRef } from 'react';
import {
  X, Download, Share2, Award, Loader2, ExternalLink, Copy, Check, Linkedin,
} from 'lucide-react';
import { downloadCertificatePDF, getCertificatePreviewUrl, type CertificateData } from '../../lib/certificate';
import { BRAND_HOST } from '../../lib/config';

const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif" };
const GOLD = '#ffcc44';

// ─── LinkedIn icon (not in lucide-react) ─────────────────────────────────────
function LinkedinIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface CertificateModalProps {
  data:    CertificateData;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CertificateModal({ data, onClose }: CertificateModalProps) {
  const [previewUrl,    setPreviewUrl]    = useState('');
  const [generating,    setGenerating]    = useState(true);
  const [downloading,   setDownloading]   = useState(false);
  const [copied,        setCopied]        = useState(false);
  const generated = useRef(false);

  const verifyUrl = data.verify_url;
  const issueDate = new Date(data.issued_at).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  useEffect(() => {
    if (generated.current) return;
    generated.current = true;
    getCertificatePreviewUrl(data)
      .then(setPreviewUrl)
      .finally(() => setGenerating(false));
  }, []);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadCertificatePDF(data);
    } finally {
      setDownloading(false);
    }
  };

  const handleLinkedIn = () => {
    // LinkedIn article share with verify URL
    const text = encodeURIComponent(
      `I just earned my Market Samachar Certified badge! 🏆\n` +
      `${data.iq_emoji} Investor IQ: ${data.iq_score} — ${data.iq_title}\n` +
      `🔥 ${data.streak_days}-day consecutive quiz streak\n` +
      `Verify: ${verifyUrl}`
    );
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(verifyUrl)}`,
      '_blank', 'noopener,width=600,height=600',
    );
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(verifyUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleTwitter = () => {
    const text =
      `I just earned the Market Samachar Certified badge! 🏆\n` +
      `${data.iq_emoji} IQ: ${data.iq_score} — ${data.iq_title}\n` +
      `🔥 ${data.streak_days}-day streak on Market Quiz\n` +
      BRAND_HOST;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(verifyUrl)}`,
      '_blank', 'noopener',
    );
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(7,7,14,0.97)',
        zIndex: 10001,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          background:   '#0d0d1e',
          border:       `1px solid ${GOLD}40`,
          borderTop:    `3px solid ${GOLD}`,
          borderRadius: 14,
          width:        '100%',
          maxWidth:     580,
          maxHeight:    '92vh',
          overflowY:    'auto',
        }}
      >
        {/* Header */}
        <div
          style={{ background: '#07070e', borderBottom: '1px solid #1e1e2e' }}
          className="px-5 py-3 flex items-center gap-2"
        >
          <Award size={14} style={{ color: GOLD }} />
          <span style={{ color: GOLD, ...MONO }} className="text-[10px] uppercase tracking-widest">
            Certificate Earned
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#334466', marginLeft: 'auto' }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">

          {/* Congratulations banner */}
          <div
            style={{
              background: `${GOLD}0c`,
              border: `1px solid ${GOLD}30`,
              borderRadius: 10,
            }}
            className="px-4 py-3 text-center"
          >
            <p style={{ color: GOLD, ...MONO }} className="text-[10px] uppercase tracking-widest mb-1">
              🎉 30-Day Challenge Complete!
            </p>
            <h2 style={{ color: '#e8eaf0', ...SANS, fontSize: 18, fontWeight: 700 }}>
              You're officially Market Samachar Certified
            </h2>
          </div>

          {/* Certificate preview */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span style={{ color: '#334466', ...MONO }} className="text-[10px] uppercase tracking-wider">
                Your Certificate
              </span>
              <span style={{ flex: 1, height: 1, background: '#1e1e2e' }} />
              <span style={{ color: '#2a2a4a', ...MONO }} className="text-[9px]">A4 · PDF download</span>
            </div>

            {generating ? (
              <div
                style={{ background: '#07070e', border: '1px solid #1e1e2e', height: 220, borderRadius: 8 }}
                className="flex items-center justify-center gap-2"
              >
                <Loader2 size={14} className="animate-spin" style={{ color: GOLD }} />
                <span style={{ color: '#334466', ...MONO }} className="text-[10px] uppercase">
                  Rendering certificate…
                </span>
              </div>
            ) : previewUrl ? (
              <div className="relative group">
                <img
                  src={previewUrl}
                  alt="Certificate preview"
                  style={{ width: '100%', borderRadius: 8, border: `1px solid ${GOLD}30`, display: 'block' }}
                />
                {/* Hover overlay */}
                <div
                  className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: 'rgba(7,7,14,0.7)', borderRadius: 8 }}
                >
                  <button
                    onClick={handleDownload}
                    disabled={downloading}
                    style={{ background: GOLD, color: '#07070e', ...MONO, border: 'none', cursor: 'pointer', borderRadius: 6 }}
                    className="px-4 py-2 text-[11px] font-semibold uppercase flex items-center gap-2"
                  >
                    {downloading
                      ? <><Loader2 size={12} className="animate-spin" /> Generating PDF…</>
                      : <><Download size={12} /> Download PDF</>
                    }
                  </button>
                </div>
              </div>
            ) : (
              <div
                style={{ background: '#ff446610', border: '1px solid #ff446630', borderRadius: 8, height: 100 }}
                className="flex items-center justify-center"
              >
                <span style={{ color: '#ff4466', ...MONO }} className="text-[10px]">
                  Preview unavailable — download still works
                </span>
              </div>
            )}
          </div>

          {/* Cert details */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Certificate ID', value: data.id, color: GOLD },
              { label: 'Issued On',      value: issueDate,   color: '#8899aa' },
              { label: 'Investor IQ',    value: `${data.iq_score} — ${data.iq_title} ${data.iq_emoji}`, color: '#e8eaf0' },
              { label: 'Streak',         value: `🔥 ${data.streak_days} days`, color: '#ff9f3b' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: '#07070e', border: '1px solid #1e1e2e', borderRadius: 8 }} className="px-3 py-2">
                <div style={{ color: '#334466', ...MONO }} className="text-[9px] uppercase tracking-wider mb-0.5">{label}</div>
                <div style={{ color, ...MONO }} className="text-[12px]">{value}</div>
              </div>
            ))}
          </div>

          {/* Verify link */}
          <div
            style={{ background: '#07070e', border: '1px solid #1e1e2e', borderRadius: 8 }}
            className="px-3 py-2"
          >
            <div style={{ color: '#334466', ...MONO }} className="text-[9px] uppercase tracking-wider mb-1">
              Public Verification URL
            </div>
            <div className="flex items-center gap-2">
              <span style={{ color: '#556688', ...MONO }} className="text-[11px] flex-1 truncate">
                {verifyUrl}
              </span>
              <a
                href={verifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#334466' }}
                className="hover:text-[#00ff88] transition-colors"
              >
                <ExternalLink size={13} />
              </a>
            </div>
          </div>

          {/* Action buttons */}
          <div className="space-y-2">
            {/* Download PDF — primary */}
            <button
              onClick={handleDownload}
              disabled={downloading}
              style={{ background: GOLD, color: '#07070e', ...MONO, border: 'none', cursor: 'pointer', borderRadius: 8, width: '100%' }}
              className="py-3 text-[12px] font-semibold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {downloading
                ? <><Loader2 size={14} className="animate-spin" /> Generating PDF…</>
                : <><Download size={14} /> Download Certificate PDF</>
              }
            </button>

            {/* Share row */}
            <div className="grid grid-cols-3 gap-2">
              {/* LinkedIn */}
              <button
                onClick={handleLinkedIn}
                style={{ background: '#07070e', border: '1px solid #1e1e2e', color: '#0A66C2', ...MONO }}
                className="py-2.5 rounded text-[11px] uppercase tracking-wide flex items-center justify-center gap-1.5 hover:border-[#0A66C250] transition-colors"
              >
                <LinkedinIcon size={13} /> LinkedIn
              </button>

              {/* Twitter/X */}
              <button
                onClick={handleTwitter}
                style={{ background: '#07070e', border: '1px solid #1e1e2e', color: '#e8eaf0', ...MONO }}
                className="py-2.5 rounded text-[11px] uppercase tracking-wide flex items-center justify-center gap-1.5 hover:border-[#55555540] transition-colors"
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.906-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                Post on X
              </button>

              {/* Copy link */}
              <button
                onClick={handleCopyLink}
                style={{
                  background: copied ? '#00ff8818' : '#07070e',
                  border: `1px solid ${copied ? '#00ff8840' : '#1e1e2e'}`,
                  color: copied ? '#00ff88' : '#8899aa',
                  ...MONO,
                }}
                className="py-2.5 rounded text-[11px] uppercase tracking-wide flex items-center justify-center gap-1.5 transition-all"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
            </div>
          </div>

          <p style={{ color: '#2a2a4a', ...MONO }} className="text-[9px] text-center uppercase">
            Share on LinkedIn · anyone with the link can verify this certificate
          </p>

        </div>
      </div>
    </div>
  );
}
