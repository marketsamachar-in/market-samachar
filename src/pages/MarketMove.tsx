/**
 * MarketMove — "what's moving in the market right now" terminal.
 *
 * 6 tabs: Gainers · Losers · Active · FII/DII · MTF · News Buzz.
 * Replaces the old Combo Card slot in the bottom nav.
 */

import React, { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  TrendingUp, TrendingDown, Activity, Building2, Wallet, Newspaper,
} from "lucide-react";

// ─── Theme tokens ────────────────────────────────────────────────────────────
const MONO: CSSProperties     = { fontFamily: "'DM Mono', monospace" };
const SANS: CSSProperties     = { fontFamily: "'DM Sans', sans-serif" };
const BG                       = "#07070e";
const CARD_BG                  = "#0d0d1e";
const BORDER                   = "#1a1a2e";
const TEXT                     = "#e8eaf0";
const SUBTEXT                  = "#8899aa";
const DIM                      = "#556688";
const GREEN                    = "#00ff88";
const RED                      = "#ff4466";
const BLUE                     = "#3b9eff";
const ORANGE                   = "#ff9f3b";
const PURPLE                   = "#b366ff";

// ─── Types matching backend ──────────────────────────────────────────────────
interface Stock {
  symbol: string;
  companyName: string;
  currentPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  staleData?: boolean;
}
interface MoversResp {
  ok: boolean;
  gainers: Stock[];
  losers: Stock[];
  mostActive: Stock[];
  isMarketOpen: boolean;
  lastUpdated: number;
}
interface FiiDiiRow {
  date: string;
  fiiCash: number;
  diiCash: number;
  fiiFno: number;
  diiFno: number;
}
interface MtfRow {
  symbol: string;
  name: string;
  currentPrice: number;
  changePercent: number;
}
interface BuzzRow {
  symbol: string;
  mentions: number;
  headlines: string[];
}

type Tab = "gainers" | "losers" | "active" | "fiidii" | "mtf" | "buzz";

const TABS: ReadonlyArray<{ id: Tab; label: string; icon: typeof TrendingUp; color: string }> = [
  { id: "gainers", label: "GAINERS",  icon: TrendingUp,   color: GREEN  },
  { id: "losers",  label: "LOSERS",   icon: TrendingDown, color: RED    },
  { id: "active",  label: "ACTIVE",   icon: Activity,     color: BLUE   },
  { id: "fiidii",  label: "FII / DII",icon: Building2,    color: ORANGE },
  { id: "mtf",     label: "MTF",      icon: Wallet,       color: PURPLE },
  { id: "buzz",    label: "BUZZ",     icon: Newspaper,    color: GREEN  },
];

// ─── Format helpers ──────────────────────────────────────────────────────────
function fmtPrice(p: number): string {
  if (p >= 10000) return p.toFixed(0);
  if (p >= 1000)  return p.toFixed(1);
  return p.toFixed(2);
}
function fmtVolume(v: number): string {
  if (v >= 1e7) return `${(v / 1e7).toFixed(2)}Cr`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(2)}L`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(v);
}
function fmtCrore(v: number): string {
  // FII/DII numbers come in ₹ crore.
  const sign = v >= 0 ? "+" : "−";
  return `${sign}₹${Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr`;
}
function fmtDate(iso: string): string {
  // Accepts "DD-Mon-YYYY" or "YYYY-MM-DD" — return short Indian-style
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y.slice(2)}`;
  }
  return iso;
}

// ─── Page ────────────────────────────────────────────────────────────────────

