/**
 * ShareCardPopup — Style F (Terminal + Bullets) shareable image card.
 * Uses html2canvas to capture a 400px-wide terminal-style card.
 *
 * Coin economy:
 *   • +25 coins per share (capped at 10/day)
 *   • +50 multi-platform bonus when same article is shared to 2+ platforms
 *   • +100 streak bonus at 5 shares today
 *   • +500 viral jackpot via referral when someone signs up via the link
 *
 * Share URLs are decorated with `?ref=USER_CODE` so the existing referral
 * payout fires on signup.
 */

import { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { buildArticleShareUrl, buildShareText, type SharePlatform } from '../../lib/referral';

const MONO_DM   = "'DM Mono', monospace";
const TERM_FONT = "'DM Mono', 'Courier New', monospace";
const SANS      = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const GREEN     = '#00ff88';
const ORANGE    = '#ff9f3b';

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
  const [bonusEarned, setBonusEarned] = useState(0);
  const [bonusReason, setBonusReason] = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [canShare, setCanShare]       = useState(false);
  const [refCode,  setRefCode]        = useState<string | null>(null);
  const [shared,   setShared]         = useState<Set<SharePlatform>>(new Set());

  useEffect(() => {
    setCanShare(
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      typeof (navigator as any).canShare === 'function'
    );
  }, []);

  // Fetch the user's referral code so we can decorate share links
  useEffect(() => {
    if (!isSignedIn || !authToken) { setRefCode(null); return; }
    let aborted = false;
    fetch('/api/rewards/hub', { headers: { Authorization: `Bearer ${authToken}` } })
      .then(r => r.json())
      .then(d => { if (!aborted && d?.referralCode) setRefCode(d.referralCode); })
      .catch(() => { /* ignore */ });
    return () => { aborted = true; };
  }, [isSignedIn, authToken]);

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

  async function claimShareCoins(platform: SharePlatform) {
    if (!isSignedIn || !authToken) return;
    try {
      const res = await fetch(`/api/news/share/${encodeURIComponent(articleId)}/reward`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body:    JSON.stringify({ platform }),
      });
      const data = await res.json();
      if (res.ok && data?.ok) {
        if (data.coinsEarned > 0) setCoinsEarned(data.coinsEarned);
        if (data.bonusEarned > 0) {
          setBonusEarned(data.bonusEarned);
          if (data.bonusReason) setBonusReason(data.bonusReason);
        }
        setShared(s => new Set(s).add(platform));
      }
    } catch {
      // Silent — bonus, not primary action
    }
  }

  async function shareToPlatform(platform: SharePlatform) {
    if (generating) return;
    const shareUrl  = buildArticleShareUrl(articleId, refCode, platform);
    const shareText = buildShareText(articleTitle, refCode);
    const encoded   = (s: string) => encodeURIComponent(s);

    let openUrl: string | null = null;
    if (platform === 'whatsapp') {
      openUrl = `https://wa.me/?text=${encoded(shareText + '\n\n' + shareUrl)}`;
    } else if (platform === 'twitter') {
      openUrl = `https://twitter.com/intent/tweet?text=${encoded(shareText)}&url=${encoded(shareUrl)}`;
    } else if (platform === 'telegram') {
      openUrl = `https://t.me/share/url?url=${encoded(shareUrl)}&text=${encoded(shareText)}`;
    } else if (platform === 'copy') {
      try {
        await navigator.clipboard.writeText(`${shareText}\n\n${shareUrl}`);
      } catch {
        setError('Could not copy to clipboard');
        return;
      }
    }

    if (openUrl) {
      window.open(openUrl, '_blank', 'noopener,noreferrer');
    }
    await claimShareCoins(platform);
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
      // Downloading the image counts as an "other" share
      await claimShareCoins('other');
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
      const shareUrl = buildArticleShareUrl(articleId, refCode, 'other');
      const shareData: any = {
        files: [file], title: articleTitle,
        text: buildShareText(articleTitle, refCode),
        url:  shareUrl,
      };
      if ((navigator as any).canShare && !(navigator as any).canShare(shareData)) {
        // Fallback to URL+text only (no image) — still valuable share
        delete shareData.files;
      }
      await navigator.share(shareData);
      await claimShareCoins('other');
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
              color:        GREEN,
              fontSize:     14,
              fontWeight:   700,
              lineHeight:   1.4,
              fontFamily:   TERM_FONT,
              marginBottom: 12,
              height:       42,
              overflow:     'hidden',
              wordBreak:    'break-word',
              display:      'block',
            }}>
              {articleTitle.toUpperCase()}
            </div>

            {/* Row 3 — Key Points box */}
            <div style={{
              border:       '1px solid #0d2d0d',
              borderRadius: 4,
              padding:      '8px 10px',
              marginTop:    4,
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
                whiteSpace:    'nowrap',
                overflow:      'hidden',
                textOverflow:  'ellipsis',
                maxWidth:      '60%',
                display:       'block',
              }}>
                {`SRC: ${headerSrc}${timeStr ? ' · ' + timeStr : ''}`}
              </span>
              <span style={{
                color:         GREEN,
                fontSize:      10,
                fontWeight:    700,
                letterSpacing: '0.08em',
                flexShrink:    0,
                whiteSpace:    'nowrap',
              }}>
                MARKETSAMACHAR.IN ↗
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Platform share grid ─────────────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
        marginTop: 14,
      }}>
        {([
          { p: 'whatsapp' as const, label: 'WhatsApp', emoji: '💚', color: '#25D366' },
          { p: 'twitter'  as const, label: 'X / Twitter', emoji: '𝕏', color: '#ffffff' },
          { p: 'telegram' as const, label: 'Telegram', emoji: '✈️', color: '#229ED9' },
          { p: 'copy'     as const, label: 'Copy Link', emoji: '🔗', color: '#aaaaaa' },
        ]).map((opt) => {
          const done = shared.has(opt.p);
          return (
            <button
              key={opt.p}
              onClick={() => shareToPlatform(opt.p)}
              disabled={generating}
              style={{
                background:    done ? `${opt.color}18` : '#0a0a18',
                border:        `1px solid ${done ? opt.color + '88' : '#1a1a2e'}`,
                color:         done ? opt.color : '#e8eaf0',
                fontFamily:    MONO_DM, fontSize: 11, fontWeight: 700,
                letterSpacing: '0.06em',
                borderRadius:  8, padding: '12px 8px',
                cursor: generating ? 'not-allowed' : 'pointer',
                opacity: generating ? 0.6 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                textTransform: 'uppercase',
              }}
            >
              <span style={{ fontSize: 14 }}>{opt.emoji}</span>
              {done ? '✓ ' : ''}{opt.label}
            </button>
          );
        })}
      </div>

      {/* ── Image card download (secondary) ─────────────────────────── */}
      <button
        onClick={handleDownload}
        disabled={generating}
        style={{
          background:    'none',
          border:        `1px solid ${GREEN}`,
          color:         GREEN,
          fontFamily:    MONO_DM,
          fontSize:      11,
          fontWeight:    700,
          letterSpacing: '0.08em',
          borderRadius:  8,
          padding:       '10px 24px',
          cursor:        generating ? 'not-allowed' : 'pointer',
          width:         '100%',
          marginTop:     8,
          opacity:       generating ? 0.6 : 1,
        }}
      >
        {generating ? 'GENERATING...' : '⬇ DOWNLOAD AS IMAGE'}
      </button>

      {canShare && (
        <button
          onClick={handleNativeShare}
          disabled={generating}
          style={{
            background:    'none',
            border:        `1px solid #1a1a2e`,
            color:         '#888899',
            fontFamily:    MONO_DM,
            fontSize:      10,
            fontWeight:    700,
            letterSpacing: '0.08em',
            borderRadius:  8,
            padding:       '10px 24px',
            cursor:        generating ? 'not-allowed' : 'pointer',
            width:         '100%',
            marginTop:     6,
            opacity:       generating ? 0.6 : 1,
          }}
        >
          {generating ? 'GENERATING...' : '↗ SHARE WITH IMAGE (NATIVE)'}
        </button>
      )}

      {/* ── Coin reward / error ────────────────────────────────────── */}
      {coinsEarned > 0 && (
        <div style={{
          color:      GREEN,
          fontFamily: MONO_DM,
          fontSize:   12,
          textAlign:  'center',
          marginTop:  10,
          fontWeight: 700,
        }}>
          +{coinsEarned}{bonusEarned > 0 ? ` + ${bonusEarned} bonus` : ''} coins! 🪙
        </div>
      )}

      {bonusReason && (
        <div style={{
          color:         ORANGE,
          fontFamily:    MONO_DM,
          fontSize:      10,
          letterSpacing: '0.06em',
          textAlign:     'center',
          marginTop:     2,
        }}>
          🔥 {bonusReason}
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

      {!isSignedIn ? (
        <div style={{
          color:         '#556677',
          fontFamily:    MONO_DM,
          fontSize:      10,
          letterSpacing: '0.06em',
          textAlign:     'center',
          marginTop:     10,
        }}>
          Sign in to earn +25 coins per share · +500 if a friend signs up
        </div>
      ) : (
        <div style={{
          color:         '#556677',
          fontFamily:    MONO_DM,
          fontSize:      9,
          letterSpacing: '0.05em',
          textAlign:     'center',
          marginTop:     10,
          lineHeight:    1.5,
        }}>
          +25 PER PLATFORM · +50 IF YOU SHARE TO 2+ · +100 AT 5 SHARES TODAY
          {refCode && <><br />JACKPOT: +500 IF SOMEONE SIGNS UP VIA YOUR LINK</>}
        </div>
      )}
    </div>
  );
}
