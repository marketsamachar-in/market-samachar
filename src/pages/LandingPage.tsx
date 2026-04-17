import React, { useState, useEffect } from 'react';
import { AuthModal } from '../components/auth/AuthModal';
import { useAuth } from '../hooks/useAuth';
import { AppHeader } from '../components/AppHeader';
import { BottomNav, getHrefNavTabs } from '../components/BottomNav';

/* ─── Design tokens ──────────────────────────────────────────────────────────── */
const GREEN   = '#00ff88';
const BG      = '#07070e';
const CARD    = '#0d0d1e';
const BORDER  = '#1e1e2e';
const TEXT    = '#e8eaf0';
const MUTED   = '#888899';
const DIM     = '#444455';
const DANGER  = '#ff4444';
const WARNING = '#ff9f3b';
const INFO    = '#3b9eff';
const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif" };

const CAT_COLOR: Record<string, string> = {
  all: GREEN, indian: GREEN, companies: '#ffdd3b', global: '#3bffee',
  commodity: '#ff6b3b', crypto: '#b366ff', ipo: '#ff3bff',
  economy: INFO, banking: INFO, sebi: WARNING, rbi: INFO,
};

/* ─── Ticker data (fallback until live data loads) ───────────────────────────── */
const FALLBACK_TICKERS = [
  { label: 'NIFTY 50',   val: '—', ch: '—', up: true  },
  { label: 'SENSEX',     val: '—', ch: '—', up: true  },
  { label: 'BANK NIFTY', val: '—', ch: '—', up: false },
  { label: 'NIFTY IT',   val: '—', ch: '—', up: true  },
  { label: 'GOLD',       val: '—', ch: '—', up: true  },
  { label: 'CRUDE OIL',  val: '—', ch: '—', up: false },
  { label: 'USD/INR',    val: '—', ch: '—', up: false },
  { label: 'BTC/USD',    val: '—', ch: '—', up: true  },
];

const CATEGORIES = [
  { id: 'all',       label: 'ALL'           },
  { id: 'indian',    label: 'INDIAN MARKET' },
  { id: 'global',    label: 'GLOBAL MARKET' },
  { id: 'companies', label: 'COMPANIES'     },
  { id: 'economy',   label: 'ECONOMY'       },
  { id: 'ipo',       label: 'IPO'           },
  { id: 'crypto',    label: 'CRYPTO'        },
];

/* ─── Types ──────────────────────────────────────────────────────────────────── */
interface NewsItem {
  id: string;
  title: string;
  source: string;
  category: string;
  pubDate: string;
  pub_date?: string;          // legacy alias — some DB rows use snake_case
  contentSnippet?: string;
  content_snippet?: string;   // legacy alias
  link?: string;
}

interface StockPrice {
  symbol: string;
  name: string;
  current_price: number;
  change_percent: number;
}

interface PredictionItem {
  id: string;
  question: string;
  option_a: string;
  option_b: string;
  user_vote?: string | null;
  votes_a?: number;
  votes_b?: number;
}

interface LeaderRow {
  user_id: string;
  name: string;
  current_value_coins: number;
}