const MarketMove: React.FC = () => {
  const [tab, setTab] = useState<Tab>("gainers");
  const [movers, setMovers]   = useState<MoversResp | null>(null);
  const [fiiDii, setFiiDii]   = useState<FiiDiiRow[] | null>(null);
  const [mtf, setMtf]         = useState<MtfRow[] | null>(null);
  const [buzz, setBuzz]       = useState<BuzzRow[] | null>(null);
  const [err, setErr]         = useState<string | null>(null);

  // Initial load — pull every dataset in parallel so tab-switches feel instant.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [mvR, fiiR, mtfR, buzzR] = await Promise.all([
          fetch("/api/market-move/gainers?limit=20").then((r) => r.json()),
          fetch("/api/market-move/fii-dii?days=15").then((r) => r.json()),
          fetch("/api/market-move/mtf?limit=30").then((r) => r.json()),
          fetch("/api/market-move/news-buzz?limit=25").then((r) => r.json()),
        ]);
        if (cancelled) return;
        setMovers(mvR);
        setFiiDii(fiiR.history ?? []);
        setMtf(mtfR.stocks ?? []);
        setBuzz(buzzR.buzz ?? []);
        setErr(null);
      } catch {
        if (!cancelled) setErr("Couldn't load market data");
      }
    };
    load();
    const id = setInterval(load, 60_000); // poll every minute
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div style={{ background: BG, minHeight: "100vh", paddingBottom: 80 }}>
      {/* ── Header ────────────────────────────────────────────────── */}
      <Header isOpen={movers?.isMarketOpen ?? false} lastUpdated={movers?.lastUpdated ?? 0} />

      {/* ── Tab strip ─────────────────────────────────────────────── */}
      <div style={{
        display: "flex", overflowX: "auto", gap: 0,
        borderBottom: `1px solid ${BORDER}`, background: CARD_BG,
        position: "sticky", top: 0, zIndex: 10,
      }}>
        {TABS.map((t) => {
          const active = t.id === tab;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: "1 0 auto", minWidth: 88, padding: "10px 12px",
                background: active ? "#0a0a18" : "transparent",
                color:      active ? t.color : DIM,
                border: "none", borderBottom: `2px solid ${active ? t.color : "transparent"}`,
                cursor: "pointer",
                ...MONO, fontSize: 10, letterSpacing: "0.1em",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              <Icon style={{ width: 12, height: 12 }} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Body ──────────────────────────────────────────────────── */}
      <div style={{ padding: 12 }}>
        {err && <div style={{ ...MONO, color: RED, padding: 12 }}>{err}</div>}

        {tab === "gainers" && <StockList rows={movers?.gainers ?? []} kind="pct" />}
        {tab === "losers"  && <StockList rows={movers?.losers ?? []}  kind="pct" />}
        {tab === "active"  && <StockList rows={movers?.mostActive ?? []} kind="vol" />}
        {tab === "fiidii"  && <FiiDiiPanel rows={fiiDii ?? []} />}
        {tab === "mtf"     && <MtfList rows={mtf ?? []} />}
        {tab === "buzz"    && <BuzzList rows={buzz ?? []} />}
      </div>

      {/* ── Disclaimer ────────────────────────────────────────────── */}
      <div style={{
        ...MONO, fontSize: 9, color: DIM, padding: "12px 16px",
        textAlign: "center", lineHeight: 1.5,
      }}>
        Data delayed up to 15 min · For information only · Not investment advice
      </div>
    </div>
  );
};

// ─── Header ──────────────────────────────────────────────────────────────────

const Header: React.FC<{ isOpen: boolean; lastUpdated: number }> = ({ isOpen, lastUpdated }) => {
  const ago = useMemo(() => {
    if (!lastUpdated) return "—";
    const s = Math.floor((Date.now() - lastUpdated) / 1000);
    if (s < 60) return `${s}s ago`;
    return `${Math.floor(s / 60)}m ago`;
  }, [lastUpdated]);

  return (
    <div style={{
      padding: "16px 16px 12px", borderBottom: `1px solid ${BORDER}`,
      background: CARD_BG,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ ...SANS, color: TEXT, fontSize: 18, fontWeight: 500, lineHeight: 1.2 }}>
            Market Move
          </div>
          <div style={{ ...MONO, color: DIM, fontSize: 10, letterSpacing: "0.08em", marginTop: 4 }}>
            LIVE INDIAN MARKET ACTIVITY
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ ...MONO, fontSize: 10, color: isOpen ? GREEN : DIM }}>
            {isOpen ? "● MARKET OPEN" : "○ MARKET CLOSED"}
          </div>
          <div style={{ ...MONO, fontSize: 9, color: DIM, marginTop: 2 }}>
            Updated {ago}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Reusable stock-row list ─────────────────────────────────────────────────

