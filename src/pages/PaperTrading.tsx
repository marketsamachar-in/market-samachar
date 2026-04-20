/**
 * PaperTrading — Bloomberg Terminal-style virtual trading interface.
 * Zerodha Kite meets a terminal game. Dense, alive, premium.
 * Trade Indian stocks with virtual coins (1 coin = ₹1).
 */

import React, {
  useState, useEffect, useCallback, useRef, type CSSProperties,
} from 'react';
import {
  RefreshCw, X, Trophy, Clock, History, BarChart2, Star,
  Wallet, AlertCircle, CheckCircle, Search, ShoppingCart,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

/* ─── Design tokens ──────────────────────────────────────────────────────── */
const BG     = '#07070e';
const CARD   = '#0d0d1e';
const BORDER = '#1e1e2e';
const GREEN  = '#00ff88';
const RED    = '#ff4444';
const TEXT   = '#e8eaf0';
const MUTED  = '#888899';
const DIM    = '#444455';
const MONO: CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: CSSProperties = { fontFamily: "'DM Sans', sans-serif" };

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface StockPrice {
  symbol: string; companyName: string;
  currentPrice: number; change: number; changePercent: number;
  high: number; low: number; volume: number;
  lastUpdated: number; isMarketOpen: boolean; staleData?: boolean;
}
interface PopularResponse { ok: boolean; isMarketOpen: boolean; stocks: StockPrice[]; }
interface PortfolioHolding {
  symbol: string; companyName: string; quantity: number;
  avgBuyPrice: number; currentPrice: number;
  investedCoins: number; currentValue: number;
  pnlCoins: number; pnlPercent: number; isStalePrice: boolean;
}
interface Portfolio {
  userId: string; virtualBalance: number; totalInvested: number;
  currentValue: number; totalPnlCoins: number; totalPnlPercent: number;
  holdings: PortfolioHolding[];
}
interface TradeOrder {
  id: number; symbol: string; companyName: string;
  orderType: 'BUY' | 'SELL';
  quantity: number; price: number; total: number; executedAt: number;
}
interface LeaderboardEntry {
  rank: number; userId: string; displayName: string;
  isCurrentUser: boolean; portfolioValue: number;
  totalWealth: number; returnPct: number;
}
interface Toast { id: number; message: string; type: 'success' | 'error'; }
interface Props { authToken?: string; onNavigate?: (view: string) => void; }

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function fmt(n: number): string {
  return new Intl.NumberFormat('en-IN').format(Math.round(n));
}
function fmtPrice(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n);
}
function fmtPct(n: number): string {
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}
function fmtDate(ms: number): string {
  const d = new Date(ms);
  return (
    d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  );
}
function short(name: string): string {
  return name
    .replace(/ Limited$/i, '').replace(/ Ltd\.?$/i, '')
    .replace(/ Industries$/i, '').replace(/ Corporation$/i, '');
}

/* ─── CSS ────────────────────────────────────────────────────────────────── */
const BB_CSS = `
  @keyframes bb-shimmer   { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
  @keyframes bb-fade-in   { from{opacity:0} to{opacity:1} }
  @keyframes bb-slide-up  { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
  @keyframes bb-toast-in  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes bb-pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.35;transform:scale(0.75)} }
  @keyframes bb-spin      { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  @keyframes bb-pop       { 0%{transform:scale(0.88);opacity:0} 60%{transform:scale(1.05)} 100%{transform:scale(1);opacity:1} }
  @keyframes bb-glow      {
    0%,100%{box-shadow:0 0 8px rgba(0,255,136,.25),0 0 18px rgba(0,255,136,.08)}
    50%    {box-shadow:0 0 16px rgba(0,255,136,.45),0 0 32px rgba(0,255,136,.18)}
  }
  @keyframes bb-glow-red  {
    0%,100%{box-shadow:0 0 8px rgba(255,68,68,.25),0 0 18px rgba(255,68,68,.08)}
    50%    {box-shadow:0 0 16px rgba(255,68,68,.45),0 0 32px rgba(255,68,68,.18)}
  }
  @keyframes bb-flash-green { 0%{background:rgba(0,255,136,0.22)} 100%{background:transparent} }
  @keyframes bb-flash-red   { 0%{background:rgba(255,68,68,0.22)} 100%{background:transparent} }

  .bb-row:hover td { background: #111128 !important; cursor: pointer; }

  .bb-tab-btn { transition: color 0.15s; }
  .bb-tab-btn:hover { color: #e8eaf0 !important; }

  .bb-quick-qty { transition: background 0.1s, border-color 0.1s, color 0.1s; }
  .bb-quick-qty:hover { background: rgba(0,255,136,0.06) !important; border-color: rgba(0,255,136,0.3) !important; color: #00ff88 !important; }

  .bb-buy-btn { transition: background 0.12s, opacity 0.12s; }
  .bb-buy-btn:hover { background: rgba(0,255,136,0.18) !important; }
  .bb-sell-btn { transition: background 0.12s, opacity 0.12s; }
  .bb-sell-btn:hover { background: rgba(255,68,68,0.18) !important; }

  .bb-scroll { scrollbar-width: thin; scrollbar-color: #1e1e2e transparent; }
  .bb-scroll::-webkit-scrollbar { width: 3px; height: 3px; }
  .bb-scroll::-webkit-scrollbar-track { background: transparent; }
  .bb-scroll::-webkit-scrollbar-thumb { background: #1e1e2e; border-radius: 2px; }

  /* Responsive: hide trade panel inline on mobile, show overlay */
  @media (max-width: 1023px) { .bb-panel-inline  { display: none !important; } }
  @media (min-width: 1024px) { .bb-panel-overlay { display: none !important; } }

  /* Hide some table columns on small screens */
  @media (max-width: 640px) { .bb-col-sm { display: none !important; } }
`;

/* ─── Skeleton ───────────────────────────────────────────────────────────── */
function Sk({ w = '100%', h = 14, r = 4 }: { w?: string | number; h?: number; r?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: `linear-gradient(90deg, ${BORDER} 25%, #1a1a2e 50%, ${BORDER} 75%)`,
      backgroundSize: '200% 100%', animation: 'bb-shimmer 1.4s infinite',
    }} />
  );
}

/* ─── Toast Stack ────────────────────────────────────────────────────────── */
function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div style={{
      position: 'fixed', bottom: 88, right: 20, zIndex: 9999,
      display: 'flex', flexDirection: 'column-reverse', gap: 8,
      pointerEvents: 'none', maxWidth: 370,
    }}>
      {toasts.map((t) => (
        <div key={t.id} style={{
          background: t.type === 'success' ? '#001811' : '#190008',
          border: `1px solid ${t.type === 'success' ? GREEN + '45' : RED + '45'}`,
          borderLeft: `3px solid ${t.type === 'success' ? GREEN : RED}`,
          borderRadius: 8, padding: '10px 14px',
          display: 'flex', alignItems: 'flex-start', gap: 10,
          animation: 'bb-toast-in 0.2s ease',
          boxShadow: `0 4px 20px ${t.type === 'success' ? '#00ff8818' : '#ff444418'}`,
        }}>
          {t.type === 'success'
            ? <CheckCircle size={15} color={GREEN} style={{ flexShrink: 0, marginTop: 1 }} />
            : <AlertCircle size={15} color={RED}   style={{ flexShrink: 0, marginTop: 1 }} />}
          <span style={{ color: TEXT, ...SANS, fontSize: 13, lineHeight: 1.4 }}>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Earn Coins Panel ───────────────────────────────────────────────────── */
function EarnCoinsPanel({ onNavigate, compact = false }: {
  onNavigate?: (view: string) => void;
  compact?: boolean;
}) {
  const EARN_OPTIONS = [
    { icon: '🧠', label: 'Market Quiz',        desc: '100 coins/correct · 300 bonus for 5/5', coins: '+500', view: 'quiz',        color: '#b366ff' },
    { icon: '🔮', label: 'Daily Predictions',   desc: '100 coins/vote · 300 for correct',      coins: '+400', view: 'predictions', color: '#3b9eff' },
    { icon: '📰', label: 'News Impact Quiz',    desc: '100 coins per correct answer',           coins: '+100', view: 'predictions', color: '#ff9f3b' },
    { icon: '📊', label: 'IPO Predictions',     desc: '100 coins/vote · 500 for correct',      coins: '+600', view: 'predictions', color: '#ff3bff' },
    { icon: '📈', label: 'Trade Stocks',        desc: '50 coins per trade · 500 for 5% profit', coins: '+550', view: 'trading',     color: GREEN },
    { icon: '👥', label: 'Refer a Friend',      desc: 'Both get 500 coins!',                    coins: '+500', view: 'rewards',     color: '#ffdd3b' },
    { icon: '📅', label: 'Daily Login Streak',  desc: '100 base + 50/day streak (max 500)',     coins: '+600', view: 'rewards',     color: '#3bffee' },
  ];

  const items = compact ? EARN_OPTIONS.slice(0, 4) : EARN_OPTIONS;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 8 }}>
      {items.map((opt) => (
        <button
          key={opt.label}
          onClick={() => onNavigate?.(opt.view)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: '#09091a', border: `1px solid ${BORDER}`,
            borderRadius: 8, padding: compact ? '8px 10px' : '10px 12px',
            cursor: onNavigate ? 'pointer' : 'default', textAlign: 'left',
            width: '100%', transition: 'border-color 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = opt.color + '50')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = BORDER)}
        >
          <span style={{ fontSize: compact ? 16 : 18, flexShrink: 0 }}>{opt.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: TEXT, ...SANS, fontSize: compact ? 12 : 13, fontWeight: 600 }}>
              {opt.label}
            </div>
            {!compact && (
              <div style={{ color: MUTED, ...SANS, fontSize: 11, marginTop: 1 }}>
                {opt.desc}
              </div>
            )}
          </div>
          <span style={{
            color: opt.color, ...MONO, fontSize: compact ? 10 : 11, fontWeight: 700,
            background: opt.color + '12', border: `1px solid ${opt.color}25`,
            borderRadius: 4, padding: '2px 7px', flexShrink: 0,
          }}>
            {opt.coins}
          </span>
        </button>
      ))}
      {compact && (
        <button
          onClick={() => onNavigate?.('rewards')}
          style={{
            background: 'none', border: 'none', color: GREEN,
            ...MONO, fontSize: 11, cursor: 'pointer', padding: '4px 0',
            textAlign: 'center', letterSpacing: '0.04em',
          }}
        >
          VIEW ALL WAYS TO EARN →
        </button>
      )}
    </div>
  );
}