/* ─── Injected CSS ───────────────────────────────────────────────────────────── */
const HP_CSS = `
  @keyframes hp-ticker {
    0%   { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }
  .hp-ticker-inner {
    display: inline-flex;
    animation: hp-ticker 60s linear infinite;
  }
  .hp-ticker-inner:hover { animation-play-state: paused; }

  @keyframes hp-glow-pulse {
    0%, 100% { box-shadow: 0 0 12px rgba(0,255,136,0.35), 0 0 24px rgba(0,255,136,0.12); }
    50%       { box-shadow: 0 0 22px rgba(0,255,136,0.65), 0 0 44px rgba(0,255,136,0.22); }
  }
  .hp-cta-glow { animation: hp-glow-pulse 2.2s ease-in-out infinite; }

  @keyframes hp-dot-blink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.35; }
  }
  .hp-live-dot { animation: hp-dot-blink 1.4s ease-in-out infinite; }

  @keyframes hp-new-blink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.65; }
  }
  .hp-new-badge { animation: hp-new-blink 1.8s ease-in-out infinite; }

  @keyframes hp-shimmer {
    0%   { background-position: 200% center; }
    100% { background-position: -200% center; }
  }
  .hp-shimmer-bar {
    background: linear-gradient(90deg, #14142a 25%, #1e1e3a 50%, #14142a 75%);
    background-size: 200% 100%;
    animation: hp-shimmer 1.5s linear infinite;
    border-radius: 4px;
  }

  .hp-news-card { transition: background 0.15s ease, border-color 0.15s ease; }
  .hp-news-card:hover { background: #11112a !important; border-color: rgba(0,255,136,0.18) !important; }

  .hp-pill { transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease; }
  .hp-pill:hover { transform: translateY(-1px); border-color: rgba(0,255,136,0.3) !important; }

  .hp-tab-link { transition: color 0.15s ease; text-decoration: none; }
  .hp-tab-link:hover { color: #00ff88 !important; }

  .hp-btn { transition: opacity 0.15s ease, transform 0.15s ease; }
  .hp-btn:hover { opacity: 0.88; transform: translateY(-1px); }
  .hp-btn:active { transform: none; }

  .hp-action-btn { transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease; }
  .hp-action-btn:hover { background: rgba(0,255,136,0.06) !important; border-color: rgba(0,255,136,0.22) !important; color: #00ff88 !important; }

  .hp-sidebar {
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #1e1e2e transparent;
  }
  .hp-sidebar::-webkit-scrollbar { width: 3px; }
  .hp-sidebar::-webkit-scrollbar-track { background: transparent; }
  .hp-sidebar::-webkit-scrollbar-thumb { background: #1e1e2e; border-radius: 2px; }

  .hp-cat-scroll { scrollbar-width: none; }
  .hp-cat-scroll::-webkit-scrollbar { display: none; }

  @media (max-width: 1023px) {
    .hp-sidebar-col { display: none !important; }
    .hp-desktop-nav  { display: none !important; }
    .hp-desktop-only { display: none !important; }
    .hp-mobile-nav   { display: flex !important; }
  }
  @media (min-width: 1024px) {
    .hp-mobile-nav { display: none !important; }
    .hp-mobile-fab { display: none !important; }
  }
`;

/* ─── Helpers ────────────────────────────────────────────────────────────────── */
function timeAgo(s: string): string {
  try {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d.getTime())) return '';
    const m = Math.floor((Date.now() - d.getTime()) / 60_000);
    if (m < 0)  return 'just now';
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch { return ''; }
}

function isHot(pub: string): boolean {
  try {
    if (!pub) return false;
    const d = new Date(pub);
    if (isNaN(d.getTime())) return false;
    return Date.now() - d.getTime() < 30 * 60 * 1000;
  } catch { return false; }
}