const StockList: React.FC<{ rows: Stock[]; kind: "pct" | "vol" }> = ({ rows, kind }) => {
  if (!rows.length) return <Empty />;
  return (
    <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
      {rows.map((s, i) => {
        const up = s.changePercent >= 0;
        const color = up ? GREEN : RED;
        return (
          <div
            key={s.symbol}
            style={{
              padding: "12px 14px",
              borderBottom: i < rows.length - 1 ? `1px solid ${BORDER}` : "none",
              display: "grid", gridTemplateColumns: "32px 1fr auto auto",
              gap: 10, alignItems: "center",
            }}
          >
            <div style={{ ...MONO, color: DIM, fontSize: 11 }}>{i + 1}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ ...MONO, color: TEXT, fontSize: 12, fontWeight: 500 }}>{s.symbol}</div>
              <div style={{
                ...MONO, color: DIM, fontSize: 10, marginTop: 2,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {kind === "vol" ? `Vol ${fmtVolume(s.volume)}` : s.companyName}
              </div>
            </div>
            <div style={{ ...MONO, color: TEXT, fontSize: 12, textAlign: "right" }}>
              ₹{fmtPrice(s.currentPrice)}
            </div>
            <div style={{
              ...MONO, color, fontSize: 11, textAlign: "right", minWidth: 64,
            }}>
              {up ? "+" : ""}{s.changePercent.toFixed(2)}%
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── FII / DII panel ─────────────────────────────────────────────────────────

const FiiDiiPanel: React.FC<{ rows: FiiDiiRow[] }> = ({ rows }) => {
  if (!rows.length) {
    return (
      <div style={{
        ...MONO, color: DIM, fontSize: 11, textAlign: "center", padding: 24,
        background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 8,
      }}>
        FII/DII data is published after 18:00 IST on trading days.<br/>
        Check back this evening.
      </div>
    );
  }
  // Latest = first row (sorted DESC by backend)
  const latest = rows[0];
  return (
    <div>
      {/* Headline cards for today */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        <FiiDiiCard label="FII NET" value={latest.fiiCash} accent={ORANGE} />
        <FiiDiiCard label="DII NET" value={latest.diiCash} accent={BLUE}   />
      </div>

      <div style={{
        ...MONO, color: DIM, fontSize: 9, letterSpacing: "0.1em",
        padding: "0 4px 6px",
      }}>
        LAST {rows.length} TRADING DAYS · CASH SEGMENT (₹ CRORE)
      </div>

      <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
        {/* Header row */}
        <div style={{
          padding: "10px 12px", borderBottom: `1px solid ${BORDER}`,
          display: "grid", gridTemplateColumns: "1fr auto auto",
          gap: 12, ...MONO, fontSize: 9, color: DIM, letterSpacing: "0.08em",
        }}>
          <div>DATE</div>
          <div style={{ textAlign: "right", color: ORANGE }}>FII</div>
          <div style={{ textAlign: "right", color: BLUE }}>DII</div>
        </div>
        {rows.map((r, i) => (
          <div
            key={r.date}
            style={{
              padding: "10px 12px",
              borderBottom: i < rows.length - 1 ? `1px solid ${BORDER}` : "none",
              display: "grid", gridTemplateColumns: "1fr auto auto",
              gap: 12, alignItems: "center",
            }}
          >
            <div style={{ ...MONO, color: TEXT, fontSize: 11 }}>{fmtDate(r.date)}</div>
            <div style={{
              ...MONO, color: r.fiiCash >= 0 ? GREEN : RED, fontSize: 11, textAlign: "right",
            }}>{fmtCrore(r.fiiCash)}</div>
            <div style={{
              ...MONO, color: r.diiCash >= 0 ? GREEN : RED, fontSize: 11, textAlign: "right",
            }}>{fmtCrore(r.diiCash)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const FiiDiiCard: React.FC<{ label: string; value: number; accent: string }> = ({ label, value, accent }) => {
  const pos = value >= 0;
  return (
    <div style={{
      background: CARD_BG, border: `1px solid ${BORDER}`,
      borderLeft: `2px solid ${accent}`, borderRadius: 8, padding: 12,
    }}>
      <div style={{ ...MONO, fontSize: 9, color: DIM, letterSpacing: "0.1em" }}>{label}</div>
      <div style={{
        ...MONO, fontSize: 20, color: pos ? GREEN : RED, marginTop: 4, fontWeight: 500,
      }}>
        {fmtCrore(value)}
      </div>
      <div style={{ ...MONO, fontSize: 9, color: DIM, marginTop: 4 }}>
        {pos ? "Net buyer" : "Net seller"} · cash segment
      </div>
    </div>
  );
};

// ─── MTF list ────────────────────────────────────────────────────────────────

const MtfList: React.FC<{ rows: MtfRow[] }> = ({ rows }) => {
  if (!rows.length) return <Empty />;
  return (
    <>
      <div style={{
        ...MONO, color: DIM, fontSize: 9, letterSpacing: "0.1em",
        padding: "0 4px 8px",
      }}>
        NSE-APPROVED MARGIN TRADING FACILITY STOCKS
      </div>
      <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
        {rows.map((s, i) => {
          const up = s.changePercent >= 0;
          const color = up ? GREEN : RED;
          return (
            <div
              key={s.symbol}
              style={{
                padding: "12px 14px",
                borderBottom: i < rows.length - 1 ? `1px solid ${BORDER}` : "none",
                display: "grid", gridTemplateColumns: "1fr auto auto",
                gap: 10, alignItems: "center",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ ...MONO, color: TEXT, fontSize: 12, fontWeight: 500 }}>{s.symbol}</div>
                <div style={{
                  ...MONO, color: DIM, fontSize: 10, marginTop: 2,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>{s.name}</div>
              </div>
              <div style={{ ...MONO, color: TEXT, fontSize: 12, textAlign: "right" }}>
                {s.currentPrice > 0 ? `₹${fmtPrice(s.currentPrice)}` : "—"}
              </div>
              <div style={{
                ...MONO, color, fontSize: 11, textAlign: "right", minWidth: 64,
              }}>
                {s.currentPrice > 0
                  ? `${up ? "+" : ""}${s.changePercent.toFixed(2)}%`
                  : "—"}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

// ─── News Buzz ───────────────────────────────────────────────────────────────

const BuzzList: React.FC<{ rows: BuzzRow[] }> = ({ rows }) => {
  if (!rows.length) {
    return (
      <div style={{
        ...MONO, color: DIM, fontSize: 11, textAlign: "center", padding: 24,
        background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 8,
      }}>
        No stock mentions in news yet today.
      </div>
    );
  }
  const max = rows[0]?.mentions || 1;
  return (
    <>
      <div style={{
        ...MONO, color: DIM, fontSize: 9, letterSpacing: "0.1em",
        padding: "0 4px 8px",
      }}>
        STOCKS MOST MENTIONED IN NEWS (LAST 24H)
      </div>
      <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
        {rows.map((r, i) => {
          const widthPct = (r.mentions / max) * 100;
          return (
            <div
              key={r.symbol}
              style={{
                padding: "12px 14px",
                borderBottom: i < rows.length - 1 ? `1px solid ${BORDER}` : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ ...MONO, color: DIM, fontSize: 11, width: 20 }}>{i + 1}</div>
                <div style={{ ...MONO, color: TEXT, fontSize: 12, fontWeight: 500, flex: 1 }}>
                  {r.symbol}
                </div>
                <div style={{ ...MONO, color: GREEN, fontSize: 11 }}>
                  {r.mentions} {r.mentions === 1 ? "mention" : "mentions"}
                </div>
              </div>
              {/* Bar */}
              <div style={{
                marginTop: 6, marginLeft: 30, height: 3, background: "#1a1a2e",
                borderRadius: 2, overflow: "hidden",
              }}>
                <div style={{
                  width: `${widthPct}%`, height: "100%", background: GREEN,
                }} />
              </div>
              {/* Latest headline */}
              {r.headlines[0] && (
                <div style={{
                  marginTop: 8, marginLeft: 30, ...SANS, fontSize: 11, color: SUBTEXT,
                  lineHeight: 1.4,
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}>
                  {r.headlines[0]}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
};

// ─── Empty ───────────────────────────────────────────────────────────────────

const Empty: React.FC = () => (
  <div style={{
    ...MONO, color: DIM, fontSize: 11, textAlign: "center", padding: 24,
    background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 8,
  }}>
    Loading… data warming up.
  </div>
);

export default MarketMove;
