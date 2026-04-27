/**
 * ShareCardPopup — generates a 400×400 shareable image card for an article
 * using html2canvas, with download + native-share buttons. Awards +2 coins
 * (SHARE_ARTICLE) on first download per article per day for signed-in users.
 */

import { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';

const MONO  = "'DM Mono', monospace";
const SANS  = "'DM Sans', sans-serif";
const GREEN = '#00ff88';
const CARD  = '#0d0d1e';
const TEXT  = '#e8eaf0';
const DIM   = '#556677';
const BORDER = '#1e1e2e';

const CATEGORY_COLORS: Record<string, string> = {
  indian:    '#00ff88',
  companies: '#ffdd3b',
  global:    '#3bffee',
  commodity: '#ff6b3b',
  crypto:    '#b366ff',
  ipo:       '#ff3bff',
  economy:   '#3b9eff',
  banking:   '#3b9eff',
  sebi:      '#ff9f3b',
  rbi:       '#3b9eff',
  all:       GREEN,
};

interface Props {
  articleId:    string;
  articleTitle: string;
  source:       string;
  category:     string;
  pubDate:      string;
  isSignedIn:   boolean;
  authToken:    string | null;
}

function formatPubDate(raw: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export function ShareCardPopup({
  articleId, articleTitle, source, category, pubDate, isSignedIn, authToken,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [generating, setGenerating]   = useState(false);
  const [coinsEarned, setCoinsEarned] = useState(0);
  const [error, setError]             = useState<string | null>(null);
  const [canShare, setCanShare]       = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  const accent = CATEGORY_COLORS[category?.toLowerCase()] || GREEN;

  async function captureCanvas(): Promise<HTMLCanvasElement | null> {
    if (!cardRef.current) return null;
    return html2canvas(cardRef.current, {
      useCORS:    true,
      scale:      2,
      background: CARD,
    } as any);
  }

  async function claimShareCoins() {
    if (!isSignedIn || !authToken) return;
    try {
      const res = await fetch(`/api/news/share/${encodeURIComponent(articleId)}/reward`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (res.ok && data?.ok && data.coinsEarned > 0) {
        setCoinsEarned(data.coinsEarned);
      }
    } catch {
      // Silent — coin reward is a bonus, not the primary action
    }
  }

  async function handleDownload() {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const canvas = await captureCanvas();
      if (!canvas) throw new Error('Capture failed');
      const link = document.createElement('a');
      link.download = 'market-samachar-news.png';
      link.href = canvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      await claimShareCoins();
    } catch (e: any) {
      setError(e?.message || 'Failed to generate image');
    } finally {
      setGenerating(false);
    }
  }

  async function handleNativeShare() {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const canvas = await captureCanvas();
      if (!canvas) throw new Error('Capture failed');
      const blob: Blob | null = await new Promise(resolve =>
        canvas.toBlob(b => resolve(b), 'image/png')
      );
      if (!blob) throw new Error('Failed to encode image');
      const file = new File([blob], 'market-samachar-news.png', { type: 'image/png' });
      await navigator.share({ files: [file], title: articleTitle });
      await claimShareCoins();
    } catch (e: any) {
      // User cancelling share throws AbortError — don't surface as error
      if (e?.name !== 'AbortError') {
        setError(e?.message || 'Failed to share');
      }
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div style={{ fontFamily: SANS }}>
      {/* ── Captured card preview ─────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
        <div
          ref={cardRef}
          style={{
            width:           400,
            height:          400,
            background:      CARD,
            border:          `2px solid ${GREEN}`,
            boxShadow:       '0 0 20px rgba(0,255,136,0.3)',
            borderRadius:    12,
            padding:         24,
            display:         'flex',
            flexDirection:   'column',
            justifyContent:  'space-between',
            boxSizing:       'border-box',
            overflow:        'hidden',
          }}
        >
          {/* Top: brand */}
          <div>
            <div style={{
              fontFamily:    MONO,
              color:         GREEN,
              fontSize:      12,
              letterSpacing: '0.15em',
              fontWeight:    500,
            }}>
              MARKET SAMACHAR
            </div>
            <div style={{
              height:     1,
              background: BORDER,
              margin:     '12px 0 16px',
            }} />

            {/* Category pill */}
            <div style={{
              display:        'inline-block',
              fontFamily:     MONO,
              fontSize:       10,
              letterSpacing:  '0.08em',
              textTransform:  'uppercase',
              color:          accent,
              background:     `${accent}1a`,
              border:         `1px solid ${accent}55`,
              borderRadius:   999,
              padding:        '3px 10px',
              marginBottom:   14,
            }}>
              {category || 'NEWS'}
            </div>

            {/* Headline — clamped to 3 lines */}
            <div style={{
              fontFamily: SANS,
              color:      TEXT,
              fontSize:   16,
              fontWeight: 700,
              lineHeight: 1.45,
              display:           '-webkit-box',
              WebkitLineClamp:   3,
              WebkitBoxOrient:   'vertical',
              overflow:          'hidden',
              textOverflow:      'ellipsis',
            }}>
              {articleTitle}
            </div>
          </div>

          {/* Mid: source + date */}
          <div style={{
            fontFamily:    MONO,
            color:         DIM,
            fontSize:      10,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            display:       'flex',
            justifyContent:'space-between',
            gap:           8,
          }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {source}
            </span>
            <span style={{ flexShrink: 0 }}>
              {formatPubDate(pubDate)}
            </span>
          </div>

          {/* Bottom watermark */}
          <div style={{
            borderTop:  `1px solid ${BORDER}`,
            paddingTop: 12,
            textAlign:  'center',
            fontFamily: MONO,
            color:      GREEN,
            fontSize:   11,
            letterSpacing: '0.1em',
          }}>
            marketsamachar.in
          </div>
        </div>
      </div>

      {/* ── Action buttons ─────────────────────────────────────────────── */}
      <div style={{
        display:        'flex',
        flexDirection:  'column',
        gap:            10,
        alignItems:     'center',
      }}>
        <button
          onClick={handleDownload}
          disabled={generating}
          style={{
            background:    GREEN,
            color:         '#000',
            fontFamily:    MONO,
            fontWeight:    700,
            fontSize:      12,
            letterSpacing: '0.08em',
            border:        'none',
            borderRadius:  8,
            padding:       '12px 24px',
            cursor:        generating ? 'wait' : 'pointer',
            opacity:       generating ? 0.7 : 1,
            minWidth:      200,
          }}
        >
          {generating ? 'GENERATING...' : 'DOWNLOAD'}
        </button>

        {canShare && (
          <button
            onClick={handleNativeShare}
            disabled={generating}
            style={{
              background:    'none',
              color:         GREEN,
              fontFamily:    MONO,
              fontWeight:    700,
              fontSize:      12,
              letterSpacing: '0.08em',
              border:        `1px solid ${GREEN}`,
              borderRadius:  8,
              padding:       '12px 24px',
              cursor:        generating ? 'wait' : 'pointer',
              opacity:       generating ? 0.7 : 1,
              minWidth:      200,
            }}
          >
            {generating ? 'GENERATING...' : 'SHARE'}
          </button>
        )}
      </div>

      {/* ── Coin reward / error ───────────────────────────────────────── */}
      {coinsEarned > 0 && (
        <div style={{
          marginTop:  12,
          textAlign:  'center',
          fontFamily: MONO,
          fontSize:   12,
          color:      '#ffdd3b',
          letterSpacing: '0.06em',
        }}>
          +{coinsEarned} coins earned! 🪙
        </div>
      )}

      {error && (
        <div style={{
          marginTop:  12,
          textAlign:  'center',
          fontFamily: SANS,
          fontSize:   12,
          color:      '#ff4466',
        }}>
          {error}
        </div>
      )}

      {!isSignedIn && (
        <div style={{
          marginTop:     12,
          textAlign:     'center',
          fontFamily:    MONO,
          fontSize:      10,
          color:         DIM,
          letterSpacing: '0.06em',
        }}>
          Sign in to earn +2 coins per share
        </div>
      )}
    </div>
  );
}
