/**
 * ShareCardPopup — Style F (Terminal + Bullets) shareable image card.
 * Uses html2canvas to capture a 400px-wide terminal-style card with key
 * points extracted from the article snippet. Awards +2 coins (SHARE_ARTICLE)
 * on first download per article per day for signed-in users.
 */

import { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';

const MONO_DM   = "'DM Mono', monospace";
const TERM_FONT = "'DM Mono', 'Courier New', monospace";
const SANS      = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const GREEN     = '#00ff88';

interface Props {
  articleId:       string;
  articleTitle:    string;
  source:          string;
  category:        string;
  pubDate:         string;
  contentSnippet?: string;
  isSignedIn:      boolean;
  authToken:       string | null;
}

function generateBullets(snippet: string): string[] {
  if (!snippet || snippet.trim().length === 0) return [];
  return snippet
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 25)
    .slice(0, 3);
}

function formatDate(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).toUpperCase().replace(/ /g, '-');
}

function formatISTTime(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
  }) + ' IST';
}

export function ShareCardPopup({
  articleId, articleTitle, source, category, pubDate, contentSnippet,
  isSignedIn, authToken,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [generating, setGenerating]   = useState(false);
  const [coinsEarned, setCoinsEarned] = useState(0);
  const [error, setError]             = useState<string | null>(null);
  const [canShare, setCanShare]       = useState(false);

  useEffect(() => {
    setCanShare(
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      typeof (navigator as any).canShare === 'function'
    );
  }, []);

  const bullets    = generateBullets(contentSnippet ?? '');
  const dateStr    = formatDate(pubDate);
  const timeStr    = formatISTTime(pubDate);
  const headerCat  = (category || 'NEWS').toUpperCase();
  const headerSrc  = (source   || '').toUpperCase();

  async function captureCanvas(): Promise<HTMLCanvasElement | null> {
    if (!cardRef.current) return null;
    return html2canvas(cardRef.current, {
      useCORS:         true,
      scale:           2,
      backgroundColor: '#020208',
      logging:         false,
      onclone: (clonedDoc: Document) => {
        return (clonedDoc as any).fonts?.ready;
      },
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
      // Silent — bonus, not primary action
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
      const shareData: any = { files: [file], title: articleTitle };
      if ((navigator as any).canShare && !(navigator as any).canShare(shareData)) {
        throw new Error('Cannot share this content on this device');
      }
      await navigator.share(shareData);
      await claimShareCoins();
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setError(e?.message || 'Failed to share');
      }
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      {/* ── Captured terminal-style card ────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div
          id="share-card-capture"
          ref={cardRef}
          style={{
            width:        400,
            background:   '#020208',
            borderRadius: 8,
            overflow:     'hidden',
            border:       `1px solid ${GREEN}`,
            fontFamily:   TERM_FONT,
          }}
        >
          {/* Section 1 — Green header bar */}
          <div style={{
            background:     GREEN,
            padding:        '6px 14px',
            display:        'flex',
            justifyContent: 'space-between',
            alignItems:     'center',
          }}>
            <span style={{
              color:         '#000',
              fontSize:      9,
              fontWeight:    700,
              letterSpacing: '0.12em',
            }}>
              MARKET SAMACHAR TERMINAL
            </span>
            <span style={{ color: '#000', fontSize: 9 }}>
              {dateStr}
            </span>
          </div>

          {/* Section 2 — Content */}
          <div style={{ padding: '12px 14px' }}>
            {/* Row 1 — category + source label */}
            <div style={{
              color:         '#556677',
              fontSize:      9,
              letterSpacing: '0.1em',
              marginBottom:  4,
            }}>
              {`NEWS ALERT / ${headerCat} / ${headerSrc}`}
            </div>

            {/* Row 2 — headline */}
            <div style={{
              color:           GREEN,
              fontSize:        14,
              fontWeight:      700,
              lineHeight:      1.4,
              fontFamily:      TERM_FONT,
              display:         '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow:        'hidden',
              marginBottom:    10,
            } as any}>
              {articleTitle.toUpperCase()}
            </div>

            {/* Row 3 — Key Points box */}
            <div style={{
              border:       '1px solid #0d2d0d',
              borderRadius: 4,
              padding:      '8px 10px',
              marginBottom: 10,
            }}>
              <div style={{
                color:         '#336633',
                fontSize:      8,
                letterSpacing: '0.08em',
                marginBottom:  6,
              }}>
                // KEY POINTS
              </div>

              {bullets.length > 0 ? (
                bullets.map((b, i) => (
                  <div
                    key={i}
                    style={{
                      display:      'flex',
                      gap:          8,
                      marginBottom: i === bullets.length - 1 ? 0 : 4,
                    }}
                  >
                    <span style={{ color: GREEN, fontSize: 9, flexShrink: 0 }}>
                      [{i + 1}]
                    </span>
                    <span style={{
                      color:      '#88aa88',
                      fontSize:   11,
                      lineHeight: 1.5,
                      fontFamily: SANS,
                    }}>
                      {b}
                    </span>
                  </div>
                ))
              ) : (
                <div style={{
                  color:      '#556677',
                  fontSize:   11,
                  fontFamily: "'DM Sans', sans-serif",
                  lineHeight: 1.6,
                  fontStyle:  'italic',
                  padding:    '2px 0',
                }}>
                  Visit marketsamachar.in for the full story.
                </div>
              )}
            </div>

            {/* Row 4 — footer inside content */}
            <div style={{
              borderTop:      '1px solid #0d2d0d',
              paddingTop:     8,
              marginTop:      2,
              display:        'flex',
              justifyContent: 'space-between',
              alignItems:     'center',
            }}>
              <span style={{
                color:         '#336633',
                fontSize:      8,
                letterSpacing: '0.06em',
              }}>
                {`SRC: ${headerSrc}${timeStr ? ' · ' + timeStr : ''}`}
              </span>
              <span style={{
                color:         GREEN,
                fontSize:      10,
                fontWeight:    700,
                letterSpacing: '0.08em',
              }}>
                MARKETSAMACHAR.IN ↗
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Action buttons ──────────────────────────────────────────── */}
      <button
        onClick={handleDownload}
        disabled={generating}
        style={{
          background:    GREEN,
          color:         '#000',
          fontFamily:    MONO_DM,
          fontSize:      12,
          fontWeight:    700,
          letterSpacing: '0.08em',
          borderRadius:  8,
          padding:       '12px 24px',
          border:        'none',
          cursor:        generating ? 'not-allowed' : 'pointer',
          width:         '100%',
          marginTop:     14,
          opacity:       generating ? 0.6 : 1,
        }}
      >
        {generating ? 'GENERATING...' : '⬇ DOWNLOAD CARD'}
      </button>

      {canShare && (
        <button
          onClick={handleNativeShare}
          disabled={generating}
          style={{
            background:    'none',
            border:        `1px solid ${GREEN}`,
            color:         GREEN,
            fontFamily:    MONO_DM,
            fontSize:      12,
            fontWeight:    700,
            letterSpacing: '0.08em',
            borderRadius:  8,
            padding:       '12px 24px',
            cursor:        generating ? 'not-allowed' : 'pointer',
            width:         '100%',
            marginTop:     8,
            opacity:       generating ? 0.6 : 1,
          }}
        >
          {generating ? 'GENERATING...' : '↗ SHARE'}
        </button>
      )}

      {/* ── Coin reward / error ────────────────────────────────────── */}
      {coinsEarned > 0 && (
        <div style={{
          color:      GREEN,
          fontFamily: MONO_DM,
          fontSize:   11,
          textAlign:  'center',
          marginTop:  8,
        }}>
          +{coinsEarned} coins earned! 🪙
        </div>
      )}

      {error && (
        <div style={{
          color:      '#ff4466',
          fontFamily: SANS,
          fontSize:   12,
          textAlign:  'center',
          marginTop:  10,
        }}>
          {error}
        </div>
      )}

      {!isSignedIn && (
        <div style={{
          color:         '#556677',
          fontFamily:    MONO_DM,
          fontSize:      10,
          letterSpacing: '0.06em',
          textAlign:     'center',
          marginTop:     10,
        }}>
          Sign in to earn +2 coins per share
        </div>
      )}
    </div>
  );
}