/* ─── Ticker Bar ─────────────────────────────────────────────────────────────── */
function TickerBar() {
  const [tickers, setTickers] = useState(FALLBACK_TICKERS);
  useEffect(() => {
    let active = true;
    fetch('/api/market-data')
      .then(r => r.json())
      .then(data => {
        // API returns a flat array of ticker objects
        const arr = Array.isArray(data) ? data : Array.isArray(data?.tickers) ? data.tickers : null;
        if (!active || !arr || arr.length === 0) return;
        setTickers(arr.map((t: any) => ({
          label: t.name || t.symbol,
          val: typeof t.price === 'number' ? t.price.toLocaleString('en-IN') : String(t.price ?? '—'),
          ch: typeof t.changePercent === 'number' ? `${t.changePercent >= 0 ? '+' : ''}${t.changePercent.toFixed(2)}%` : '—',
          up: (t.changePercent ?? 0) >= 0,
        })));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  const items = [...tickers, ...tickers, ...tickers];
  return (
    <div style={{
      background: '#040408', borderBottom: `1px solid ${BORDER}`,
      padding: '0', overflow: 'hidden', whiteSpace: 'nowrap', height: 36,
      display: 'flex', alignItems: 'center',
    }}>
      <div className="hp-ticker-inner">
        {items.map((t, i) => (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '0 20px', borderRight: `1px solid ${BORDER}`,
          }}>
            <span style={{ color: DIM,  ...MONO, fontSize: '0.63rem', letterSpacing: '0.07em' }}>{t.label}</span>
            <span style={{ color: TEXT, ...MONO, fontSize: '0.72rem', fontWeight: 600 }}>{t.val}</span>
            <span style={{ color: t.up ? GREEN : DANGER, ...MONO, fontSize: '0.63rem', fontWeight: 700 }}>{t.ch}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Navbar (now delegated to AppHeader) ─────────────────────────────────── */
/* Navbar removed — AppHeader is used directly in LandingPage render */

/* ─── Feature Strip ──────────────────────────────────────────────────────────── */
const FEATURES = [
  { icon: '📰', label: 'LIVE NEWS',    tag: '50+ sources',    highlight: false, href: '/'             },
  { icon: '📈', label: 'PAPER TRADING', tag: 'Virtual Trading', highlight: true,  badge: 'NEW 🔥', href: '/paper-trading' },
  { icon: '🔮', label: 'FORECAST',     tag: 'Daily Predictions', highlight: false, href: '/predict'    },
  { icon: '🧠', label: 'MARKET QUIZ',  tag: 'IQ Quiz',        highlight: false, href: '/app'          },
  { icon: '🏆', label: 'LEADERBOARD',  tag: 'Top Traders',    highlight: false, href: '/app'          },
];

function FeatureStrip() {
  return (
    <div style={{
      height: 48, background: CARD, borderBottom: `1px solid #1a1a2e`,
      display: 'flex', alignItems: 'center',
    }}>
      <div
        className="hp-cat-scroll"
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0 clamp(0.75rem,3vw,2rem)',
          overflowX: 'auto', height: '100%', width: '100%',
          justifyContent: 'center',
        }}
      >
        {FEATURES.map(f => (
          <a
            key={f.label}
            href={f.href}
            className="hp-pill"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: f.highlight ? GREEN : 'rgba(255,255,255,0.04)',
              border: `1px solid ${f.highlight ? 'transparent' : BORDER}`,
              borderRadius: 20,
              padding: f.highlight ? '5px 14px' : '4px 11px',
              textDecoration: 'none', flexShrink: 0,
            }}
          >
            <span style={{ fontSize: '0.8rem', lineHeight: 1 }}>{f.icon}</span>
            <span style={{
              color: f.highlight ? '#000' : TEXT,
              ...MONO, fontSize: f.highlight ? '0.68rem' : '0.62rem',
              fontWeight: f.highlight ? 700 : 500,
              letterSpacing: '0.05em',
            }}>
              {f.label}
            </span>
            {f.badge && (
              <span
                className="hp-new-badge"
                style={{
                  background: '#e03030', color: '#fff',
                  ...MONO, fontSize: '0.52rem', fontWeight: 700,
                  padding: '1px 5px', borderRadius: 8, letterSpacing: '0.03em',
                }}
              >
                {f.badge}
              </span>
            )}
            <span style={{
              color: f.highlight ? 'rgba(0,0,0,0.55)' : DIM,
              ...MONO, fontSize: '0.56rem',
            }}>
              {f.tag}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

/* ─── News Card ──────────────────────────────────────────────────────────────── */
function NewsCard({ item }: { item: NewsItem }) {
  const [showSummary,   setShowSummary]   = useState(false);
  const [summary,       setSummary]       = useState<string | null>(null);
  const [loadingSummary,setLoadingSummary]= useState(false);

  const catColor = CAT_COLOR[item.category] ?? GREEN;
  const hot      = isHot(item.pubDate ?? item.pub_date ?? '');

  const handleAISummary = async () => {
    if (showSummary) { setShowSummary(false); return; }
    setShowSummary(true);
    if (!summary && !loadingSummary) {
      setLoadingSummary(true);
      try {
        const res  = await fetch('/api/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: item.link, lang: 'en' }),
        });
        const data = await res.json();
        setSummary(data.summary ?? 'Could not generate summary.');
      } catch {
        setSummary('Could not generate summary.');
      } finally {
        setLoadingSummary(false);
      }
    }
  };

  return (
    <article
      className="hp-news-card"
      style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderLeft: `3px solid ${catColor}`,
        borderRadius: 8,
        padding: '0.9rem 1rem 0.75rem',
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
        <span style={{
          color: catColor, background: `${catColor}14`,
          border: `1px solid ${catColor}28`,
          borderRadius: 3, ...MONO, fontSize: '0.57rem',
          letterSpacing: '0.1em', padding: '2px 7px',
          textTransform: 'uppercase', flexShrink: 0,
        }}>
          {item.category}
        </span>
        {hot && (
          <span style={{
            background: 'rgba(255,80,80,0.13)', color: '#ff7070',
            border: '1px solid rgba(255,80,80,0.22)',
            borderRadius: 3, ...MONO, fontSize: '0.54rem',
            letterSpacing: '0.07em', padding: '2px 6px', flexShrink: 0,
          }}>
            🔥 HOT
          </span>
        )}
        <span style={{ color: DIM, ...MONO, fontSize: '0.57rem', marginLeft: 'auto', flexShrink: 0 }}>
          {item.source} · {timeAgo(item.pubDate ?? item.pub_date ?? '')}
        </span>
      </div>

      {/* Headline */}
      <h3 style={{
        color: TEXT, ...SANS, fontSize: '0.92rem', fontWeight: 600,
        lineHeight: 1.45, margin: '0 0 6px',
        display: '-webkit-box', WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {item.title}
      </h3>

      {/* Snippet */}
      {(item.contentSnippet ?? item.content_snippet) && (
        <p style={{
          color: MUTED, ...SANS, fontSize: '0.78rem', lineHeight: 1.5,
          margin: '0 0 8px',
          display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {item.contentSnippet ?? item.content_snippet}
        </p>
      )}

      {/* AI Summary panel */}
      {showSummary && (
        <div style={{
          background: 'rgba(0,255,136,0.04)', border: `1px solid rgba(0,255,136,0.13)`,
          borderRadius: 6, padding: '0.6rem 0.75rem', margin: '6px 0',
          color: MUTED, ...SANS, fontSize: '0.78rem', lineHeight: 1.55,
        }}>
          {loadingSummary
            ? <span style={{ color: GREEN, ...MONO, fontSize: '0.63rem' }}>🤖 GENERATING SUMMARY…</span>
            : summary
          }
        </div>
      )}

      {/* Action row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        marginTop: 8, paddingTop: 8, borderTop: `1px solid ${BORDER}`,
      }}>
        <button
          onClick={handleAISummary}
          className="hp-action-btn"
          style={{
            background: 'none', border: `1px solid ${BORDER}`, borderRadius: 4,
            color: MUTED, ...MONO, fontSize: '0.59rem', letterSpacing: '0.04em',
            padding: '3px 8px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          🤖 AI SUMMARY {showSummary ? '▲' : '▼'}
        </button>
        {item.link && (
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="hp-action-btn"
            style={{
              background: 'none', border: `1px solid ${BORDER}`, borderRadius: 4,
              color: MUTED, ...MONO, fontSize: '0.59rem', letterSpacing: '0.04em',
              padding: '3px 8px', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none',
            }}
          >
            ↗ SOURCE
          </a>
        )}
      </div>
    </article>
  );
}

function NewsSkeletonCard() {
  return (
    <div style={{
      background: CARD, border: `1px solid ${BORDER}`,
      borderLeft: `3px solid ${BORDER}`, borderRadius: 8, padding: '0.9rem 1rem',
    }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div className="hp-shimmer-bar" style={{ height: 10, width: '18%' }} />
        <div className="hp-shimmer-bar" style={{ height: 10, width: '12%' }} />
        <div className="hp-shimmer-bar" style={{ height: 10, width: '22%', marginLeft: 'auto' }} />
      </div>
      <div className="hp-shimmer-bar" style={{ height: 13, width: '95%', marginBottom: 8 }} />
      <div className="hp-shimmer-bar" style={{ height: 13, width: '72%', marginBottom: 10 }} />
      <div className="hp-shimmer-bar" style={{ height: 10, width: '88%', marginBottom: 6 }} />
      <div className="hp-shimmer-bar" style={{ height: 10, width: '65%' }} />
    </div>
  );
}

/* ─── News Feed (left column) ────────────────────────────────────────────────── */
function NewsFeed() {
  const [news,        setNews]        = useState<NewsItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [category,    setCategory]    = useState('all');
  const [offset,      setOffset]      = useState(0);
  const [hasMore,     setHasMore]     = useState(true);
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  const [secsAgo,     setSecsAgo]     = useState(0);
  const LIMIT = 20;

  const fetchNews = async (cat: string, off: number, append = false) => {
    if (!append) setLoading(true); else setLoadingMore(true);
    try {
      const qs  = cat === 'all' ? '' : `category=${cat}&`;
      const res = await fetch(`/api/news?${qs}limit=${LIMIT}&offset=${off}`);
      const raw = await res.json();
      const items: NewsItem[] = Array.isArray(raw) ? raw : (raw.items ?? raw.news ?? []);
      if (append) setNews(prev => [...prev, ...items]);
      else { setNews(items); setLastUpdated(Date.now()); setSecsAgo(0); }
      setHasMore(items.length === LIMIT);
    } catch {
      if (!append) setNews([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Fetch on category change
  useEffect(() => { setOffset(0); fetchNews(category, 0, false); }, [category]);

  // Auto-refresh every 60 s
  useEffect(() => {
    const id = setInterval(() => fetchNews(category, 0, false), 60_000);
    return () => clearInterval(id);
  }, [category]);

  // Seconds-ago counter
  useEffect(() => {
    const id = setInterval(() => setSecsAgo(Math.floor((Date.now() - lastUpdated) / 1000)), 1000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  const handleLoadMore = () => {
    const next = offset + LIMIT;
    setOffset(next);
    fetchNews(category, next, true);
  };

  return (
    <div>
      {/* Category filter bar */}
      <div
        className="hp-cat-scroll"
        style={{
          display: 'flex', alignItems: 'flex-end', gap: 0,
          marginBottom: '0.9rem', overflowX: 'auto',
          borderBottom: `1px solid ${BORDER}`,
        }}
      >
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            style={{
              background: 'none', border: 'none',
              borderBottom: category === cat.id ? `2px solid ${GREEN}` : '2px solid transparent',
              marginBottom: -1,
              color: category === cat.id ? GREEN : MUTED,
              ...MONO, fontSize: '0.61rem', letterSpacing: '0.07em',
              padding: '7px 12px 9px', cursor: 'pointer',
              whiteSpace: 'nowrap', flexShrink: 0,
              transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            {cat.label}
          </button>
        ))}
        <span style={{
          marginLeft: 'auto', color: DIM, ...MONO, fontSize: '0.57rem',
          flexShrink: 0, padding: '0 4px 10px',
        }}>
          <span className="hp-live-dot" style={{
            display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
            background: GREEN, marginRight: 4, verticalAlign: 'middle',
          }} />
          Updated {secsAgo}s ago
        </span>
      </div>

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <NewsSkeletonCard key={i} />)
          : news.map(item => <React.Fragment key={item.id}><NewsCard item={item} /></React.Fragment>)
        }
      </div>

      {/* Load more */}
      {!loading && hasMore && (
        <button
          onClick={handleLoadMore}
          disabled={loadingMore}
          style={{
            width: '100%', marginTop: 14,
            background: 'none', border: `1px solid ${BORDER}`, borderRadius: 8,
            color: loadingMore ? DIM : MUTED,
            ...MONO, fontSize: '0.68rem', letterSpacing: '0.06em',
            padding: '11px', cursor: loadingMore ? 'default' : 'pointer',
            transition: 'border-color 0.15s, color 0.15s',
          }}
        >
          {loadingMore ? 'LOADING…' : 'LOAD MORE NEWS ↓'}
        </button>
      )}
    </div>
  );
}

/* ─── Paper Trading Widget ────────────────────────────────────────────────────── */
function PaperTradingWidget({ onSignIn }: { onSignIn: () => void }) {
  const { user } = useAuth();
  const [stocks,     setStocks]     = useState<StockPrice[]>([]);
  const [marketOpen, setMarketOpen] = useState(false);

  useEffect(() => {
    fetch('/api/stocks/popular')
      .then(r => r.json())
      .then(d => { const a = Array.isArray(d) ? d : (d.stocks ?? []); setStocks(a.slice(0, 6)); })
      .catch(() => {});
    fetch('/api/stocks/market-status')
      .then(r => r.json())
      .then(d => setMarketOpen(d.isOpen ?? false))
      .catch(() => {});
  }, []);

  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px', borderBottom: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ color: GREEN, ...MONO, fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em' }}>
          📈 PAPER TRADING
        </span>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: marketOpen ? 'rgba(0,255,136,0.1)' : 'rgba(255,68,68,0.1)',
          border: `1px solid ${marketOpen ? 'rgba(0,255,136,0.25)' : 'rgba(255,68,68,0.25)'}`,
          borderRadius: 10, padding: '2px 8px',
          color: marketOpen ? GREEN : DANGER, ...MONO, fontSize: '0.58rem', fontWeight: 600,
        }}>
          <span
            className={marketOpen ? 'hp-live-dot' : undefined}
            style={{ width: 5, height: 5, borderRadius: '50%', background: marketOpen ? GREEN : DANGER, display: 'inline-block' }}
          />
          {marketOpen ? 'MARKET OPEN' : 'MARKET CLOSED'}
        </span>
      </div>

      <div style={{ padding: '10px 14px' }}>
        <p style={{ color: MUTED, ...MONO, fontSize: '0.6rem', margin: '0 0 10px', letterSpacing: '0.04em' }}>
          Trade with Virtual Coins · 1 coin = ₹1
        </p>

        {/* 2×3 stock grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
          {stocks.length > 0
            ? stocks.map(s => (
                <div key={s.symbol} style={{
                  background: '#0a0a18', border: `1px solid ${BORDER}`,
                  borderRadius: 6, padding: '7px 8px',
                }}>
                  <div style={{ color: DIM, ...MONO, fontSize: '0.57rem', letterSpacing: '0.06em', marginBottom: 3 }}>
                    {s.symbol}
                  </div>
                  <div style={{ color: TEXT, ...MONO, fontSize: '0.78rem', fontWeight: 600 }}>
                    ₹{(s.current_price ?? 0).toLocaleString('en-IN')}
                  </div>
                  <div style={{ color: (s.change_percent ?? 0) >= 0 ? GREEN : DANGER, ...MONO, fontSize: '0.62rem', fontWeight: 600 }}>
                    {(s.change_percent ?? 0) >= 0 ? '+' : ''}{(s.change_percent ?? 0).toFixed(2)}%
                  </div>
                </div>
              ))
            : Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="hp-shimmer-bar" style={{ height: 60, borderRadius: 6 }} />
              ))
          }
        </div>

        {/* CTA */}
        <a
          href="/paper-trading"
          className="hp-btn hp-cta-glow"
          style={{
            display: 'block', textAlign: 'center', boxSizing: 'border-box',
            background: GREEN, borderRadius: 8, padding: '11px',
            color: '#000', ...MONO, fontSize: '0.78rem', fontWeight: 700,
            letterSpacing: '0.07em', textDecoration: 'none', border: 'none',
          }}
        >
          START TRADING →
        </a>

        {!user && (
          <button
            onClick={onSignIn}
            style={{
              background: 'none', border: 'none', width: '100%',
              color: MUTED, ...MONO, fontSize: '0.6rem',
              cursor: 'pointer', marginTop: 8, padding: '4px', textAlign: 'center',
              letterSpacing: '0.03em',
            }}
          >
            Get 1,000 coins FREE on signup →
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Prediction Widget ───────────────────────────────────────────────────────── */
function PredictionWidget() {
  const { user, session } = useAuth();
  const [pred,    setPred]    = useState<PredictionItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [voted,   setVoted]   = useState<string | null>(null);
  const [voting,  setVoting]  = useState(false);

  useEffect(() => {
    const headers: Record<string, string> = {};
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    fetch('/api/predictions/today', { headers })
      .then(r => r.json())
      .then(d => {
        const preds: PredictionItem[] = Array.isArray(d) ? d : (d.predictions ?? []);
        if (preds.length > 0) {
          setPred(preds[0]);
          if (preds[0].user_vote) setVoted(preds[0].user_vote);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session]);

  const handleVote = async (answer: 'A' | 'B') => {
    if (!user || !pred || voted || voting) return;
    setVoting(true);
    try {
      const res = await fetch(`/api/predictions/${pred.id}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ answer }),
      });
      if (res.ok) setVoted(answer);
    } catch {}
    setVoting(false);
  };

  const totalVotes = (pred?.votes_a ?? 0) + (pred?.votes_b ?? 0);
  const pctA = totalVotes ? Math.round(((pred?.votes_a ?? 0) / totalVotes) * 100) : 50;
  const pctB = 100 - pctA;

  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BORDER}` }}>
        <span style={{ color: '#b366ff', ...MONO, fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em' }}>
          🔮 TODAY'S PREDICTION
        </span>
      </div>

      <div style={{ padding: '10px 14px' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="hp-shimmer-bar" style={{ height: 11, width: '90%' }} />
            <div className="hp-shimmer-bar" style={{ height: 11, width: '70%' }} />
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <div className="hp-shimmer-bar" style={{ height: 40, flex: 1 }} />
              <div className="hp-shimmer-bar" style={{ height: 40, flex: 1 }} />
            </div>
          </div>
        ) : !pred ? (
          <div style={{ textAlign: 'center', padding: '1.2rem 0' }}>
            <div style={{ fontSize: '1.8rem', marginBottom: 8 }}>🔮</div>
            <div style={{ color: MUTED, ...MONO, fontSize: '0.63rem', letterSpacing: '0.08em' }}>
              PREDICTION DROPS AT 9:00 AM
            </div>
            <div style={{ color: DIM, ...MONO, fontSize: '0.57rem', marginTop: 4 }}>
              Mon–Fri · Earn +5 coins for voting
            </div>
          </div>
        ) : (
          <>
            <p style={{ color: TEXT, ...SANS, fontSize: '0.82rem', lineHeight: 1.45, margin: '0 0 10px', fontWeight: 500 }}>
              {pred.question}
            </p>

            {voted ? (
              <>
                {[
                  { answer: 'A', label: pred.option_a, pct: pctA, icon: '📈' },
                  { answer: 'B', label: pred.option_b, pct: pctB, icon: '📉' },
                ].map(opt => (
                  <div key={opt.answer} style={{ position: 'relative', marginBottom: 6 }}>
                    <div style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0, width: `${opt.pct}%`,
                      background: voted === opt.answer ? 'rgba(0,255,136,0.11)' : 'rgba(255,255,255,0.03)',
                      borderRadius: 6, transition: 'width 0.5s ease',
                    }} />
                    <div style={{
                      position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      border: `1px solid ${voted === opt.answer ? 'rgba(0,255,136,0.28)' : BORDER}`,
                      borderRadius: 6, padding: '7px 10px',
                    }}>
                      <span style={{ color: voted === opt.answer ? GREEN : MUTED, ...MONO, fontSize: '0.67rem' }}>
                        {opt.icon} {opt.label}
                      </span>
                      <span style={{ color: voted === opt.answer ? GREEN : DIM, ...MONO, fontSize: '0.65rem', fontWeight: 700 }}>
                        {opt.pct}%
                      </span>
                    </div>
                  </div>
                ))}
                <div style={{ color: DIM, ...MONO, fontSize: '0.57rem', textAlign: 'center', marginTop: 6 }}>
                  {totalVotes} community votes · +5 coins earned
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 7 }}>
                  {[
                    { answer: 'A' as const, label: pred.option_a, icon: '📈', color: GREEN   },
                    { answer: 'B' as const, label: pred.option_b, icon: '📉', color: DANGER  },
                  ].map(opt => (
                    <button
                      key={opt.answer}
                      onClick={() => user ? handleVote(opt.answer) : undefined}
                      disabled={voting || !user}
                      style={{
                        flex: 1, background: `${opt.color}0e`,
                        border: `1px solid ${opt.color}38`, borderRadius: 8,
                        padding: '10px 6px', color: opt.color,
                        ...MONO, fontSize: '0.67rem', fontWeight: 600,
                        cursor: user ? 'pointer' : 'default', letterSpacing: '0.03em',
                        opacity: voting ? 0.6 : 1, transition: 'background 0.15s',
                      }}
                    >
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>
                {!user && (
                  <div style={{ color: DIM, ...MONO, fontSize: '0.58rem', textAlign: 'center', marginTop: 8 }}>
                    Sign in to vote · +5 coins for participating
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Quiz Widget ────────────────────────────────────────────────────────────── */
function QuizWidget() {
  const { profile } = useAuth();
  const streak = profile?.streak_count ?? 0;

  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BORDER}` }}>
        <span style={{ color: '#b366ff', ...MONO, fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em' }}>
          🧠 QUIZ OF THE DAY
        </span>
      </div>
      <div style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ color: WARNING, ...MONO, fontSize: '0.68rem', fontWeight: 600 }}>
            🔥 {streak > 0 ? `${streak} day streak` : 'Start your streak!'}
          </span>
          <span style={{
            background: 'rgba(0,255,136,0.09)', border: `1px solid rgba(0,255,136,0.2)`,
            borderRadius: 10, padding: '2px 8px',
            color: GREEN, ...MONO, fontSize: '0.57rem',
          }}>
            up to 50 coins
          </span>
        </div>
        <p style={{ color: MUTED, ...SANS, fontSize: '0.78rem', lineHeight: 1.45, margin: '0 0 10px' }}>
          5 market questions · ELO-based IQ score · Daily leaderboard.
        </p>
        <a
          href="/app"
          style={{
            display: 'block', boxSizing: 'border-box', width: '100%',
            background: 'rgba(179,102,255,0.1)', border: `1px solid rgba(179,102,255,0.28)`,
            borderRadius: 8, padding: '9px',
            color: '#b366ff', ...MONO, fontSize: '0.72rem', fontWeight: 700,
            textAlign: 'center', textDecoration: 'none', letterSpacing: '0.05em',
            transition: 'background 0.15s',
          }}
        >
          TAKE TODAY'S QUIZ →
        </a>
      </div>
    </div>
  );
}

/* ─── Leaderboard Widget ─────────────────────────────────────────────────────── */
function LeaderboardWidget() {
  const [leaders, setLeaders] = useState<LeaderRow[]>([]);

  useEffect(() => {
    fetch('/api/trading/leaderboard')
      .then(r => r.json())
      .then(d => { const a = Array.isArray(d) ? d : (d.leaderboard ?? []); setLeaders(a.slice(0, 3)); })
      .catch(() => {});
  }, []);

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BORDER}` }}>
        <span style={{ color: WARNING, ...MONO, fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em' }}>
          🏆 TOP TRADERS THIS WEEK
        </span>
      </div>
      <div style={{ padding: '4px 14px 0' }}>
        {leaders.length === 0
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="hp-shimmer-bar" style={{ height: 32, borderRadius: 6, margin: '8px 0' }} />
            ))
          : leaders.map((l, i) => (
              <div key={l.user_id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 0',
                borderBottom: i < leaders.length - 1 ? `1px solid ${BORDER}` : 'none',
              }}>
                <span style={{ fontSize: '1rem', flexShrink: 0 }}>{medals[i]}</span>
                <span style={{ color: TEXT, ...SANS, fontSize: '0.8rem', flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {l.name || 'Anonymous'}
                </span>
                <span style={{ color: GREEN, ...MONO, fontSize: '0.7rem', fontWeight: 600, flexShrink: 0 }}>
                  🪙 {(l.current_value_coins ?? 0).toLocaleString('en-IN')}
                </span>
              </div>
            ))
        }
        <a href="/app" style={{
          display: 'block', textAlign: 'center',
          color: WARNING, ...MONO, fontSize: '0.6rem', letterSpacing: '0.07em',
          textDecoration: 'none', padding: '9px 0',
        }}>
          VIEW FULL LEADERBOARD →
        </a>
      </div>
    </div>
  );
}

/* ─── Mobile Bottom Nav + FAB removed — using shared BottomNav component ─── */

/* ─── HEADER_HEIGHT constant ─────────────────────────────────────────────────── */
const HEADER_HEIGHT = 36 + 56 + 48; // ticker + navbar + feature strip = 140px

/* ─── Main Export ────────────────────────────────────────────────────────────── */
export function LandingPage() {
  const [showAuth, setShowAuth] = useState(false);
  useEffect(() => { document.title = "Market Samachar — Live Market News · India & Global"; }, []);

  return (
    <>
      <style>{HP_CSS}</style>

      {/* ── Fixed header stack ── */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000 }}>
        <TickerBar />
        <AppHeader
          navTabs={(() => {
            const active = window.location.pathname;
            return [
              { label: 'NEWS',    href: '/',             active: active === '/'                    },
              { label: 'TRADE',   href: '/paper-trading', active: active.startsWith('/paper-trading') },
              { label: 'PREDICT', href: '/predict',      active: active.startsWith('/predict')      },
              { label: 'QUIZ',    href: '/app',          active: active.startsWith('/app')          },
              { label: 'REWARDS', href: '/rewards',      active: active.startsWith('/rewards')      },
            ];
          })()}
          onSignIn={() => setShowAuth(true)}
        />
        <FeatureStrip />
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ paddingTop: HEADER_HEIGHT, paddingBottom: 72, background: BG, minHeight: '100vh' }}>
        <div style={{
          maxWidth: 1300, margin: '0 auto',
          padding: '16px clamp(0.75rem,2.5vw,1.5rem)',
          display: 'flex', gap: 16, alignItems: 'flex-start',
        }}>
          {/* Left: news feed — flex 65 */}
          <div style={{ flex: '65 65 0', minWidth: 0 }}>
            <NewsFeed />
          </div>

          {/* Right: sidebar — flex 35, sticky */}
          <div
            className="hp-sidebar-col hp-sidebar"
            style={{
              flex: '35 35 0', minWidth: 0,
              position: 'sticky', top: HEADER_HEIGHT + 16,
              maxHeight: `calc(100vh - ${HEADER_HEIGHT + 32}px)`,
            }}
          >
            <PaperTradingWidget onSignIn={() => setShowAuth(true)} />
            <PredictionWidget />
            <QuizWidget />
            <LeaderboardWidget />
          </div>
        </div>
      </div>

      {/* ── Bottom nav (all screens — hides on desktop via BottomNav CSS) ── */}
      <BottomNav tabs={getHrefNavTabs(window.location.pathname)} />

      {/* ── Auth modal ── */}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  );
}
