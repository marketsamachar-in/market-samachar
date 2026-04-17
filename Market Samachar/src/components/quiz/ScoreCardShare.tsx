import React, { useState, useEffect, useRef } from 'react';
import { Download, Copy, Check, Loader2, Link } from 'lucide-react';
import {
  generateScoreCard, buildShareText,
  shareWhatsApp, shareTwitter, downloadCard,
  type ScoreCardParams,
} from '../../lib/score-card';
import { getTitleFromIQ } from '../../lib/iq-calculator';
import { APP_URL } from '../../lib/config';
import type { SubmitResult } from './types';

const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };

interface ScoreCardShareProps {
  result:    SubmitResult;
  prevIQ:    number;
  username?: string | null;
}

// ─── Inline SVG icons ─────────────────────────────────────────────────────────
function WaIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.555 4.122 1.524 5.855L.057 23.944l6.263-1.642A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.882a9.88 9.88 0 01-5.033-1.375l-.36-.214-3.733.979 1-3.648-.235-.374A9.88 9.88 0 012.118 12C2.118 6.538 6.538 2.118 12 2.118S21.882 6.538 21.882 12 17.462 21.882 12 21.882z"/>
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.906-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export function ScoreCardShare({ result, prevIQ, username }: ScoreCardShareProps) {
  const [imageUrl,   setImageUrl]   = useState('');
  const [generating, setGenerating] = useState(true);
  const [genError,   setGenError]   = useState(false);
  const [expanded,   setExpanded]   = useState(true);
  const [copiedText, setCopiedText] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const generated = useRef(false);

  const titleInfo = getTitleFromIQ(result.new_iq);
  const dateStr   = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
    .toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const shareText = buildShareText({
    score:  result.score,
    total:  result.total,
    streak: result.new_streak,
    iq:     result.new_iq,
    title:  titleInfo.title,
  });
  const challengeUrl = APP_URL;

  // Generate card once
  useEffect(() => {
    if (generated.current) return;
    generated.current = true;

    const params: ScoreCardParams = {
      score:       result.score,
      total:       result.total,
      streak:      result.new_streak,
      iq:          result.new_iq,
      title:       titleInfo.title,
      titleEmoji:  titleInfo.emoji,
      username:    username ?? undefined,
      date:        dateStr,
    };

    generateScoreCard(params)
      .then(url => { setImageUrl(url); setExpanded(true); })
      .catch(() => setGenError(true))
      .finally(() => setGenerating(false));
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleDownload = () => imageUrl && downloadCard(imageUrl);

  const handleCopyText = async () => {
    await navigator.clipboard.writeText(shareText).catch(() => {});
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2500);
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(challengeUrl).catch(() => {});
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleInstagram = () =>
    imageUrl && downloadCard(imageUrl, 'market-quiz-score.png');

  return (
    <div>
      {/* Section label */}
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color: '#334466', ...MONO }} className="text-[10px] uppercase tracking-wider">
          Share Score Card
        </span>
        <span style={{ flex: 1, height: 1, background: '#1e1e2e' }} />
        {imageUrl && (
          <button
            onClick={() => setExpanded(v => !v)}
            style={{ color: '#445566', ...MONO }}
            className="text-[10px] uppercase hover:text-[#00ff88] transition-colors"
          >
            {expanded ? 'Hide' : 'Preview'}
          </button>
        )}
      </div>

      {/* Card preview */}
      {generating && (
        <div
          style={{ background: '#07070e', border: '1px solid #1e1e2e', height: 200, borderRadius: 8 }}
          className="flex items-center justify-center gap-2 mb-3"
        >
          <Loader2 size={14} className="animate-spin" style={{ color: '#00ff88' }} />
          <span style={{ color: '#334466', ...MONO }} className="text-[10px] uppercase">
            Generating 1080×1080 card…
          </span>
        </div>
      )}

      {genError && (
        <div
          style={{ background: '#ff446610', border: '1px solid #ff446630', borderRadius: 8 }}
          className="flex items-center justify-center gap-2 mb-3 p-4"
        >
          <span style={{ color: '#ff4466', ...MONO }} className="text-[10px]">
            Canvas unavailable in this browser
          </span>
        </div>
      )}

      {imageUrl && expanded && (
        <div className="mb-3 relative group" style={{ borderRadius: 8, overflow: 'hidden' }}>
          <img
            src={imageUrl}
            alt="Score card"
            style={{ width: '100%', display: 'block', border: '1px solid #1e1e2e', borderRadius: 8 }}
          />
          {/* Hover overlay — quick download */}
          <div
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: 'rgba(7,7,14,0.65)', borderRadius: 8 }}
          >
            <button
              onClick={handleDownload}
              style={{
                background: '#00ff88', color: '#07070e',
                border: 'none', borderRadius: 6, cursor: 'pointer', ...MONO,
              }}
              className="px-4 py-2 text-[11px] font-semibold uppercase flex items-center gap-2"
            >
              <Download size={13} /> Download PNG
            </button>
          </div>
        </div>
      )}

      {/* ── Share buttons grid ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">

        {/* 📥 Download */}
        <button
          onClick={handleDownload}
          disabled={!imageUrl}
          style={{ background: '#07070e', border: '1px solid #1e1e2e', color: '#00ff88', ...MONO }}
          className="py-2.5 rounded text-[11px] uppercase tracking-wide flex items-center justify-center gap-2 hover:border-[#00ff8840] transition-colors disabled:opacity-30"
        >
          <Download size={13} /> Download PNG
        </button>

        {/* 💬 WhatsApp */}
        <button
          onClick={() => shareWhatsApp(shareText)}
          style={{ background: '#07070e', border: '1px solid #1e1e2e', color: '#25D366', ...MONO }}
          className="py-2.5 rounded text-[11px] uppercase tracking-wide flex items-center justify-center gap-2 hover:border-[#25D36640] transition-colors"
        >
          <WaIcon /> WhatsApp
        </button>

        {/* 🐦 Twitter / X */}
        <button
          onClick={() => shareTwitter(shareText)}
          style={{ background: '#07070e', border: '1px solid #1e1e2e', color: '#e8eaf0', ...MONO }}
          className="py-2.5 rounded text-[11px] uppercase tracking-wide flex items-center justify-center gap-2 hover:border-[#55555540] transition-colors"
        >
          <XIcon /> Post on X
        </button>

        {/* 📋 Copy challenge link */}
        <button
          onClick={handleCopyLink}
          style={{
            background:  copiedLink ? '#00ff8815' : '#07070e',
            border:      `1px solid ${copiedLink ? '#00ff8840' : '#1e1e2e'}`,
            color:       copiedLink ? '#00ff88' : '#8899aa',
            ...MONO,
            transition: 'all 0.2s ease',
          }}
          className="py-2.5 rounded text-[11px] uppercase tracking-wide flex items-center justify-center gap-2"
        >
          {copiedLink
            ? <><Check size={13} /> Link Copied!</>
            : <><Link size={13} /> Copy Link</>
          }
        </button>

      </div>

      {/* ── Copy text (full challenge message) ────────────────────────────── */}
      <button
        onClick={handleCopyText}
        style={{
          background:  copiedText ? '#00ff8810' : '#07070e',
          border:      `1px solid ${copiedText ? '#00ff8830' : '#1e1e2e'}`,
          color:       copiedText ? '#00ff88' : '#445566',
          ...MONO,
          transition: 'all 0.2s ease',
        }}
        className="w-full mt-2 py-2.5 rounded text-[11px] uppercase tracking-wide flex items-center justify-center gap-2"
      >
        {copiedText
          ? <><Check size={13} /> Challenge Text Copied!</>
          : <><Copy size={13} /> Copy Challenge Text</>
        }
      </button>

      {/* Instagram tip */}
      <p style={{ color: '#1e2840', ...MONO }} className="text-[9px] text-center mt-2 uppercase tracking-wide">
        Instagram · download card → share as story or post
      </p>
    </div>
  );
}
