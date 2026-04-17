import React, { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NewsItem {
  id: string;
  title: string;
  source: string;
  category: string;
  pubDate: string;
  contentSnippet?: string;
  aiSummary?: string;
  summaryBullets?: string[];
  sentiment?: "bullish" | "bearish" | "neutral";
  impactSectors?: string[];
  keyNumbers?: { value: string; context: string }[];
  translations?: {
    [lang: string]: {
      title: string;
      summary: string;
      bullets: string[];
    };
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: React.CSSProperties = { fontFamily: "'DM Sans', system-ui" };

const CAT_COLORS: Record<string, string> = {
  indian:    "#00ff88",
  companies: "#ffdd3b",
  global:    "#3bffee",
  commodity: "#ff6b3b",
  crypto:    "#b366ff",
  ipo:       "#ff3bff",
  economy:   "#3b9eff",
  banking:   "#3b9eff",
  sebi:      "#ff9f3b",
  rbi:       "#3b9eff",
};

const SENT: Record<string, { cls: string; label: string }> = {
  bullish: { cls: "b", label: "Bullish" },
  bearish: { cls: "r", label: "Bearish" },
  neutral: { cls: "n", label: "Neutral" },
};

const LANG_BUTTONS = [
  { code: "en", label: "EN" },
  { code: "te", label: "TE" },
  { code: "hi", label: "HI" },
  { code: "ta", label: "TA" },
  { code: "mr", label: "MR" },
  { code: "bn", label: "BN" },
];

// ─── Injected CSS (matches sample HTML exactly) ──────────────────────────────

const CSS = `
  /* ─── 2-col web card ─── */
  .w-wrap {
    background: #0d0d1e;
    border: 0.5px solid #1e1e2e;
    border-radius: 10px;
    overflow: hidden;
    display: grid;
    grid-template-columns: 1fr 1fr;
    margin-top: 10px;
    margin-bottom: 4px;
  }
  @media (max-width: 720px) {
    .w-wrap { grid-template-columns: 1fr; }
    .w-left { border-right: none !important; border-bottom: 0.5px solid #1e1e2e; }
  }

  .w-left {
    padding: 20px;
    border-right: 0.5px solid #1e1e2e;
    display: flex;
    flex-direction: column;
  }
  .w-right {
    background: #07070e;
    display: flex;
    flex-direction: column;
  }

  /* AI summary (left) */
  .ai-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    color: #00ff88;
    font-family: 'DM Mono', monospace;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 10px;
  }
  .ai-chip svg { width: 12px; height: 12px; }
  .ai-text {
    font-size: 12.5px;
    color: #aaaabc;
    line-height: 1.68;
    font-family: 'DM Sans', system-ui;
    flex: 1;
  }

  /* Highlights card (right) */
  .hl { display: flex; flex-direction: column; height: 100%; }
  .hl-bar { height: 3px; background: #00ff88; flex-shrink: 0; }
  .hl-body { padding: 16px; display: flex; flex-direction: column; gap: 12px; flex: 1; }
  .hl-hdr { display: flex; align-items: center; gap: 8px; }
  .hl-logo {
    width: 28px; height: 28px; background: #00ff88; border-radius: 5px;
    display: flex; align-items: center; justify-content: center;
    font-size: 15px; font-weight: 700; color: #000; flex-shrink: 0;
    font-family: 'DM Sans', system-ui;
  }
  .hl-brand-name { font-size: 11px; font-weight: 500; color: #e8eaf0; font-family: 'DM Mono', monospace; }
  .hl-domain { font-size: 9px; color: #444455; font-family: 'DM Mono', monospace; }
  .hl-badge {
    margin-left: auto; font-size: 9px; padding: 2px 7px; border-radius: 3px;
    font-family: 'DM Mono', monospace; white-space: nowrap;
  }
  .hl-hed {
    font-size: 12.5px; font-weight: 500; color: #e8eaf0; line-height: 1.4;
    border-left: 2px solid #3b9eff; padding-left: 8px; border-radius: 0;
    font-family: 'DM Sans', system-ui;
  }
  .hl-label {
    font-size: 9px; color: #00ff88; font-family: 'DM Mono', monospace;
    letter-spacing: 0.1em; text-transform: uppercase;
    display: flex; align-items: center; gap: 5px;
  }
  .hl-label::before {
    content: ''; width: 5px; height: 5px; background: #00ff88;
    border-radius: 50%; display: inline-block;
  }
  .hl-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; flex: 1; }
  .hl-cell {
    background: #0d0d1e; border: 0.5px solid #1e1e2e; border-radius: 6px;
    padding: 10px 11px; display: flex; flex-direction: column; justify-content: center;
    min-height: 62px;
  }
  .hl-num { font-size: 22px; font-weight: 500; color: #00ff88; font-family: 'DM Mono', monospace; line-height: 1; }
  .hl-num-lbl { font-size: 9.5px; color: #555566; margin-top: 4px; line-height: 1.3; }
  .hl-bul { display: flex; gap: 6px; align-items: flex-start; }
  .hl-dot {
    width: 5px; height: 5px; background: #00ff88; border-radius: 50%;
    opacity: 0.55; margin-top: 4px; flex-shrink: 0;
  }
  .hl-bul-txt { font-size: 10.5px; color: #888899; line-height: 1.4; font-family: 'DM Sans', system-ui; }
  .hl-foot {
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    border-top: 0.5px solid #1e1e2e; padding-top: 10px;
  }
  .hl-sent {
    font-size: 9px; padding: 3px 9px; border-radius: 20px;
    font-family: 'DM Mono', monospace;
  }
  .hl-sent.b { background: rgba(0,255,136,0.1); color: #00ff88; border: 0.5px solid rgba(0,255,136,0.25); }
  .hl-sent.r { background: rgba(255,68,102,0.1); color: #ff4466; border: 0.5px solid rgba(255,68,102,0.25); }
  .hl-sent.n { background: rgba(59,158,255,0.1); color: #3b9eff; border: 0.5px solid rgba(59,158,255,0.25); }
  .hl-sec {
    font-size: 9px; padding: 2px 7px; border-radius: 3px;
    background: #111122; color: #444455; border: 0.5px solid #1e1e2e;
    font-family: 'DM Mono', monospace;
  }
  .hl-src { margin-left: auto; font-size: 9px; color: #2a2a3a; font-family: 'DM Mono', monospace; }

  /* Language row */
  .ai-lang-row {
    display: flex; gap: 4px; flex-wrap: wrap;
    margin-top: auto; padding-top: 12px;
  }
  .ai-lang-btn {
    font-size: 9px; padding: 3px 8px; border-radius: 4px;
    border: 0.5px solid #1e1e2e; background: transparent;
    color: #444455; cursor: pointer; font-family: 'DM Mono', monospace;
    transition: all 0.12s;
  }
  .ai-lang-btn:hover { border-color: rgba(0,255,136,0.4); color: #00ff88; }
  .ai-lang-btn.active {
    border-color: rgba(0,255,136,0.5); color: #00ff88;
    background: rgba(0,255,136,0.07);
  }
`;

// ─── Component ────────────────────────────────────────────────────────────────

export const AiSummaryCard: React.FC<{ item: NewsItem }> = ({ item }) => {
  const [activeLang, setActiveLang] = useState("en");

  if (!item.aiSummary) return null;

  const catColor   = CAT_COLORS[item.category?.toLowerCase()] ?? "#888899";
  const catLabel   = (item.category ?? "news").charAt(0).toUpperCase() + (item.category ?? "news").slice(1);
  const sentKey    = item.sentiment ?? "neutral";
  const sent       = SENT[sentKey] ?? SENT.neutral;
  const keyNumbers = item.keyNumbers ?? [];
  const bullets    = item.summaryBullets ?? [];
  const sectors    = item.impactSectors ?? [];
  const availLangs = Object.keys(item.translations ?? {});

  // Translated content
  const tr             = activeLang !== "en" ? item.translations?.[activeLang] : undefined;
  const displaySummary = tr?.summary  ?? item.aiSummary;
  const displayBullets = tr?.bullets  ?? bullets;

  // Format source + time
  let timeStr = "";
  try {
    const d = new Date(item.pubDate);
    timeStr = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {}
  const srcShort = item.source?.replace(/\.com|\.in|www\./g, "").split(/\s/)[0] ?? "";

  // Build 2x2 grid: key numbers fill top, bullets fill rest
  const gridCells: Array<
    | { type: "kn"; value: string; context: string }
    | { type: "bullet"; text: string }
  > = [];
  for (const kn of keyNumbers.slice(0, 2)) {
    gridCells.push({ type: "kn", value: kn.value, context: kn.context });
  }
  let bi = 0;
  while (gridCells.length < 4 && bi < displayBullets.length) {
    gridCells.push({ type: "bullet", text: displayBullets[bi] });
    bi++;
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="w-wrap">

        {/* ── Left: AI Summary ──────────────────────────────────────── */}
        <div className="w-left">
          <div className="ai-chip">
            <svg viewBox="0 0 14 14" fill="none">
              <polyline
                points="1,8 4,4 7,9 10,5 13,7"
                stroke="#00ff88" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round"
              />
            </svg>
            AI Summary
          </div>
          <div className="ai-text">{displaySummary}</div>

          {/* Language tabs */}
          {availLangs.length > 0 && (
            <div className="ai-lang-row">
              {LANG_BUTTONS.map(({ code, label }) => {
                if (code !== "en" && !availLangs.includes(code)) return null;
                return (
                  <button
                    key={code}
                    onClick={() => setActiveLang(code)}
                    className={`ai-lang-btn${activeLang === code ? " active" : ""}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Right: Highlights Card ────────────────────────────────── */}
        <div className="w-right">
          <div className="hl">
            <div className="hl-bar" />
            <div className="hl-body">

              {/* Logo row */}
              <div className="hl-hdr">
                <div className="hl-logo">M</div>
                <div>
                  <div className="hl-brand-name">Market Samachar</div>
                  <div className="hl-domain">marketsamachar.in</div>
                </div>
                <span
                  className="hl-badge"
                  style={{
                    background: catColor + "1f",
                    color: catColor,
                    border: `0.5px solid ${catColor}33`,
                  }}
                >
                  {catLabel}
                </span>
              </div>

              {/* Headline */}
              <div className="hl-hed">{tr?.title ?? item.title}</div>

              {/* KEY HIGHLIGHTS */}
              {gridCells.length > 0 && (
                <>
                  <div className="hl-label">Key Highlights</div>
                  <div className="hl-grid">
                    {gridCells.map((cell, i) =>
                      cell.type === "kn" ? (
                        <div key={i} className="hl-cell">
                          <div className="hl-num">{cell.value}</div>
                          <div className="hl-num-lbl">{cell.context}</div>
                        </div>
                      ) : (
                        <div key={i} className="hl-cell">
                          <div className="hl-bul">
                            <div className="hl-dot" />
                            <div className="hl-bul-txt">{cell.text}</div>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </>
              )}

              {/* Footer */}
              <div className="hl-foot">
                <span className={`hl-sent ${sent.cls}`}>{sent.label}</span>
                {sectors.slice(0, 3).map(sec => (
                  <span key={sec} className="hl-sec">{sec}</span>
                ))}
                <span className="hl-src">
                  {srcShort}{timeStr ? ` \u00b7 ${timeStr}` : ""}
                </span>
              </div>

            </div>
          </div>
        </div>

      </div>
    </>
  );
};

export default AiSummaryCard;
