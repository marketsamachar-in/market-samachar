/**
 * PULSE — Bull/Bear News Swiper.
 * One news card at a time. Tap BULL/BEAR (or swipe) → +5 coins instant.
 * Auto-resolution after 24h pays a +20 bonus if the prediction was right.
 */

import React, { useEffect, useState, useRef, type CSSProperties } from "react";
import { TrendingUp, TrendingDown, Coins, Flame, RefreshCw, ExternalLink } from "lucide-react";

/* ─── Tokens ─── */
const BG     = "#07070e";
const CARD   = "#0d0d1e";
const BORDER = "#1e1e2e";
const GREEN  = "#00ff88";
const RED    = "#ff4466";
const TEXT   = "#e8eaf0";
const MUTED  = "#888899";
const DIM    = "#444455";
const MONO: CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: CSSProperties = { fontFamily: "'DM Sans', sans-serif" };

/* ─── Types ─── */
interface Card {
  articleId: string;
  title:     string;
  source:    string;
  category:  string;
  snippet:   string;
  fetchedAt: number;
  symbol:    string | null;
}
interface Stats {
  swipesToday:  number;
  dailyCap:     number;
  totalSwipes:  number;
  resolved:     number;
  correct:      number;
  accuracyPct:  number | null;
  bonusTotal:   number;
}
interface Props { authToken?: string; }

const CATEGORY_COLORS: Record<string, string> = {
  indian:    "#00ff88", companies: "#ffdd3b", global: "#3bffee",
  commodity: "#ff6b3b", crypto:    "#b366ff", ipo:    "#ff3bff",
  economy:   "#3b9eff", banking:   "#3b9eff", sebi:   "#ff9f3b", rbi: "#3b9eff",
};
const catColor = (c: string) => CATEGORY_COLORS[c] ?? GREEN;

function fmtAge(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60)        return `${s}s ago`;
  if (s < 3600)      return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400)    return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