/* ─── Trade Panel Content ────────────────────────────────────────────────── */
function TradePanelContent({
  stock, portfolio, authToken, initialSide = 'BUY',
  onSuccess, onClose, showClose = false, onNavigate,
}: {
  key?: React.Key;
  stock: StockPrice | null;
  portfolio: Portfolio | null;
  authToken?: string;
  initialSide?: 'BUY' | 'SELL';
  onSuccess: (msg: string) => void;
  onClose?: () => void;
  showClose?: boolean;
  onNavigate?: (view: string) => void;
}) {
  const [side,    setSide]    = useState<'BUY' | 'SELL'>(initialSide);
  const [qty,     setQty]     = useState(1);
  const [loading,    setLoading]    = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [done,    setDone]    = useState<string | null>(null);

  useEffect(() => {
    setSide(initialSide); setQty(1); setError(null); setDone(null); setConfirming(false);
  }, [stock?.symbol, initialSide]);

  if (!stock) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        height: '100%', padding: '40px 20px', textAlign: 'center',
      }}>
        <div style={{ fontSize: '2.2rem', marginBottom: 14, opacity: 0.5 }}>📈</div>
        <div style={{ color: MUTED, ...MONO, fontSize: 11, letterSpacing: '0.08em' }}>
          SELECT A STOCK TO TRADE
        </div>
        <div style={{ color: DIM, ...SANS, fontSize: 12, marginTop: 6 }}>
          Click any row in the table
        </div>
      </div>
    );
  }

  const isBuy      = side === 'BUY';
  const priceOk    = stock.currentPrice > 0;
  const totalCoins = Math.round(stock.currentPrice * qty);
  const balance    = portfolio?.virtualBalance ?? 0;
  const holding    = portfolio?.holdings.find((h) => h.symbol === stock.symbol);
  const maxSell    = holding?.quantity ?? 0;
  const afterTrade = isBuy ? balance - totalCoins : balance + totalCoins;
  const canBuy     = isBuy  && priceOk && balance >= totalCoins && qty >= 1 && qty <= 100;
  const canSell    = !isBuy && priceOk && maxSell >= qty        && qty >= 1;
  const canSubmit  = !!authToken && (isBuy ? canBuy : canSell);
  const up         = stock.changePercent >= 0;

  // Human-readable reason when button is disabled
  const disabledReason = !authToken
    ? null  // handled separately with sign-in banner
    : !priceOk
      ? 'Price unavailable — try again later'
      : !portfolio
        ? 'Loading portfolio…'
        : isBuy && balance < totalCoins
          ? `Insufficient balance (need ${fmt(totalCoins)}, have ${fmt(balance)})`
          : !isBuy && maxSell === 0
            ? `You don't hold any ${stock.symbol}`
            : !isBuy && maxSell < qty
              ? `Not enough shares (have ${maxSell}, selling ${qty})`
              : null;

  function clampQty(v: number) {
    const max = isBuy ? 100 : (maxSell || 100);
    setQty(Math.min(max, Math.max(1, v)));
    setError(null); setDone(null);
  }

  function requestConfirm() {
    if (!canSubmit || loading) return;
    setConfirming(true);
  }

  async function submit() {
    if (!canSubmit || loading) return;
    setConfirming(false);
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`/api/trading/${isBuy ? 'buy' : 'sell'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ symbol: stock.symbol, quantity: qty }),
      });
      const data = await res.json();
      if (data.ok) {
        const verb  = isBuy ? 'Bought' : 'Sold';
        const coins = isBuy
          ? `−${fmt(totalCoins)} coins`
          : `+${fmt(data.order?.total ?? totalCoins)} coins`;
        const bonus = data.pnl?.bonusAwarded > 0 ? ` · +${data.pnl.bonusAwarded} profit bonus 🎉` : '';
        const msg   = `${verb} ${qty}×${stock.symbol} · ${coins}${bonus}`;
        setDone(msg);
        onSuccess(msg);
        setTimeout(() => { setDone(null); setQty(1); }, 2800);
      } else {
        setError(data.error ?? 'Trade failed');
      }
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Stock header */}
      <div style={{
        padding: '14px 16px', borderBottom: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 8, flexShrink: 0,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: TEXT, ...MONO, fontSize: 16, fontWeight: 700 }}>{stock.symbol}</span>
            <span style={{
              color: up ? GREEN : RED, ...MONO, fontSize: 12, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: 3,
            }}>
              {up ? '▲' : '▼'} {fmtPct(stock.changePercent)}
            </span>
            {stock.staleData && (
              <span style={{ color: DIM, ...MONO, fontSize: 9 }}>DELAYED</span>
            )}
          </div>
          <div style={{ color: MUTED, ...SANS, fontSize: 11, marginTop: 2 }}>
            {short(stock.companyName)}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ color: TEXT, ...MONO, fontSize: 20, fontWeight: 700 }}>
            ₹{fmtPrice(stock.currentPrice)}
          </div>
          <div style={{ color: up ? GREEN : RED, ...MONO, fontSize: 11 }}>
            {stock.change >= 0 ? '+' : ''}₹{fmtPrice(Math.abs(stock.change))}
          </div>
        </div>
        {showClose && onClose && (
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: MUTED, padding: 4, flexShrink: 0,
          }}>
            <X size={17} />
          </button>
        )}
      </div>

      {/* Scrollable body */}
      <div className="bb-scroll" style={{ padding: '14px 16px', flex: 1, overflowY: 'auto' }}>
        {/* BUY / SELL toggle */}
        <div style={{ display: 'flex', gap: 7, marginBottom: 14 }}>
          {(['BUY', 'SELL'] as const).map((s) => (
            <button key={s}
              onClick={() => { setSide(s); setQty(1); setError(null); setDone(null); }}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 8,
                border: `1px solid ${side === s ? (s === 'BUY' ? GREEN : RED) : BORDER}`,
                background: side === s
                  ? (s === 'BUY' ? 'rgba(0,255,136,0.1)' : 'rgba(255,68,68,0.1)')
                  : 'transparent',
                color: side === s ? (s === 'BUY' ? GREEN : RED) : MUTED,
                ...MONO, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                letterSpacing: '0.06em', transition: 'all 0.15s',
              }}
            >
              {s === 'BUY' ? '📈 BUY' : '📉 SELL'}
            </button>
          ))}
        </div>

        {/* Quantity */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: DIM, ...MONO, fontSize: 9, letterSpacing: '0.1em', marginBottom: 7 }}>
            QUANTITY {!isBuy && maxSell > 0 ? `· ${maxSell} HELD` : '· MAX 100'}
          </div>

          {/* Large number input */}
          <input
            type="number" min={1} max={isBuy ? 100 : maxSell || 100}
            value={qty}
            onChange={(e) => clampQty(parseInt(e.target.value) || 1)}
            style={{
              width: '100%', background: '#09091a',
              border: `1px solid ${BORDER}`,
              borderRadius: 8, color: TEXT, ...MONO,
              fontSize: 32, fontWeight: 700, textAlign: 'center',
              padding: '10px 0', outline: 'none', boxSizing: 'border-box',
              marginBottom: 8,
            }}
          />

          {/* Quick qty buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5 }}>
            {[1, 5, 10, 25, 50, 100].map((n) => (
              <button key={n}
                className="bb-quick-qty"
                onClick={() => clampQty(n)}
                style={{
                  padding: '6px 0', borderRadius: 5,
                  border: `1px solid ${qty === n ? GREEN + '55' : BORDER}`,
                  background: qty === n ? 'rgba(0,255,136,0.07)' : 'transparent',
                  color: qty === n ? GREEN : MUTED,
                  ...MONO, fontSize: 11, cursor: 'pointer',
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Cost breakdown box */}
        <div style={{
          background: '#09091a', border: `1px solid ${BORDER}`,
          borderRadius: 8, padding: '10px 12px', marginBottom: 12,
        }}>
          {[
            { label: 'Quantity',                   val: `${qty} shares`,                mono: false },
            { label: 'Price per share',             val: `₹${fmtPrice(stock.currentPrice)}`, mono: true },
            { label: isBuy ? 'Total Cost' : 'You Receive', val: `${fmt(totalCoins)} 🪙`, mono: true, bold: true },
            { label: 'Your Balance',               val: `${fmt(balance)} 🪙`,            mono: true },
            { label: 'After Trade',                val: `${fmt(afterTrade)} 🪙`,          mono: true, color: afterTrade >= 0 ? GREEN : RED },
          ].map(({ label, val, mono, bold, color }, i) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: i > 0 ? '5px 0 0' : '0',
              marginTop: i > 0 ? 5 : 0,
              borderTop: i > 0 ? `1px solid ${BORDER}` : 'none',
            }}>
              <span style={{ color: MUTED, ...SANS, fontSize: 12 }}>{label}</span>
              <span style={{
                ...(mono ? MONO : SANS), fontSize: bold ? 15 : 12,
                fontWeight: bold ? 700 : 400,
                color: color ?? (bold ? TEXT : MUTED),
              }}>
                {val}
              </span>
            </div>
          ))}
        </div>

        {/* Reward note */}
        <div style={{ color: DIM, ...SANS, fontSize: 11, textAlign: 'center', marginBottom: 12 }}>
          🪙 +50 coins every trade · +500 coins if P&L ≥ 5%
        </div>

        {/* Sign-in prompt */}
        {!authToken && (
          <div style={{
            background: '#0a0a2a', border: `1px solid #3b9eff30`,
            borderRadius: 8, padding: '12px 14px', marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 10,
            color: '#3b9eff', ...SANS, fontSize: 13, textAlign: 'center',
            justifyContent: 'center',
          }}>
            🔒 Sign in to start trading with 1,000 virtual coins
          </div>
        )}

        {/* Price unavailable warning */}
        {authToken && !priceOk && (
          <div style={{
            background: '#1a1000', border: `1px solid #ff9f3b30`,
            borderRadius: 8, padding: '10px 14px', marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 8,
            color: '#ff9f3b', ...SANS, fontSize: 12,
          }}>
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            Price data unavailable for {stock.symbol}. Try refreshing.
          </div>
        )}

        {/* Disabled reason hint */}
        {authToken && disabledReason && priceOk && (
          <div style={{
            background: '#1a0a0a', border: `1px solid ${RED}20`,
            borderRadius: 7, padding: '8px 12px', marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 8,
            color: '#ff8899', ...SANS, fontSize: 12,
          }}>
            <AlertCircle size={13} style={{ flexShrink: 0 }} />
            {disabledReason}
          </div>
        )}

        {/* Earn Coins — show when balance is too low for buy */}
        {authToken && isBuy && priceOk && balance < totalCoins && (
          <div style={{
            background: '#080818', border: `1px solid ${GREEN}18`,
            borderRadius: 9, padding: '10px 12px', marginBottom: 10,
          }}>
            <div style={{
              color: GREEN, ...MONO, fontSize: 10, letterSpacing: '0.08em',
              marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              🪙 EARN MORE COINS
            </div>
            <EarnCoinsPanel onNavigate={onNavigate} compact />
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            background: '#190008', border: `1px solid ${RED}30`,
            borderRadius: 7, padding: '9px 12px', marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 8,
            color: RED, ...SANS, fontSize: 13,
          }}>
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            ❌ {error}
          </div>
        )}

        {/* Success */}
        {done && (
          <div style={{
            background: '#001811', border: `1px solid ${GREEN}30`,
            borderRadius: 7, padding: '10px 12px', marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 8,
            color: GREEN, ...SANS, fontSize: 13,
            animation: 'bb-pop 0.3s ease',
          }}>
            <CheckCircle size={14} style={{ flexShrink: 0 }} />
            ✅ {done}
          </div>
        )}

        {/* Confirmation dialog */}
        {confirming && (
          <div style={{
            background: isBuy ? 'rgba(0,255,136,0.06)' : 'rgba(255,68,68,0.06)',
            border: `1px solid ${isBuy ? GREEN : RED}40`,
            borderRadius: 10, padding: '12px 14px', marginBottom: 8,
          }}>
            <div style={{ color: TEXT, ...SANS, fontSize: 13, marginBottom: 10 }}>
              {isBuy ? 'Buy' : 'Sell'} <strong>{qty}×{stock.symbol}</strong> for <strong style={{ ...MONO }}>{fmt(totalCoins)}</strong> coins?
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={submit} style={{
                flex: 1, padding: '10px 0', borderRadius: 8,
                background: isBuy ? GREEN : RED, color: '#000',
                border: 'none', ...MONO, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>YES, {side}</button>
              <button onClick={() => setConfirming(false)} style={{
                flex: 1, padding: '10px 0', borderRadius: 8,
                background: 'transparent', color: MUTED,
                border: `1px solid ${BORDER}`, ...MONO, fontSize: 13, cursor: 'pointer',
              }}>CANCEL</button>
            </div>
          </div>
        )}

        {/* Trade button */}
        <button
          onClick={requestConfirm}
          disabled={!canSubmit || loading || confirming}
          style={{
            width: '100%', padding: '14px 0', borderRadius: 10,
            border: `1px solid ${canSubmit ? (isBuy ? GREEN : RED) : BORDER}`,
            background: canSubmit
              ? (isBuy ? 'rgba(0,255,136,0.13)' : 'rgba(255,68,68,0.13)')
              : 'transparent',
            color: canSubmit ? (isBuy ? GREEN : RED) : DIM,
            ...MONO, fontSize: 14, fontWeight: 700,
            cursor: canSubmit && !loading && !confirming ? 'pointer' : 'not-allowed',
            letterSpacing: '0.06em', boxSizing: 'border-box',
            animation: canSubmit && !loading && !done && !error && !confirming
              ? (isBuy ? 'bb-glow 2.5s ease-in-out infinite' : 'bb-glow-red 2.5s ease-in-out infinite')
              : 'none',
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          {loading
            ? '⟳ PROCESSING…'
            : !authToken
              ? '🔒 SIGN IN TO TRADE'
              : done
                ? '✓ DONE'
                : !priceOk
                  ? '⚠ PRICE UNAVAILABLE'
                  : !portfolio
                    ? '⏳ LOADING…'
                    : isBuy && balance < totalCoins
                      ? `INSUFFICIENT BALANCE`
                      : !isBuy && maxSell < qty
                        ? `NOT ENOUGH SHARES`
                        : `${side} · ${fmt(totalCoins)} 🪙`}
        </button>
      </div>
    </div>
  );
}

/* ─── Stock Table Row ────────────────────────────────────────────────────── */
function StockRow({
  stock, index, portfolio, selected, onSelect, onTrade, isWatched, onToggleWatch, flash,
}: {
  stock: StockPrice; index: number;
  portfolio: Portfolio | null;
  selected: boolean;
  onSelect: (s: StockPrice) => void;
  onTrade: (s: StockPrice, side: 'BUY' | 'SELL') => void;
  isWatched: boolean;
  onToggleWatch: (symbol: string) => void;
  flash?: 'up' | 'down' | null;
  key?: React.Key;
}) {
  const up      = stock.changePercent >= 0;
  const holding = portfolio?.holdings.find((h) => h.symbol === stock.symbol);
  const qty     = holding?.quantity ?? 0;

  return (
    <tr
      className="bb-row"
      onClick={() => onSelect(stock)}
      style={{
        background: selected ? 'rgba(0,255,136,0.035)' : 'transparent',
        borderBottom: `1px solid ${BORDER}`,
        outline: selected ? `1px solid ${GREEN}20` : 'none',
        outlineOffset: -1,
        transition: 'background 0.1s',
      }}
    >
      {/* # + star */}
      <td style={{ padding: '9px 6px 9px 8px', textAlign: 'right', width: 44 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleWatch(stock.symbol); }}
            title={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0 }}
          >
            <Star size={11} color={isWatched ? '#ffdd3b' : DIM} fill={isWatched ? '#ffdd3b' : 'none'} />
          </button>
          <span style={{ color: DIM, ...MONO, fontSize: 11 }}>{index + 1}</span>
        </div>
      </td>

      {/* Company */}
      <td style={{ padding: '9px 10px' }}>
        <div style={{ color: TEXT, ...SANS, fontSize: 13, fontWeight: 600 }}>
          {short(stock.companyName)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <span style={{ color: DIM, ...MONO, fontSize: 10 }}>{stock.symbol}</span>
          {qty > 0 && (
            <span style={{
              color: GREEN, background: 'rgba(0,255,136,0.1)',
              border: `1px solid ${GREEN}30`,
              ...MONO, fontSize: 9, borderRadius: 3, padding: '1px 5px',
            }}>
              {qty} held
            </span>
          )}
        </div>
      </td>

      {/* Price */}
      <td style={{
        padding: '9px 10px', textAlign: 'right',
        animation: flash ? `bb-flash-${flash === 'up' ? 'green' : 'red'} 0.8s ease-out` : 'none',
        borderRadius: 3,
      }}>
        <span style={{ color: TEXT, ...MONO, fontSize: 13, fontWeight: 700 }}>
          ₹{fmtPrice(stock.currentPrice)}
        </span>
      </td>

      {/* Change ₹ — hidden on small screens */}
      <td className="bb-col-sm" style={{ padding: '9px 10px', textAlign: 'right' }}>
        <span style={{ color: up ? GREEN : RED, ...MONO, fontSize: 12 }}>
          {stock.change >= 0 ? '+' : ''}₹{fmtPrice(Math.abs(stock.change))}
        </span>
      </td>

      {/* Change % */}
      <td style={{ padding: '9px 10px', textAlign: 'right' }}>
        <span style={{
          color: up ? GREEN : RED, ...MONO, fontSize: 12, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', gap: 2,
        }}>
          {up ? '▲' : '▼'} {Math.abs(stock.changePercent).toFixed(2)}%
        </span>
      </td>

      {/* Actions */}
      <td style={{ padding: '9px 12px 9px 8px', textAlign: 'right' }}>
        <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
          <button
            className="bb-buy-btn"
            onClick={(e) => { e.stopPropagation(); onTrade(stock, 'BUY'); }}
            style={{
              background: 'rgba(0,255,136,0.1)', border: `1px solid ${GREEN}38`,
              borderRadius: 5, color: GREEN, ...MONO, fontSize: 11, fontWeight: 700,
              padding: '4px 10px', cursor: 'pointer', letterSpacing: '0.04em',
            }}
          >
            BUY
          </button>
          {qty > 0 && (
            <button
              className="bb-sell-btn"
              onClick={(e) => { e.stopPropagation(); onTrade(stock, 'SELL'); }}
              style={{
                background: 'rgba(255,68,68,0.1)', border: `1px solid ${RED}38`,
                borderRadius: 5, color: RED, ...MONO, fontSize: 11, fontWeight: 700,
                padding: '4px 10px', cursor: 'pointer', letterSpacing: '0.04em',
              }}
            >
              SELL
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

/* ─── Markets Tab ────────────────────────────────────────────────────────── */
function MarketsTab({
  stocks, loading, portfolio, authToken, lastUpdated, onTradeSuccess, watchlist, onToggleWatch, priceFlashes, onNavigate,
}: {
  stocks: StockPrice[];
  loading: boolean;
  portfolio: Portfolio | null;
  authToken?: string;
  lastUpdated: number;
  onTradeSuccess: (msg: string) => void;
  watchlist: string[];
  onToggleWatch: (symbol: string) => void;
  priceFlashes: Map<string, 'up' | 'down'>;
  onNavigate?: (view: string) => void;
}) {
  const [search,        setSearch]        = useState('');
  const [selectedStock, setSelectedStock] = useState<StockPrice | null>(null);
  const [initialSide,   setInitialSide]   = useState<'BUY' | 'SELL'>('BUY');
  const [mobilePanel,   setMobilePanel]   = useState(false);
  const [secsAgo,       setSecsAgo]       = useState(0);
  const [searchResults, setSearchResults] = useState<StockPrice[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // Set first stock once loaded
  useEffect(() => {
    if (stocks.length > 0) {
      setSelectedStock((prev) => {
        if (!prev) return stocks[0];
        return stocks.find((s) => s.symbol === prev.symbol) ?? stocks[0];
      });
    }
  }, [stocks]);

  // "Updated Xs ago" ticker
  useEffect(() => {
    const id = setInterval(() => setSecsAgo(Math.floor((Date.now() - lastUpdated) / 1000)), 1000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  // Server-side search for symbols not in the loaded list
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = search.trim();
    if (!q || q.length < 2) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data.ok && data.symbols?.length) {
          const loadedSet = new Set(stocks.map(s => s.symbol));
          const missing = (data.symbols as string[]).filter(s => !loadedSet.has(s));
          if (missing.length > 0) {
            const r = await fetch('/api/stocks/batch-refresh', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ symbols: missing.slice(0, 10) }),
            });
            const d = await r.json();
            if (d.ok && d.stocks?.length) {
              setSearchResults(d.stocks as StockPrice[]);
            }
          } else {
            setSearchResults([]);
          }
        } else {
          setSearchResults([]);
        }
      } catch { setSearchResults([]); }
    }, 400);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search, stocks]);

  const filtered = search.trim()
    ? [
        ...stocks.filter((s) =>
          s.symbol.toLowerCase().includes(search.toLowerCase()) ||
          s.companyName.toLowerCase().includes(search.toLowerCase())),
        ...searchResults.filter(sr => !stocks.some(s => s.symbol === sr.symbol)),
      ]
    : stocks;

  function openTrade(stock: StockPrice, side: 'BUY' | 'SELL') {
    setSelectedStock(stock);
    setInitialSide(side);
    setMobilePanel(true);
  }

  function handleTradeSuccess(msg: string) {
    setMobilePanel(false);
    onTradeSuccess(msg);
  }

  const panelKey = `${selectedStock?.symbol ?? 'none'}-${initialSide}`;

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 176px)', position: 'relative' }}>
      {/* ── Left: stock table ─────────────────────────────── */}
      <div style={{ flex: '60 60 0', minWidth: 0, borderRight: `1px solid ${BORDER}` }}>
        {/* Search + meta */}
        <div style={{
          padding: '9px 14px', borderBottom: `1px solid ${BORDER}`,
          background: '#08081a', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={11} color={DIM} style={{
              position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
              pointerEvents: 'none',
            }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search stocks…"
              style={{
                width: '100%', background: BORDER + '55', border: `1px solid ${BORDER}`,
                borderRadius: 6, color: TEXT, ...MONO, fontSize: 12,
                padding: '6px 9px 6px 27px', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <span style={{ color: DIM, ...MONO, fontSize: 9, whiteSpace: 'nowrap', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
            {secsAgo < 45 ? (
              <>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', background: GREEN,
                  display: 'inline-block', animation: 'bb-pulse-dot 1.5s infinite',
                }} />
                <span style={{ color: GREEN }}>LIVE</span>
              </>
            ) : secsAgo < 300 ? (
              <span style={{ color: '#ffaa00' }}>DELAYED</span>
            ) : (
              <span style={{ color: RED }}>STALE</span>
            )}
            · ⟳ {secsAgo < 60 ? `${secsAgo}s` : `${Math.floor(secsAgo / 60)}m ${secsAgo % 60}s`} ago
          </span>
        </div>

        {/* Table */}
        <div className="bb-scroll" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
            <thead>
              <tr style={{ background: '#08081a', borderBottom: `1px solid ${BORDER}` }}>
                {[
                  { l: '#',       a: 'right', cls: '' },
                  { l: 'COMPANY', a: 'left',  cls: '' },
                  { l: 'PRICE',   a: 'right', cls: '' },
                  { l: 'CHANGE',  a: 'right', cls: 'bb-col-sm' },
                  { l: 'CHANGE%', a: 'right', cls: '' },
                  { l: 'ACTION',  a: 'right', cls: '' },
                ].map(({ l, a, cls }) => (
                  <th key={l} className={cls} style={{
                    padding: '7px 10px', textAlign: a as any,
                    color: DIM, ...MONO, fontSize: 9,
                    letterSpacing: '0.1em', fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}>
                    {l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${BORDER}` }}>
                      {[20, 130, 70, 60, 55, 90].map((w, j) => (
                        <td key={j} style={{ padding: '10px 10px' }}>
                          <Sk w={w} h={11} />
                        </td>
                      ))}
                    </tr>
                  ))
                : filtered.map((s, i) => (
                    <React.Fragment key={s.symbol}>
                      <StockRow
                        stock={s} index={i}
                        portfolio={portfolio}
                        selected={selectedStock?.symbol === s.symbol}
                        onSelect={(st) => { setSelectedStock(st); setInitialSide('BUY'); }}
                        onTrade={openTrade}
                        isWatched={watchlist.includes(s.symbol)}
                        onToggleWatch={onToggleWatch}
                        flash={priceFlashes.get(s.symbol) ?? null}
                      />
                    </React.Fragment>
                  ))
              }
            </tbody>
          </table>

          {!loading && filtered.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: MUTED, ...SANS, fontSize: 13 }}>
              No stocks matching "{search}"
            </div>
          )}
        </div>
      </div>

      {/* ── Right: trade panel (desktop only) ─────────────── */}
      <div
        className="bb-panel-inline"
        style={{
          flex: '40 40 0', minWidth: 280,
          position: 'sticky', top: 0,
          height: 'calc(100vh - 176px)',
          display: 'flex', flexDirection: 'column',
          background: CARD,
        }}
      >
        <TradePanelContent
          key={panelKey}
          stock={selectedStock}
          portfolio={portfolio}
          authToken={authToken}
          initialSide={initialSide}
          onSuccess={handleTradeSuccess}
          onNavigate={onNavigate}
        />
      </div>

      {/* ── Mobile trade overlay ───────────────────────────── */}
      {mobilePanel && selectedStock && (
        <div className="bb-panel-overlay" style={{
          position: 'fixed', inset: 0, zIndex: 300,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        }}>
          <div
            onClick={() => setMobilePanel(false)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.82)' }}
          />
          <div style={{
            position: 'relative', background: '#0a0a1a',
            borderTop: `1px solid ${BORDER}`, borderRadius: '14px 14px 0 0',
            maxHeight: '88vh', display: 'flex', flexDirection: 'column',
            animation: 'bb-slide-up 0.25s cubic-bezier(0.34,1.56,0.64,1)',
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: BORDER, margin: '10px auto 0' }} />
            <div style={{ flex: 1, minHeight: 0 }}>
              <TradePanelContent
                key={panelKey + '-mobile'}
                stock={selectedStock}
                portfolio={portfolio}
                authToken={authToken}
                initialSide={initialSide}
                onSuccess={handleTradeSuccess}
                onClose={() => setMobilePanel(false)}
                showClose
                onNavigate={onNavigate}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Watchlist Tab ──────────────────────────────────────────────────────── */
function WatchlistTab({
  stocks, watchlist, onToggle, onGoToMarkets, priceFlashes,
}: {
  stocks: StockPrice[];
  watchlist: string[];
  onToggle: (symbol: string) => void;
  onGoToMarkets: () => void;
  priceFlashes: Map<string, 'up' | 'down'>;
}) {
  const watched = stocks.filter(s => watchlist.includes(s.symbol));

  if (watched.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '72px 20px' }}>
        <Star size={38} color={DIM} style={{ marginBottom: 14 }} />
        <div style={{ color: MUTED, ...SANS, fontSize: 15, marginBottom: 6 }}>Your watchlist is empty</div>
        <div style={{ color: DIM, ...SANS, fontSize: 13, marginBottom: 18 }}>
          Star stocks from the Markets tab to track them here
        </div>
        <button
          onClick={onGoToMarkets}
          style={{
            background: 'rgba(0,255,136,0.1)', border: `1px solid ${GREEN}38`,
            borderRadius: 8, color: GREEN, ...MONO, fontSize: 12, fontWeight: 700,
            padding: '10px 22px', cursor: 'pointer', letterSpacing: '0.05em',
          }}
        >
          → GO TO MARKETS
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 20px' }}>
      <div style={{ color: DIM, ...MONO, fontSize: 9, letterSpacing: '0.1em', marginBottom: 10 }}>
        WATCHLIST ({watched.length})
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {watched.map(s => {
          const up = s.changePercent >= 0;
          return (
            <div key={s.symbol} style={{
              background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10,
              padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <button
                onClick={() => onToggle(s.symbol)}
                title="Remove from watchlist"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}
              >
                <Star size={16} color="#ffdd3b" fill="#ffdd3b" />
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ color: TEXT, ...MONO, fontSize: 14, fontWeight: 700 }}>{s.symbol}</span>
                  <span style={{ color: MUTED, ...SANS, fontSize: 11 }}>{short(s.companyName)}</span>
                </div>
              </div>
              <div style={{
                textAlign: 'right', minWidth: 80, borderRadius: 4, padding: '2px 4px',
                animation: priceFlashes.get(s.symbol) ? `bb-flash-${priceFlashes.get(s.symbol) === 'up' ? 'green' : 'red'} 0.8s ease-out` : 'none',
              }}>
                <div style={{ color: TEXT, ...MONO, fontSize: 15, fontWeight: 700 }}>₹{fmtPrice(s.currentPrice)}</div>
                <div style={{ color: up ? GREEN : RED, ...MONO, fontSize: 11, fontWeight: 600 }}>
                  {fmtPct(s.changePercent)}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginLeft: 6 }}>
                <span style={{ color: DIM, ...MONO, fontSize: 9, letterSpacing: '0.05em' }}>
                  H ₹{fmtPrice(s.high)} &nbsp; L ₹{fmtPrice(s.low)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Portfolio Tab ──────────────────────────────────────────────────────── */
function PortfolioTab({
  portfolio, loading, authToken, onSell, onGoToMarkets,
}: {
  portfolio: Portfolio | null;
  loading: boolean;
  authToken?: string;
  onSell: (h: PortfolioHolding) => void;
  onGoToMarkets: () => void;
}) {
  if (!authToken) {
    return (
      <div style={{ textAlign: 'center', padding: '72px 20px' }}>
        <Wallet size={38} color={DIM} style={{ marginBottom: 14 }} />
        <div style={{ color: MUTED, ...SANS, fontSize: 14 }}>Sign in to see your portfolio</div>
      </div>
    );
  }
  if (loading && !portfolio) {
    return (
      <div style={{ padding: '18px 20px' }}>
        <Sk h={68} r={10} />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ marginTop: 8 }}><Sk h={50} r={7} /></div>
        ))}
      </div>
    );
  }
  if (!portfolio) return null;

  const { totalInvested, currentValue, totalPnlCoins, totalPnlPercent, virtualBalance, holdings } = portfolio;
  const pnlUp = totalPnlCoins >= 0;

  return (
    <div style={{ padding: '16px 20px' }}>
      {/* Summary bar */}
      <div style={{
        background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10,
        padding: '13px 18px', marginBottom: 16,
        display: 'flex', gap: 0, overflowX: 'auto',
      }} className="bb-scroll">
        {[
          { label: 'INVESTED',      value: `${fmt(totalInvested)} 🪙`,              color: TEXT },
          { label: 'CURRENT VALUE', value: `${fmt(currentValue)} 🪙`,               color: TEXT },
          { label: 'P&L',           value: `${pnlUp ? '+' : ''}${fmt(totalPnlCoins)} 🪙`, sub: fmtPct(totalPnlPercent), color: pnlUp ? GREEN : RED },
          { label: 'AVAILABLE',     value: `${fmt(virtualBalance)} 🪙`,             color: GREEN },
        ].map(({ label, value, sub, color }, i) => (
          <div key={label} style={{
            flexShrink: 0, paddingRight: 24, marginRight: 24,
            borderRight: i < 3 ? `1px solid ${BORDER}` : 'none',
          }}>
            <div style={{ color: DIM, ...MONO, fontSize: 9, letterSpacing: '0.1em', marginBottom: 3 }}>{label}</div>
            <div style={{ color, ...MONO, fontSize: 15, fontWeight: 700 }}>{value}</div>
            {sub && <div style={{ color, ...MONO, fontSize: 11, marginTop: 1 }}>{sub}</div>}
          </div>
        ))}
      </div>

      {holdings.length === 0 ? (
        <div style={{
          background: CARD, border: `1px solid ${BORDER}`,
          borderRadius: 10, padding: '52px 20px', textAlign: 'center',
        }}>
          <ShoppingCart size={34} color={DIM} style={{ marginBottom: 14 }} />
          <div style={{ color: MUTED, ...SANS, fontSize: 15, marginBottom: 6 }}>Your portfolio is empty</div>
          <div style={{ color: DIM, ...SANS, fontSize: 13, marginBottom: 18 }}>
            Start with 1,000 free coins — buy your first stock!
          </div>
          <button
            onClick={onGoToMarkets}
            style={{
              background: 'rgba(0,255,136,0.1)', border: `1px solid ${GREEN}38`,
              borderRadius: 8, color: GREEN, ...MONO, fontSize: 12, fontWeight: 700,
              padding: '10px 22px', cursor: 'pointer', letterSpacing: '0.05em',
            }}
          >
            → GO TO MARKETS
          </button>
        </div>
      ) : (
        <>
          <div style={{ color: DIM, ...MONO, fontSize: 9, letterSpacing: '0.1em', marginBottom: 8 }}>
            HOLDINGS ({holdings.length})
          </div>
          <div className="bb-scroll" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
              <thead>
                <tr style={{ background: '#08081a', borderBottom: `1px solid ${BORDER}` }}>
                  {['STOCK', 'QTY', 'AVG PRICE', 'CURR PRICE', 'INVESTED', 'CURRENT', 'P&L', 'P&L%', ''].map((h, i) => (
                    <th key={h + i} style={{
                      padding: '7px 10px', textAlign: i < 2 ? 'left' : 'right',
                      color: DIM, ...MONO, fontSize: 9, letterSpacing: '0.1em',
                      fontWeight: 600, whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => {
                  const up = h.pnlCoins >= 0;
                  return (
                    <tr key={h.symbol} className="bb-row" style={{ borderBottom: `1px solid ${BORDER}` }}>
                      <td style={{ padding: '10px 10px' }}>
                        <div style={{ color: TEXT, ...MONO, fontSize: 13, fontWeight: 700 }}>{h.symbol}</div>
                        <div style={{ color: MUTED, ...SANS, fontSize: 10 }}>{short(h.companyName)}</div>
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'right', color: TEXT, ...MONO, fontSize: 13 }}>{h.quantity}</td>
                      <td style={{ padding: '10px 10px', textAlign: 'right', color: MUTED, ...MONO, fontSize: 12 }}>₹{fmtPrice(h.avgBuyPrice)}</td>
                      <td style={{ padding: '10px 10px', textAlign: 'right', color: TEXT, ...MONO, fontSize: 13, fontWeight: 600 }}>₹{fmtPrice(h.currentPrice)}</td>
                      <td style={{ padding: '10px 10px', textAlign: 'right', color: MUTED, ...MONO, fontSize: 12 }}>{fmt(h.investedCoins)}</td>
                      <td style={{ padding: '10px 10px', textAlign: 'right', color: TEXT, ...MONO, fontSize: 12 }}>{fmt(h.currentValue)}</td>
                      <td style={{ padding: '10px 10px', textAlign: 'right', color: up ? GREEN : RED, ...MONO, fontSize: 13, fontWeight: 700 }}>
                        {up ? '+' : ''}{fmt(h.pnlCoins)}
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'right', color: up ? GREEN : RED, ...MONO, fontSize: 12, fontWeight: 600 }}>
                        {fmtPct(h.pnlPercent)}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <button
                          className="bb-sell-btn"
                          onClick={() => onSell(h)}
                          style={{
                            background: 'rgba(255,68,68,0.1)', border: `1px solid ${RED}38`,
                            borderRadius: 5, color: RED, ...MONO, fontSize: 11, fontWeight: 700,
                            padding: '4px 10px', cursor: 'pointer',
                          }}
                        >
                          SELL
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Leaderboard Tab ────────────────────────────────────────────────────── */
function LeaderboardTab({
  leaderboard, myRank, loading, onRefresh,
}: {
  leaderboard: LeaderboardEntry[];
  myRank: number | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div style={{ padding: '16px 20px' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14,
      }}>
        <div>
          <div style={{ color: TEXT, ...SANS, fontSize: 15, fontWeight: 700 }}>
            TOP TRADERS THIS WEEK
          </div>
          <div style={{ color: DIM, ...MONO, fontSize: 10, marginTop: 2 }}>
            Resets Monday 9:15 AM IST
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          style={{
            background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6,
            color: MUTED, cursor: 'pointer', padding: '6px 10px', display: 'flex', alignItems: 'center',
          }}
        >
          <RefreshCw size={13} style={{ animation: loading ? 'bb-spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* My rank pill */}
      {myRank !== null && (
        <div style={{
          background: 'rgba(0,255,136,0.06)', border: `1px solid ${GREEN}28`,
          borderRadius: 8, padding: '9px 14px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Trophy size={14} color={GREEN} />
          <span style={{ color: GREEN, ...MONO, fontSize: 13, fontWeight: 700 }}>
            YOUR RANK: #{myRank}
          </span>
          <span style={{ color: MUTED, ...SANS, fontSize: 12 }}>
            {myRank <= 3 ? '🎉 You\'re on the podium!' : 'Keep trading to climb higher!'}
          </span>
        </div>
      )}

      {loading ? (
        Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ background: CARD, borderRadius: 8, padding: '14px 16px', marginBottom: 8 }}>
            <Sk h={13} w="60%" />
            <div style={{ marginTop: 6 }}><Sk h={11} w="40%" /></div>
          </div>
        ))
      ) : leaderboard.length === 0 ? (
        <div style={{ textAlign: 'center', color: MUTED, padding: '52px 0', ...SANS, fontSize: 14 }}>
          No trades yet — be the first on the board!
        </div>
      ) : (
        <>
          {/* Top 3 podium */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
            {leaderboard.slice(0, 3).map((e) => (
              <div key={e.userId} style={{
                background: e.isCurrentUser ? 'rgba(0,255,136,0.06)' : CARD,
                border: `1px solid ${e.isCurrentUser ? GREEN + '38' : BORDER}`,
                borderRadius: 10, padding: '14px 12px', textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.8rem', marginBottom: 6 }}>{medals[e.rank - 1]}</div>
                <div style={{ color: TEXT, ...SANS, fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  {e.displayName}
                </div>
                {e.isCurrentUser && (
                  <div style={{
                    color: GREEN, background: 'rgba(0,255,136,0.1)',
                    border: `1px solid ${GREEN}25`,
                    ...MONO, fontSize: 8, borderRadius: 3, padding: '1px 5px',
                    display: 'inline-block', marginBottom: 4,
                  }}>
                    YOU
                  </div>
                )}
                <div style={{ color: TEXT, ...MONO, fontSize: 11, marginBottom: 3 }}>
                  🪙 {fmt(e.totalWealth)}
                </div>
                <div style={{ color: e.returnPct >= 0 ? GREEN : RED, ...MONO, fontSize: 14, fontWeight: 700 }}>
                  {fmtPct(e.returnPct)}
                </div>
              </div>
            ))}
          </div>

          {/* Ranks 4+ table */}
          {leaderboard.length > 3 && (
            <div className="bb-scroll" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#08081a', borderBottom: `1px solid ${BORDER}` }}>
                    {['RANK', 'TRADER', 'PORTFOLIO', 'TOTAL WEALTH', 'RETURN%'].map((h, i) => (
                      <th key={h} style={{
                        padding: '7px 10px', textAlign: i <= 1 ? 'left' : 'right',
                        color: DIM, ...MONO, fontSize: 9, letterSpacing: '0.1em', fontWeight: 600,
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.slice(3).map((e) => (
                    <tr key={e.userId} className="bb-row" style={{
                      borderBottom: `1px solid ${BORDER}`,
                      background: e.isCurrentUser ? 'rgba(0,255,136,0.04)' : 'transparent',
                    }}>
                      <td style={{ padding: '9px 10px', color: MUTED, ...MONO, fontSize: 13 }}>#{e.rank}</td>
                      <td style={{ padding: '9px 10px' }}>
                        <span style={{ color: TEXT, ...SANS, fontSize: 13 }}>{e.displayName}</span>
                        {e.isCurrentUser && (
                          <span style={{
                            color: GREEN, background: 'rgba(0,255,136,0.1)',
                            border: `1px solid ${GREEN}25`,
                            ...MONO, fontSize: 8, borderRadius: 3,
                            padding: '1px 5px', marginLeft: 6,
                          }}>YOU</span>
                        )}
                      </td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: MUTED, ...MONO, fontSize: 12 }}>
                        🪙 {fmt(e.portfolioValue)}
                      </td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: TEXT, ...MONO, fontSize: 12 }}>
                        🪙 {fmt(e.totalWealth)}
                      </td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', color: e.returnPct >= 0 ? GREEN : RED, ...MONO, fontSize: 13, fontWeight: 700 }}>
                        {fmtPct(e.returnPct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Orders Tab ─────────────────────────────────────────────────────────── */
function OrdersTab({
  orders, loading, authToken,
}: {
  orders: TradeOrder[];
  loading: boolean;
  authToken?: string;
}) {
  if (!authToken) {
    return (
      <div style={{ textAlign: 'center', padding: '72px 20px' }}>
        <History size={38} color={DIM} style={{ marginBottom: 14 }} />
        <div style={{ color: MUTED, ...SANS, fontSize: 14 }}>Sign in to see your orders</div>
      </div>
    );
  }
  if (loading && orders.length === 0) {
    return (
      <div style={{ padding: '18px 20px' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ background: CARD, borderRadius: 7, padding: '12px 14px', marginBottom: 8 }}>
            <Sk h={12} w="60%" />
            <div style={{ marginTop: 6 }}><Sk h={10} w="80%" /></div>
          </div>
        ))}
      </div>
    );
  }
  if (orders.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '72px 20px' }}>
        <History size={38} color={DIM} style={{ marginBottom: 14 }} />
        <div style={{ color: MUTED, ...SANS, fontSize: 14 }}>No orders yet</div>
        <div style={{ color: DIM, ...SANS, fontSize: 12, marginTop: 5 }}>
          Your complete trade history will appear here
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 20px' }}>
      <div style={{ color: DIM, ...MONO, fontSize: 9, letterSpacing: '0.1em', marginBottom: 10 }}>
        {orders.length} ORDERS — NEWEST FIRST
      </div>
      <div className="bb-scroll" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
          <thead>
            <tr style={{ background: '#08081a', borderBottom: `1px solid ${BORDER}` }}>
              {[
                { h: 'DATE/TIME',    a: 'left'  },
                { h: 'TYPE',         a: 'left'  },
                { h: 'STOCK',        a: 'left'  },
                { h: 'QTY',          a: 'right' },
                { h: 'PRICE',        a: 'right' },
                { h: 'TOTAL COINS',  a: 'right' },
                { h: 'STATUS',       a: 'right' },
              ].map(({ h, a }) => (
                <th key={h} style={{
                  padding: '7px 10px', textAlign: a as any,
                  color: DIM, ...MONO, fontSize: 9,
                  letterSpacing: '0.1em', fontWeight: 600, whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const isBuy = o.orderType === 'BUY';
              return (
                <tr key={o.id} className="bb-row" style={{
                  borderLeft: `3px solid ${isBuy ? GREEN : RED}`,
                  borderBottom: `1px solid ${BORDER}`,
                }}>
                  <td style={{ padding: '9px 10px', color: MUTED, ...MONO, fontSize: 11, whiteSpace: 'nowrap' }}>
                    {fmtDate(o.executedAt)}
                  </td>
                  <td style={{ padding: '9px 10px' }}>
                    <span style={{
                      color: isBuy ? GREEN : RED,
                      background: isBuy ? 'rgba(0,255,136,0.1)' : 'rgba(255,68,68,0.1)',
                      border: `1px solid ${isBuy ? GREEN + '38' : RED + '38'}`,
                      borderRadius: 4, ...MONO, fontSize: 10, fontWeight: 700,
                      padding: '2px 7px', letterSpacing: '0.06em',
                    }}>
                      {o.orderType}
                    </span>
                  </td>
                  <td style={{ padding: '9px 10px' }}>
                    <div style={{ color: TEXT, ...MONO, fontSize: 13, fontWeight: 600 }}>{o.symbol}</div>
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', color: TEXT, ...MONO, fontSize: 13 }}>
                    {o.quantity}
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', color: MUTED, ...MONO, fontSize: 12 }}>
                    ₹{fmtPrice(o.price)}
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', color: isBuy ? RED : GREEN, ...MONO, fontSize: 13, fontWeight: 700 }}>
                    {isBuy ? '−' : '+'}{fmt(o.total)} 🪙
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                    <span style={{
                      color: GREEN, background: 'rgba(0,255,136,0.08)',
                      border: `1px solid ${GREEN}22`,
                      borderRadius: 3, ...MONO, fontSize: 9, padding: '2px 6px',
                    }}>
                      EXECUTED
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────────── */
type Tab = 'market' | 'watchlist' | 'portfolio' | 'leaderboard' | 'history';

export function PaperTrading({ authToken, onNavigate }: Props) {
  const { refreshBalance } = useAuth();
  const [showEarnCoins, setShowEarnCoins] = useState(false);
  /* data */
  const [stocks,      setStocks]      = useState<StockPrice[]>([]);
  const [isMarketOpen,setMarketOpen]  = useState(false);
  const [portfolio,   setPortfolio]   = useState<Portfolio | null>(null);
  const [orders,      setOrders]      = useState<TradeOrder[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myRank,      setMyRank]      = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState(Date.now());

  /* loading */
  const [stocksLoading,   setStocksLoading]   = useState(true);
  const [portfolioLoading,setPortfolioLoading] = useState(false);
  const [ordersLoading,   setOrdersLoading]   = useState(false);
  const [lbLoading,       setLbLoading]       = useState(false);
  const [refreshing,      setRefreshing]      = useState(false);

  /* ui */
  const [tab,        setTab]        = useState<Tab>('market');
  const [toasts,     setToasts]     = useState<Toast[]>([]);
  const [sellTarget, setSellTarget] = useState<PortfolioHolding | null>(null);
  const toastCounter = useRef(0);

  /* price flash tracking */
  const prevPricesRef = useRef<Map<string, number>>(new Map());
  const [priceFlashes, setPriceFlashes] = useState<Map<string, 'up' | 'down'>>(new Map());

  /** Merge new stock prices into state, detect changes, trigger flashes. */
  const mergeStocks = useCallback((incoming: StockPrice[]) => {
    if (!incoming.length) return;
    const prev = prevPricesRef.current;
    const flashes = new Map<string, 'up' | 'down'>();

    for (const s of incoming) {
      const old = prev.get(s.symbol);
      if (old !== undefined && old !== s.currentPrice) {
        flashes.set(s.symbol, s.currentPrice > old ? 'up' : 'down');
      }
      prev.set(s.symbol, s.currentPrice);
    }

    setStocks((cur) => {
      const map = new Map(cur.map(s => [s.symbol, s]));
      for (const s of incoming) map.set(s.symbol, s);
      return Array.from(map.values());
    });
    setLastUpdated(Date.now());

    if (flashes.size > 0) {
      setPriceFlashes(flashes);
      setTimeout(() => setPriceFlashes(new Map()), 900);
    }
  }, []);

  /* watchlist — persisted in localStorage */
  const [watchlist, setWatchlist] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('bb_watchlist') ?? '[]'); } catch { return []; }
  });
  const toggleWatchlist = useCallback((symbol: string) => {
    setWatchlist(prev => {
      const next = prev.includes(symbol) ? prev.filter(s => s !== symbol) : [...prev, symbol];
      localStorage.setItem('bb_watchlist', JSON.stringify(next));
      return next;
    });
  }, []);

  /* live IST clock */
  const [clock, setClock] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  /* ── Toast helper ─────────────────────────────────────────────────────── */
  function pushToast(msg: string, type: 'success' | 'error' = 'success') {
    const id = ++toastCounter.current;
    setToasts((ts) => [...ts.slice(-2), { id, message: msg, type }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 4200);
  }

  /* ── Fetchers ─────────────────────────────────────────────────────────── */
  const fetchStocks = useCallback(async () => {
    try {
      let res = await fetch('/api/stocks/all');
      let data: PopularResponse = await res.json();
      if (!data.ok || !data.stocks?.length) {
        res  = await fetch('/api/stocks/popular');
        data = await res.json();
      }
      if (data.ok && data.stocks?.length) {
        mergeStocks(data.stocks);
        setMarketOpen(data.isMarketOpen);
      }
    } catch {}
    finally { setStocksLoading(false); }
  }, [mergeStocks]);

  const fetchPortfolio = useCallback(async () => {
    if (!authToken) return;
    setPortfolioLoading(true);
    try {
      const res  = await fetch('/api/trading/portfolio', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (data.ok) setPortfolio(data.portfolio);
    } catch {}
    finally { setPortfolioLoading(false); }
  }, [authToken]);

  const fetchOrders = useCallback(async () => {
    if (!authToken) return;
    setOrdersLoading(true);
    try {
      const res  = await fetch('/api/trading/orders?limit=50', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (data.ok) setOrders(data.orders);
    } catch {}
    finally { setOrdersLoading(false); }
  }, [authToken]);

  const fetchLeaderboard = useCallback(async () => {
    setLbLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers.Authorization = `Bearer ${authToken}`;
      const res  = await fetch('/api/trading/leaderboard', { headers });
      const data = await res.json();
      if (data.ok) { setLeaderboard(data.leaderboard); setMyRank(data.myRank); }
    } catch {}
    finally { setLbLoading(false); }
  }, [authToken]);

  /* ── Effects ──────────────────────────────────────────────────────────── */
  useEffect(() => { fetchStocks(); }, [fetchStocks]);
  useEffect(() => {
    if (authToken) { fetchPortfolio(); fetchOrders(); }
  }, [authToken, fetchPortfolio, fetchOrders]);
  useEffect(() => {
    // 30s refresh when market is open (live prices); 60s when closed so users
    // still see backend cache updates from the 15-min cron without manual reload.
    const intervalMs = isMarketOpen ? 30_000 : 60_000;
    const iv = setInterval(fetchStocks, intervalMs);
    return () => clearInterval(iv);
  }, [isMarketOpen, fetchStocks]);
  useEffect(() => {
    if (tab === 'leaderboard' && leaderboard.length === 0) fetchLeaderboard();
    if (tab === 'history'     && orders.length === 0)      fetchOrders();
    if (tab === 'portfolio'   && !portfolio)                fetchPortfolio();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  /* ── Smart auto-refresh: keep active stocks live every 30s ───────────── */
  useEffect(() => {
    if (!isMarketOpen) return;
    const iv = setInterval(async () => {
      // Collect symbols that need refresh based on active tab
      const active = new Set<string>();

      if (tab === 'watchlist') {
        watchlist.forEach(s => active.add(s));
      }
      if (tab === 'portfolio' && portfolio?.holdings) {
        portfolio.holdings.forEach(h => active.add(h.symbol));
      }

      // Always refresh portfolio holdings (even on other tabs) so P&L stays live
      portfolio?.holdings?.forEach(h => active.add(h.symbol));

      // Add watchlist symbols too (they're cheap if cached)
      watchlist.forEach(s => active.add(s));

      if (active.size === 0) return;

      try {
        const res = await fetch('/api/stocks/batch-refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols: [...active].slice(0, 20) }),
        });
        const data = await res.json();
        if (data.ok && data.stocks?.length) {
          mergeStocks(data.stocks);
          setMarketOpen(data.isMarketOpen);
          // Re-fetch portfolio to recalculate P&L with fresh cached prices
          if (portfolio?.holdings?.length) fetchPortfolio();
        }
      } catch {}
    }, 30_000);

    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMarketOpen, tab, watchlist, portfolio?.holdings?.length, mergeStocks]);

  /* ── Fetch missing watchlist/portfolio stocks not in loaded list ──────── */
  useEffect(() => {
    const loaded = new Set(stocks.map(s => s.symbol));
    const missing: string[] = [];

    if (tab === 'watchlist') {
      watchlist.forEach(s => { if (!loaded.has(s)) missing.push(s); });
    }
    if (tab === 'portfolio' && portfolio?.holdings) {
      portfolio.holdings.forEach(h => { if (!loaded.has(h.symbol)) missing.push(h.symbol); });
    }

    if (missing.length === 0) return;

    (async () => {
      try {
        const res = await fetch('/api/stocks/batch-refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols: missing.slice(0, 20) }),
        });
        const data = await res.json();
        if (data.ok && data.stocks?.length) mergeStocks(data.stocks);
      } catch {}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, watchlist.length, portfolio?.holdings?.length]);

  /* ── Handlers ─────────────────────────────────────────────────────────── */
  async function refreshAll() {
    setRefreshing(true);
    await Promise.all([fetchStocks(), authToken ? fetchPortfolio() : Promise.resolve()]);
    setRefreshing(false);
  }

  function onTradeSuccess(msg: string) {
    pushToast(msg, 'success');
    fetchPortfolio();
    fetchOrders();
    refreshBalance();
  }

  function onSellFromPortfolio(h: PortfolioHolding) {
    setSellTarget(h);
  }

  /* ── IST clock display ────────────────────────────────────────────────── */
  const istNow  = new Date(clock.getTime() + 5.5 * 60 * 60 * 1000);
  const timeStr = istNow.toISOString().slice(11, 19);
  const istMins = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();
  const istDay  = istNow.getUTCDay();
  const isWeekday = istDay >= 1 && istDay <= 5;
  const marketPhase: 'open' | 'pre' | 'post' | 'closed' =
    isMarketOpen ? 'open'
    : isWeekday && istMins >= 525 && istMins < 555 ? 'pre'    // 8:45–9:15
    : isWeekday && istMins > 930 && istMins <= 960 ? 'post'   // 15:30–16:00
    : 'closed';
  const pnl     = portfolio?.totalPnlCoins    ?? 0;
  const pnlPct  = portfolio?.totalPnlPercent  ?? 0;
  const balance = portfolio?.virtualBalance   ?? 0;
  const portVal = portfolio?.currentValue     ?? 0;

  /* ── Sell overlay stock construction ─────────────────────────────────── */
  const sellStock = sellTarget
    ? (stocks.find((s) => s.symbol === sellTarget.symbol) ?? {
        symbol: sellTarget.symbol, companyName: sellTarget.companyName,
        currentPrice: sellTarget.currentPrice, change: 0, changePercent: 0,
        high: sellTarget.currentPrice, low: sellTarget.currentPrice,
        volume: 0, lastUpdated: Date.now(), isMarketOpen,
        staleData: sellTarget.isStalePrice,
      })
    : null;

  const TABS: [Tab, string, React.ReactNode][] = [
    ['market',      'MARKETS',      <BarChart2 size={13} />],
    ['watchlist',   'WATCHLIST',    <Star size={13} />],
    ['portfolio',   'MY PORTFOLIO', <Wallet size={13} />],
    ['leaderboard', 'LEADERBOARD',  <Trophy size={13} />],
    ['history',     'ORDERS',       <History size={13} />],
  ];

  return (
    <div style={{ background: BG, minHeight: '100vh', ...SANS }}>
      <style>{BB_CSS}</style>

      {/* ──────────── TOP BAR ──────────── */}
      <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: '12px 20px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap',
        }}>
          {/* Left */}
          <div>
            <div style={{ color: TEXT, ...SANS, fontSize: 17, fontWeight: 700 }}>
              📈 PAPER TRADING
            </div>
            <div style={{ color: MUTED, ...MONO, fontSize: 10, letterSpacing: '0.05em', marginTop: 1 }}>
              Virtual Trading · Real Markets
            </div>
          </div>

          {/* Center */}
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: DIM, ...MONO, fontSize: 9, letterSpacing: '0.1em', marginBottom: 2 }}>
                COIN BALANCE
              </div>
              <div style={{ color: GREEN, ...MONO, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>
                🪙 {fmt(balance)}
              </div>
              <div style={{ color: MUTED, ...MONO, fontSize: 10 }}>
                ₹{fmt(portVal)} equivalent
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 5 }}>
                <button
                  onClick={() => setShowEarnCoins((p) => !p)}
                  style={{
                    background: showEarnCoins ? GREEN + '20' : GREEN + '10',
                    border: `1px solid ${GREEN}35`, borderRadius: 5,
                    color: GREEN, ...MONO, fontSize: 9, fontWeight: 700,
                    padding: '3px 10px', cursor: 'pointer', letterSpacing: '0.06em',
                    transition: 'all 0.15s',
                  }}
                >
                  {showEarnCoins ? '✕ CLOSE' : '+ EARN COINS'}
                </button>
                <button
                  onClick={() => onNavigate?.('rewards')}
                  title="View coin history"
                  style={{
                    background: 'transparent',
                    border: `1px solid ${BORDER}`, borderRadius: 5,
                    color: MUTED, ...MONO, fontSize: 9, fontWeight: 700,
                    padding: '3px 10px', cursor: 'pointer', letterSpacing: '0.06em',
                    transition: 'all 0.15s',
                  }}
                >
                  📜 HISTORY
                </button>
              </div>
            </div>
            <div style={{ width: 1, height: 42, background: BORDER, flexShrink: 0 }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: DIM, ...MONO, fontSize: 9, letterSpacing: '0.1em', marginBottom: 2 }}>
                TOTAL P&L
              </div>
              <div style={{ color: pnl >= 0 ? GREEN : RED, ...MONO, fontSize: 18, fontWeight: 700 }}>
                {pnl >= 0 ? '+' : ''}{fmt(pnl)} coins
              </div>
              <div style={{ color: pnl >= 0 ? GREEN : RED, ...MONO, fontSize: 11 }}>
                {fmtPct(pnlPct)}
              </div>
            </div>
          </div>

          {/* Right */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: isMarketOpen ? 'rgba(0,255,136,0.07)' : 'rgba(255,68,68,0.06)',
              border: `1px solid ${isMarketOpen ? 'rgba(0,255,136,0.2)' : 'rgba(255,68,68,0.18)'}`,
              borderRadius: 8, padding: '8px 13px',
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: isMarketOpen ? GREEN : RED,
                display: 'inline-block', flexShrink: 0,
                animation: isMarketOpen ? 'bb-pulse-dot 1.4s ease-in-out infinite' : 'none',
              }} />
              <div>
                <div style={{
                  color: marketPhase === 'open' ? GREEN : marketPhase === 'pre' || marketPhase === 'post' ? '#ffaa00' : RED,
                  ...MONO, fontSize: 12, fontWeight: 700,
                }}>
                  {marketPhase === 'open' ? 'MARKET OPEN'
                    : marketPhase === 'pre' ? 'PRE-MARKET'
                    : marketPhase === 'post' ? 'POST-MARKET'
                    : 'MARKET CLOSED'}
                </div>
                <div style={{
                  color: marketPhase === 'open' ? GREEN : marketPhase === 'pre' || marketPhase === 'post' ? '#ffaa00' : RED,
                  ...MONO, fontSize: 11, opacity: 0.65,
                }}>
                  {timeStr} IST
                </div>
              </div>
            </div>
            <button
              onClick={refreshAll}
              disabled={refreshing}
              style={{
                background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6,
                color: MUTED, cursor: 'pointer', padding: '8px 10px',
                display: 'flex', alignItems: 'center',
              }}
            >
              <RefreshCw
                size={13}
                style={{ animation: refreshing ? 'bb-spin 0.8s linear infinite' : 'none' }}
              />
            </button>
          </div>
        </div>

        {/* Market closed banner */}
        {!isMarketOpen && !stocksLoading && (
          <div style={{
            marginTop: 10, background: 'rgba(255,68,68,0.04)',
            border: '1px solid rgba(255,68,68,0.12)', borderRadius: 6,
            padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 7,
          }}>
            <Clock size={10} color={RED} style={{ flexShrink: 0 }} />
            <span style={{ color: '#ff9090', ...MONO, fontSize: 10 }}>
              MARKET CLOSED — Trades execute at last known price · NSE/BSE Mon–Fri 9:15 AM–3:30 PM IST
            </span>
          </div>
        )}

        {/* Earn Coins expandable panel */}
        {showEarnCoins && (
          <div style={{
            marginTop: 10, background: '#080818',
            border: `1px solid ${GREEN}18`, borderRadius: 10,
            padding: '14px 16px',
            animation: 'bb-pop 0.25s ease',
          }}>
            <div style={{
              color: GREEN, ...MONO, fontSize: 11, letterSpacing: '0.08em',
              marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              🪙 WAYS TO EARN COINS
              <span style={{ color: MUTED, ...SANS, fontSize: 11, fontWeight: 400, letterSpacing: 0 }}>
                — Complete activities to grow your balance
              </span>
            </div>
            <EarnCoinsPanel onNavigate={(view) => { setShowEarnCoins(false); onNavigate?.(view); }} />
          </div>
        )}
      </div>

      {/* ──────────── TAB BAR ──────────── */}
      <div
        className="bb-scroll"
        style={{
          display: 'flex', background: CARD,
          borderBottom: `1px solid ${BORDER}`, overflowX: 'auto',
        }}
      >
        {TABS.map(([t, label, icon]) => (
          <button
            key={t}
            data-tab={t}
            onClick={() => setTab(t)}
            className="bb-tab-btn"
            style={{
              flex: '0 0 auto', padding: '11px 18px',
              background: 'none', border: 'none',
              borderBottom: `2px solid ${tab === t ? GREEN : 'transparent'}`,
              color: tab === t ? GREEN : MUTED,
              ...MONO, fontSize: 12, fontWeight: tab === t ? 700 : 400,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              whiteSpace: 'nowrap', letterSpacing: '0.05em',
            }}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {/* ──────────── TAB CONTENT ──────────── */}
      {tab === 'market' && (
        <MarketsTab
          stocks={stocks}
          loading={stocksLoading}
          portfolio={portfolio}
          authToken={authToken}
          lastUpdated={lastUpdated}
          onTradeSuccess={onTradeSuccess}
          watchlist={watchlist}
          onToggleWatch={toggleWatchlist}
          priceFlashes={priceFlashes}
          onNavigate={onNavigate}
        />
      )}

      {tab === 'watchlist' && (
        <WatchlistTab
          stocks={stocks}
          watchlist={watchlist}
          onToggle={toggleWatchlist}
          onGoToMarkets={() => setTab('market')}
          priceFlashes={priceFlashes}
        />
      )}

      {tab === 'portfolio' && (
        <PortfolioTab
          portfolio={portfolio}
          loading={portfolioLoading}
          authToken={authToken}
          onSell={onSellFromPortfolio}
          onGoToMarkets={() => setTab('market')}
        />
      )}

      {tab === 'leaderboard' && (
        <LeaderboardTab
          leaderboard={leaderboard}
          myRank={myRank}
          loading={lbLoading}
          onRefresh={fetchLeaderboard}
        />
      )}

      {tab === 'history' && (
        <OrdersTab
          orders={orders}
          loading={ordersLoading}
          authToken={authToken}
        />
      )}

      {/* ──────────── SELL OVERLAY (from Portfolio tab) ──────────── */}
      {sellTarget && sellStock && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 400,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        }}>
          <div
            onClick={() => setSellTarget(null)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.82)' }}
          />
          <div style={{
            position: 'relative', background: '#0a0a1a',
            borderTop: `1px solid ${BORDER}`, borderRadius: '14px 14px 0 0',
            maxHeight: '88vh', display: 'flex', flexDirection: 'column',
            animation: 'bb-slide-up 0.25s cubic-bezier(0.34,1.56,0.64,1)',
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: BORDER, margin: '10px auto 0' }} />
            <TradePanelContent
              key={`sell-${sellTarget.symbol}`}
              stock={sellStock}
              portfolio={portfolio}
              authToken={authToken}
              initialSide="SELL"
              onSuccess={(msg) => { onTradeSuccess(msg); setSellTarget(null); }}
              onClose={() => setSellTarget(null)}
              showClose
              onNavigate={onNavigate}
            />
          </div>
        </div>
      )}

      {/* ──────────── TOASTS ──────────── */}
      <ToastStack toasts={toasts} />
    </div>
  );
}

export default PaperTrading;
