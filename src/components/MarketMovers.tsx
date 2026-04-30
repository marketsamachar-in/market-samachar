/**
 * MarketMovers — 3-tab widget showing top gainers, top losers, and most active
 * stocks. Powered by the cached Nifty 50 + Next 50 pool — no extra fetches.
 *
 * "Most Active" uses traded volume as a proxy for institutional flow; in
 * large-caps, institutional turnover dominates retail by 3-5x.
 */

import React, { useEffect, useState, type CSSProperties } from "react";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";

interface Stock {
  symbol:        string;
  companyName:   string;
  currentPrice:  number;
  change:        number;
  changePercent: number;
  volume:        number;
  staleData?:    boolean;
}

interface MoversResp {
  ok:           boolean;
  gainers:      Stock[];
  losers:       Stock[];
  mostActive:   Stock[];
  isMarketOpen: boolean;
  lastUpdated:  number;
}

type Tab = "gainers" | "losers" | "active";

const MONO: CSSProperties    = { fontFamily: "'DM Mono', monospace" };
const CARD_BG: CSSProperties = { background: "#0d0d1e", border: "1px solid #1a1a2e" };
const TEXT    = "#e8eaf0";
const SUBTEXT = "#8899aa";
const DIM     = "#556688";
const GREEN   = "#00ff88";
const RED     = "#ff4466";

const REFRESH_MS = 60_000;  // re-poll every minute

function fmtVolume(v: number): string {
  if (v >= 1e7) return `${(v / 1e7).toFixed(2)}Cr`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(2)}L`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(v);
}

function fmtPrice(p: number): string {
  if (p >= 10000) return p.toFixed(0);
  if (p >= 1000)  return p.toFixed(1);
  return p.toFixed(2);
}

const MarketMovers: React.FC = () => {
  const [tab,  setTab]  = useState<Tab>("gainers");
  const [data, setData] = useState<MoversResp | null>(null);
  const [err,  setErr]  = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/stocks/movers?limit=5");
        const j = await r.json() as MoversResp;
        if (cancelled) return;
        if (!j.ok) { setErr("Couldn't load movers"); return; }
        setErr(null);
        setData(j);
      } catch {
        if (!cancelled) setErr("Network error");
      }
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const list: Stock[] =
    tab === "gainers" ? (data?.gainers ?? [])
  : tab === "losers"  ? (data?.losers ?? [])
                      : (data?.mostActive ?? []);

  const TabBtn = ({ id, label, Icon, color }: {
    id: Tab; label: string; Icon: typeof TrendingUp; color: string;
  }) => {
    const active = tab === id;
    return (
      <button
        onClick={() => setTab(id)}
        style={{
          flex: 1,
          background: active ? "#0a0a18" : "transparent",
          color: active ? color : DIM,
          borderBottom: active ? `2px solid ${color}` : "2px solid transparent",
          padding: "8px 4px",
          ...MONO, fontSize: 10, letterSpacing: "0.08em",
          textTransform: "uppercase",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
          cursor: "pointer",
        }}
      >
        <Icon style={{ width: 11, height: 11 }} />
        {label}
      </button>
    );
  };

  return (
    <div style={CARD_BG} className="rounded-lg overflow-hidden">
      {/* Header */}
      <div style={{
        borderBottom: "1px solid #1a1a2e", background: "#07070e",
        padding: "8px 12px", display: "flex", alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Activity style={{ width: 12, height: 12, color: DIM }} />
          <span style={{ ...MONO, color: DIM, fontSize: 10, letterSpacing: "0.12em" }}>
            MARKET MOVERS
          </span>
        </div>
        {data && (
          <span style={{
            ...MONO, fontSize: 9, color: data.isMarketOpen ? GREEN : DIM,
          }}>
            {data.isMarketOpen ? "● LIVE" : "○ CLOSED"}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #1a1a2e" }}>
        <TabBtn id="gainers" label="Gainers"   Icon={TrendingUp}   color={GREEN} />
        <TabBtn id="losers"  label="Losers"    Icon={TrendingDown} color={RED}   />
        <TabBtn id="active"  label="Active"    Icon={Activity}     color={"#3b9eff"} />
      </div>

      {/* List */}
      <div>
        {err && (
          <div style={{ padding: 12, color: SUBTEXT, ...MONO, fontSize: 11, textAlign: "center" }}>
            {err}
          </div>
        )}
        {!err && !data && (
          <div style={{ padding: 12, color: DIM, ...MONO, fontSize: 11, textAlign: "center" }}>
            Loading…
          </div>
        )}
        {!err && data && list.length === 0 && (
          <div style={{ padding: 12, color: DIM, ...MONO, fontSize: 11, textAlign: "center" }}>
            No data yet — cache is warming.
          </div>
        )}
        {list.map((s, i) => {
          const up = s.changePercent >= 0;
          const color = up ? GREEN : RED;
          return (
            <div
              key={s.symbol}
              style={{
                padding: "8px 12px",
                borderBottom: i < list.length - 1 ? "1px solid #1a1a2e" : "none",
                display: "grid",
                gridTemplateColumns: "1fr auto auto",
                gap: 10, alignItems: "center",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ ...MONO, color: TEXT, fontSize: 11, fontWeight: 500 }}>
                  {s.symbol}
                </div>
                <div style={{
                  ...MONO, color: DIM, fontSize: 9, marginTop: 1,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {tab === "active" ? `Vol ${fmtVolume(s.volume)}` : s.companyName}
                </div>
              </div>
              <div style={{ ...MONO, color: TEXT, fontSize: 11, textAlign: "right" }}>
                ₹{fmtPrice(s.currentPrice)}
              </div>
              <div style={{
                ...MONO, color, fontSize: 10, textAlign: "right", minWidth: 56,
              }}>
                {up ? "+" : ""}{s.changePercent.toFixed(2)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MarketMovers;