const Pulse: React.FC<Props> = ({ authToken }) => {
  const [cards, setCards] = useState<Card[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState<{ kind: "bull" | "bear"; coins: number } | null>(null);
  const [coinsBalance, setCoinsBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const swipingRef = useRef(false);

  const headers = (): HeadersInit =>
    authToken ? { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` }
              : { "Content-Type": "application/json" };

  const loadFeed = async () => {
    if (!authToken) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const [feedRes, statsRes] = await Promise.all([
        fetch("/api/pulse/feed?limit=30", { headers: headers() }),
        fetch("/api/pulse/stats",          { headers: headers() }),
      ]);
      const feed = await feedRes.json();
      const st   = await statsRes.json();
      if (feed.ok)  setCards(feed.cards);
      if (st.ok)    setStats(st);
      if (!feed.ok) setError(feed.error ?? "Failed to load");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadFeed(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [authToken]);

  const top = cards[0];

  const handleSwipe = async (direction: "BULL" | "BEAR") => {
    if (!top || !authToken || submitting || swipingRef.current) return;
    swipingRef.current = true;
    setSubmitting(true);
    try {
      const res = await fetch("/api/pulse/swipe", {
        method: "POST", headers: headers(),
        body: JSON.stringify({ articleId: top.articleId, direction }),
      });
      const data = await res.json();
      if (data.ok) {
        if (data.coinsAwarded > 0) {
          setFlash({ kind: direction === "BULL" ? "bull" : "bear", coins: data.coinsAwarded });
          setTimeout(() => setFlash(null), 700);
        }
        if (typeof data.balance === "number") setCoinsBalance(data.balance);
        if (stats) {
          setStats({ ...stats, swipesToday: stats.swipesToday + 1, totalSwipes: stats.totalSwipes + 1 });
        }
      }
      // Always pop the card (even on duplicate-swipe error 409)
      setCards((c) => c.slice(1));

      // Pre-fetch more when we get low
      if (cards.length <= 5) loadFeed();
    } catch {
      setError("Swipe failed — try again");
    } finally {
      swipingRef.current = false;
      setSubmitting(false);
    }
  };

  if (!authToken) {
    return (
      <div style={pageWrap}>
        <h1 style={titleStyle}>📰 PULSE</h1>
        <p style={subtitleStyle}>Sign in to play.</p>
      </div>
    );
  }

  return (
    <div style={pageWrap}>
      <style>{INJ_CSS}</style>

      {/* Header */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 16 }}>
        <h1 style={titleStyle}>📰 PULSE</h1>
        <p style={subtitleStyle}>Swipe BULL or BEAR · +5 coins per swipe · +20 bonus if right after 24h</p>
      </div>

      {/* Stats bar */}
      {stats && (
        <div style={statsBarStyle}>
          <Stat icon={<Coins size={13} />} label="Today"    val={`${stats.swipesToday} / ${stats.dailyCap}`} />
          <Stat icon={<Flame size={13} />} label="Bonus"    val={`+${stats.bonusTotal}`} />
          <Stat label="Accuracy" val={stats.accuracyPct == null ? "—" : `${stats.accuracyPct}%`} />
          <Stat label="Total"    val={String(stats.totalSwipes)} />
        </div>
      )}

      {/* Coin flash */}
      {flash && (
        <div className={`pulse-flash pulse-flash-${flash.kind}`}>+{flash.coins} 🪙</div>
      )}

      {/* Card stack */}
      <div style={cardWrapStyle}>
        {loading && <div style={emptyState}>Loading…</div>}
        {!loading && error && <div style={{ ...emptyState, color: RED }}>{error}</div>}
        {!loading && !error && !top && (
          <div style={emptyState}>
            <div style={{ fontSize: 30, marginBottom: 6 }}>🎉</div>
            <div style={{ ...MONO, fontSize: 11, color: MUTED, letterSpacing: "0.08em" }}>
              ALL CAUGHT UP
            </div>
            <button onClick={loadFeed} className="pulse-refresh">
              <RefreshCw size={13} /> RELOAD
            </button>
          </div>
        )}

        {top && (
          <>
            {/* Background card preview */}
            {cards[1] && (
              <div style={{ ...cardStyle, transform: "scale(0.96) translateY(8px)", opacity: 0.4, pointerEvents: "none" }}>
                <div style={{ height: "100%" }} />
              </div>
            )}

            {/* Top card */}
            <div key={top.articleId} className="pulse-card" style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{
                  background: catColor(top.category) + "22",
                  color: catColor(top.category),
                  ...MONO, fontSize: 9, letterSpacing: "0.1em",
                  padding: "3px 8px", borderRadius: 3, textTransform: "uppercase",
                }}>
                  {top.category}
                </span>
                {top.symbol && (
                  <span style={{
                    background: "#0a1a10", border: `1px solid ${GREEN}40`, color: GREEN,
                    ...MONO, fontSize: 10, letterSpacing: "0.06em",
                    padding: "3px 8px", borderRadius: 3,
                  }}>
                    ${top.symbol}
                  </span>
                )}
                <span style={{ marginLeft: "auto", color: DIM, ...MONO, fontSize: 10 }}>
                  {fmtAge(top.fetchedAt)}
                </span>
              </div>

              <h2 style={{
                ...SANS, color: TEXT, fontSize: 18, fontWeight: 600,
                lineHeight: 1.35, marginBottom: 14, flex: "0 0 auto",
              }}>
                {top.title}
              </h2>

              {top.snippet && (
                <p style={{ ...SANS, color: MUTED, fontSize: 13, lineHeight: 1.5, flex: 1, overflow: "hidden" }}>
                  {top.snippet.slice(0, 220)}{top.snippet.length > 220 ? "…" : ""}
                </p>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                <span style={{ color: DIM, ...MONO, fontSize: 9, letterSpacing: "0.08em" }}>
                  {top.source.toUpperCase()}
                </span>
                {!top.symbol && (
                  <span style={{ color: DIM, ...MONO, fontSize: 9 }}>
                    no symbol — practice only
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Action buttons */}
      <div style={btnRowStyle}>
        <button
          onClick={() => handleSwipe("BEAR")}
          disabled={!top || submitting}
          className="pulse-btn pulse-btn-bear"
        >
          <TrendingDown size={22} />
          <span>BEARISH</span>
        </button>
        <button
          onClick={() => handleSwipe("BULL")}
          disabled={!top || submitting}
          className="pulse-btn pulse-btn-bull"
        >
          <TrendingUp size={22} />
          <span>BULLISH</span>
        </button>
      </div>

      {coinsBalance != null && (
        <div style={{ textAlign: "center", color: MUTED, ...MONO, fontSize: 11, marginTop: 12, letterSpacing: "0.06em" }}>
          BALANCE · <span style={{ color: GREEN }}>{coinsBalance.toLocaleString("en-IN")} 🪙</span>
        </div>
      )}
    </div>
  );
};

/* ─── Tiny stat chip ─── */
const Stat: React.FC<{ icon?: React.ReactNode; label: string; val: string }> = ({ icon, label, val }) => (
  <div style={{
    flex: 1, background: CARD, border: `1px solid ${BORDER}`,
    borderRadius: 8, padding: "8px 10px",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
  }}>
    <div style={{ color: DIM, ...MONO, fontSize: 9, letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 3 }}>
      {icon}{label.toUpperCase()}
    </div>
    <div style={{ color: TEXT, ...MONO, fontSize: 13, fontWeight: 600 }}>{val}</div>
  </div>
);

/* ─── Styles ─── */
const pageWrap: CSSProperties = {
  minHeight: "calc(100vh - 112px)", padding: "16px 14px 80px",
  background: BG, ...SANS, maxWidth: 480, margin: "0 auto",
  display: "flex", flexDirection: "column",
};
const titleStyle: CSSProperties = {
  ...MONO, color: TEXT, fontSize: 22, fontWeight: 700,
  letterSpacing: "0.1em", margin: 0,
};
const subtitleStyle: CSSProperties = {
  ...SANS, color: MUTED, fontSize: 12, textAlign: "center", marginTop: 4, marginBottom: 0,
};
const statsBarStyle: CSSProperties = { display: "flex", gap: 6, marginBottom: 16 };
const cardWrapStyle: CSSProperties = {
  position: "relative", flex: 1, minHeight: 320, marginBottom: 16,
};
const cardStyle: CSSProperties = {
  position: "absolute", inset: 0, background: CARD, border: `1px solid ${BORDER}`,
  borderRadius: 14, padding: 18, display: "flex", flexDirection: "column",
  boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
};
const emptyState: CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  height: "100%", color: MUTED, ...SANS, fontSize: 13,
};
const btnRowStyle: CSSProperties = { display: "flex", gap: 10 };

const INJ_CSS = `
.pulse-card { animation: pulse-pop 0.25s ease-out; }
@keyframes pulse-pop { from { transform: scale(0.96); opacity: 0.5; } to { transform: scale(1); opacity: 1; } }

.pulse-btn {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; padding: 16px 0; border-radius: 12; cursor: pointer; transition: all 0.15s;
  font-family: 'DM Mono', monospace; font-size: 12px; font-weight: 700; letter-spacing: 0.08em;
}
.pulse-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.pulse-btn-bear { background: rgba(255,68,102,0.08); border: 1px solid ${RED}40; color: ${RED}; }
.pulse-btn-bear:not(:disabled):hover { background: rgba(255,68,102,0.15); border-color: ${RED}; transform: translateY(-1px); }
.pulse-btn-bull { background: rgba(0,255,136,0.08); border: 1px solid ${GREEN}40; color: ${GREEN}; }
.pulse-btn-bull:not(:disabled):hover { background: rgba(0,255,136,0.15); border-color: ${GREEN}; transform: translateY(-1px); }

.pulse-flash {
  position: fixed; top: 30%; left: 50%; transform: translateX(-50%);
  font-family: 'DM Mono', monospace; font-size: 36px; font-weight: 700;
  pointer-events: none; z-index: 1000;
  animation: pulse-flash-anim 0.7s ease-out forwards;
}
.pulse-flash-bull { color: ${GREEN}; text-shadow: 0 0 16px ${GREEN}; }
.pulse-flash-bear { color: ${RED};   text-shadow: 0 0 16px ${RED}; }
@keyframes pulse-flash-anim {
  0%   { opacity: 0; transform: translate(-50%, 10px) scale(0.7); }
  20%  { opacity: 1; transform: translate(-50%, 0) scale(1.1); }
  100% { opacity: 0; transform: translate(-50%, -30px) scale(1); }
}

.pulse-refresh {
  margin-top: 12px; display: inline-flex; align-items: center; gap: 6px;
  background: transparent; border: 1px solid ${BORDER}; color: ${MUTED};
  font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.08em;
  padding: 8px 14px; border-radius: 6px; cursor: pointer; transition: all 0.15s;
}
.pulse-refresh:hover { color: ${GREEN}; border-color: ${GREEN}40; }
`;

export default Pulse;
