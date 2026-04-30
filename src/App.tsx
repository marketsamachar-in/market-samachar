import React, { useState, useEffect } from "react";
import { MarketQuiz } from "./components/quiz";
import { AuthModal } from "./components/auth";
import { WeeklyReportCard } from "./components/reports";
import { ArticlePopupModal } from "./components/news/ArticlePopupModal";
import { SourcePopup } from "./components/news/SourcePopup";
import { StoryTimelinePopup } from "./components/news/StoryTimelinePopup";
import { CommunityPollPopup } from "./components/news/CommunityPollPopup";
import { ShareCardPopup } from "./components/news/ShareCardPopup";
import { MysteryStockGame } from "./components/games/MysteryStockGame";
import { CertificateModal, CertificateProfileCard } from "./components/certificate";
import { AddToHomeScreen } from "./components/pwa/AddToHomeScreen";
import type { CertificateData } from "./lib/certificate";
import { useAuth } from "./hooks/useAuth";
import PaperTrading from "./pages/PaperTrading";
import Pulse from "./pages/Pulse";
import Chartguessr     from "./pages/Chartguessr";
import ComboCard       from "./pages/ComboCard";
import MarketMove      from "./pages/MarketMove";
import QuizMaster      from "./pages/QuizMaster";
import DalalStreetT20  from "./pages/DalalStreetT20";
import RewardsHub from "./pages/RewardsHub";
import { MarketForecast } from "./components/MarketForecast";
import IPOPredictions from "./components/IPOPredictions";
import NewsImpactQuiz from "./components/NewsImpactQuiz";
import MarketMovers from "./components/MarketMovers";
import { AppHeader } from "./components/AppHeader";
import { BottomNav, getOnClickNavTabs } from "./components/BottomNav";
import { Sparkline } from "./components/Sparkline";
import {
  RefreshCw,
  Clock,
  ExternalLink,
  Activity,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Zap,
  Radio,
  Globe2,
  Wifi,
  Newspaper,
  TrendingUp as TradingIcon,
  Target,
  Star,
  Brain,
  ChevronRight,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import DOMPurify from "dompurify";
import { getTitleFromIQ } from "./lib/iq-calculator";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Strip dangerous HTML tags/attributes to prevent XSS from RSS content. */
function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "style", "link", "meta", "base"],
    FORBID_ATTR: ["srcdoc"],
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface NewsItem {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  source: string;
  category: string;
  contentSnippet?: string;
  content?: string;

}

interface RegulatoryItem {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  source: "sebi" | "rbi";
}

interface MarketQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  high: number | null;
  low: number | null;
}

function fmtPrice(sym: string, val: number): string {
  if (!val) return "—";
  if (sym === "GC=F" || sym === "CL=F")
    return "$" + val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (sym === "USDINR=X") return val.toFixed(2);
  return val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtChange(sym: string, val: number): string {
  const sign = val >= 0 ? "+" : "";
  if (sym === "GC=F" || sym === "CL=F") return sign + val.toFixed(2);
  if (sym === "USDINR=X") return sign + val.toFixed(4);
  return sign + val.toFixed(2);
}

function fmtPct(val: number): string {
  return (val >= 0 ? "+" : "") + val.toFixed(2) + "%";
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: "all",       label: "All News",         color: "#00ff88" },
  { id: "indian",    label: "Indian Market",     color: "#00ff88" },
  { id: "global",    label: "Global Market",     color: "#00aaff" },
  { id: "companies", label: "Companies",         color: "#ff6600" },
  { id: "economy",   label: "Economy & Policy",  color: "#ffdd00" },
  { id: "banking",   label: "Banking & Finance", color: "#aa88ff" },
  { id: "commodity", label: "Commodity",         color: "#ff4488" },
  { id: "ipo",       label: "IPO",               color: "#00ffdd" },
  { id: "crypto",    label: "Crypto",            color: "#ff8800" },
];

const getCatColor = (id: string) => CATEGORIES.find((c) => c.id === id)?.color ?? "#00ff88";
const getCatLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? id;

const FALLBACK_TICKER_DATA = [
  { symbol: "NIFTY 50", price: "—", pct: "—", up: true },
  { symbol: "SENSEX",   price: "—", pct: "—", up: true },
  { symbol: "BANKNIFTY", price: "—", pct: "—", up: false },
  { symbol: "GOLD",     price: "—", pct: "—", up: true },
];

const FALLBACK_MARKET_CARDS = [
  { name: "NIFTY 50",   symbol: "^NSEI",    price: "—", change: "—", pct: "—", up: true,  high: "—", low: "—" },
  { name: "SENSEX",     symbol: "^BSESN",   price: "—", change: "—", pct: "—", up: true,  high: "—", low: "—" },
  { name: "BANK NIFTY", symbol: "^NSEBANK", price: "—", change: "—", pct: "—", up: false, high: "—", low: "—" },
  { name: "GOLD (MCX)", symbol: "GC=F",     price: "—", change: "—", pct: "—", up: true,  high: "—", low: "—" },
];


// ─── Shared style helpers ─────────────────────────────────────────────────────

const MONO: React.CSSProperties    = { fontFamily: "'DM Mono', monospace" };
const SANS: React.CSSProperties    = { fontFamily: "'DM Sans', sans-serif" };
const CARD_BG: React.CSSProperties = { background: "#0d0d1e", border: "1px solid #1a1a2e" };
const DIM    = "#556688";
const DIMMER = "#334466";
const TEXT   = "#e8eaf0";
const SUBTEXT = "#8899aa";

// ─── MarketCard ───────────────────────────────────────────────────────────────

const MarketCard: React.FC<{ card: typeof FALLBACK_MARKET_CARDS[0] }> = ({ card }) => (
  <div
    style={{
      background: "#0d0d1e",
      border: `1px solid ${card.up ? "#00ff8830" : "#ff224430"}`,
    }}
    className="rounded-lg p-4"
  >
    <div className="flex items-start justify-between mb-2">
      <span style={{ color: DIM, ...MONO }} className="text-[10px] uppercase tracking-widest">
        {card.name}
      </span>
      {card.up
        ? <TrendingUp   className="w-3.5 h-3.5" style={{ color: "#00ff88" }} />
        : <TrendingDown className="w-3.5 h-3.5" style={{ color: "#ff2244" }} />
      }
    </div>
    <div className="flex items-end justify-between mb-1 gap-2">
      <div style={{ color: TEXT, ...MONO }} className="text-lg font-medium">
        {card.price}
      </div>
      {card.symbol && (
        <Sparkline
          symbol={card.symbol}
          width={70}
          height={22}
          color={card.up ? "#00ff88" : "#ff4466"}
        />
      )}
    </div>
    <div style={{ color: card.up ? "#00ff88" : "#ff2244", ...MONO }} className="text-xs font-medium">
      {card.change} ({card.pct})
    </div>
    <div className="flex justify-between mt-2 pt-2" style={{ borderTop: "1px solid #1a1a2e" }}>
      <span style={{ color: DIMMER, ...MONO }} className="text-[10px]">H: {card.high}</span>
      <span style={{ color: DIMMER, ...MONO }} className="text-[10px]">L: {card.low}</span>
    </div>
  </div>
);

// ─── NewsCard ─────────────────────────────────────────────────────────────────

const NewsCard: React.FC<{
  item: NewsItem;
  isSignedIn?: boolean;
  onSignIn?: () => void;
  authToken?: string | null;
}> = ({ item, isSignedIn, onSignIn, authToken }) => {
  const [activePopup, setActivePopup] = useState<'timeline' | 'poll' | 'share' | 'source' | null>(null);

  const catColor = getCatColor(item.category);
  const catLabel = getCatLabel(item.category);

  const isHot = (() => {
    try { return Date.now() - new Date(item.pubDate).getTime() < 60 * 60 * 1000; }
    catch { return false; }
  })();

  const btnStyle = (accent: string): React.CSSProperties => ({
    background: 'none',
    border: `1px solid ${accent}30`,
    color: accent,
    borderRadius: 5,
    cursor: 'pointer',
    padding: '4px 8px',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    ...MONO,
    fontSize: 10,
    letterSpacing: '0.04em',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap' as const,
  });

  return (
    <div
      style={{ background: "#0d0d1e", borderLeft: `3px solid ${catColor}` }}
      className="rounded-r-lg p-4 mb-3 transition-all hover:brightness-110"
    >
      {/* Meta row */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span
          style={{ color: catColor, borderColor: `${catColor}40`, ...MONO }}
          className="text-[10px] border px-2 py-0.5 rounded-sm uppercase tracking-wider"
        >
          {catLabel}
        </span>

        {isHot && (
          <span
            style={{ background: "#ff2244", ...MONO }}
            className="text-[10px] font-bold px-2 py-0.5 rounded-sm text-white uppercase tracking-wider flex items-center gap-1"
          >
            <Zap className="w-2.5 h-2.5" />HOT
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <span
            style={{ background: "#1a1a2e", border: "1px solid #2a2a4e", color: SUBTEXT, ...MONO }}
            className="px-2 py-0.5 rounded-sm text-[10px]"
          >
            {item.source}
          </span>
          <Clock className="w-3 h-3" style={{ color: DIM }} />
          <span style={{ color: DIM, ...MONO }} className="text-[11px]">
            {(() => { try { const d = new Date(item.pubDate); return isNaN(d.getTime()) ? "" : formatDistanceToNow(d, { addSuffix: true }); } catch { return ""; } })()}
          </span>
        </div>
      </div>

      {/* Title */}
      <h3 style={{ color: TEXT, ...SANS }} className="text-sm font-medium leading-snug mb-2">
        {item.title}
      </h3>

      {/* Snippet */}
      {item.content && (
        <div
          style={{ color: DIM }}
          className="text-xs leading-relaxed mb-3 line-clamp-2"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.content) }}
        />
      )}
      {!item.content && (() => {
        const snip = (item.contentSnippet ?? '').trim();
        if (snip.length < 40) return null;
        return (
          <p style={{ color: DIM }} className="text-xs leading-relaxed mb-3 line-clamp-2">
            {snip}
          </p>
        );
      })()}

      {/* 4-button action row — 2×2 on phones, 1×4 on sm+ */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 mt-2"
        style={{ borderTop: "1px solid #1a1a2e" }}
      >
        <button onClick={() => setActivePopup('timeline')} style={btnStyle('#3bffee')} className="hover:brightness-125 justify-center">
          📖 Timeline
        </button>
        <button onClick={() => isSignedIn ? setActivePopup('poll') : onSignIn?.()} style={btnStyle('#ff9f3b')} className="hover:brightness-125 justify-center">
          🗳️ Poll +10
        </button>
        <button onClick={() => setActivePopup('share')} style={btnStyle('#ff6bff')} className="hover:brightness-125 justify-center">
          🔗 Share +25
        </button>
        <button onClick={() => setActivePopup('source')} style={btnStyle('#ffdd3b')} className="hover:brightness-125 justify-center">
          <ExternalLink className="w-3 h-3" /> Source
        </button>
      </div>

      {/* Popup modals */}
      <ArticlePopupModal isOpen={activePopup === 'timeline'} onClose={() => setActivePopup(null)} title="STORY TIMELINE" type="story-timeline">
        <StoryTimelinePopup currentId={item.id} currentTitle={item.title} category={item.category} />
      </ArticlePopupModal>

      <ArticlePopupModal isOpen={activePopup === 'poll'} onClose={() => setActivePopup(null)} title="COMMUNITY POLL" type="community-poll">
        <CommunityPollPopup
          articleId={item.id}
          articleTitle={item.title}
          isSignedIn={!!isSignedIn}
          authToken={authToken ?? null}
        />
      </ArticlePopupModal>

      <ArticlePopupModal isOpen={activePopup === 'share'} onClose={() => setActivePopup(null)} title="SHARE ARTICLE" type="share-card">
        <ShareCardPopup
          articleId={item.id}
          articleTitle={item.title}
          source={item.source}
          category={item.category}
          pubDate={item.pubDate ?? ''}
          contentSnippet={item.contentSnippet ?? (item as any).content_snippet ?? ''}
          isSignedIn={!!isSignedIn}
          authToken={authToken ?? null}
        />
      </ArticlePopupModal>

      <ArticlePopupModal isOpen={activePopup === 'source'} onClose={() => setActivePopup(null)} title="SOURCE ARTICLE" type="source">
        <SourcePopup item={item} />
      </ArticlePopupModal>
    </div>
  );
};

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const { user, profile, investorIq, session } = useAuth();

  // ── URL ↔ view sync ──────────────────────────────────────────────────────
  type ViewType = "news" | "trading" | "pulse" | "move" | "quiz-master" | "combo" | "chartguessr" | "t20" | "rewards";

  function pathToView(p: string): ViewType {
    if (p.startsWith("/paper-trading")) return "trading";
    if (p.startsWith("/pulse"))         return "pulse";
    if (p.startsWith("/market-move"))   return "move";
    if (p.startsWith("/quiz-master"))   return "quiz-master";
    if (p.startsWith("/combo"))         return "combo";
    if (p.startsWith("/chartguessr"))   return "chartguessr";
    if (p.startsWith("/t20"))           return "t20";
    if (p.startsWith("/rewards"))       return "rewards";
    return "news";
  }

  function viewToPath(v: ViewType): string {
    switch (v) {
      case "trading":     return "/paper-trading";
      case "pulse":       return "/pulse";
      case "move":        return "/market-move";
      case "quiz-master": return "/quiz-master";
      case "combo":       return "/combo";
      case "chartguessr": return "/chartguessr";
      case "t20":         return "/t20";
      case "rewards":     return "/rewards";
      default:            return "/";
    }
  }

  const [view, setView] = useState<ViewType>(() => pathToView(window.location.pathname));

  // Dynamic page title per tab
  const TAB_TITLES: Record<ViewType, string> = {
    news:        "Market Samachar — Live News",
    trading:     "Paper Trading — Virtual Markets",
    pulse:       "Pulse — Bull/Bear News Swiper",
    move:        "Market Move — Live Indian Market Activity",
    "quiz-master": "Quiz Master — Infinite Market Quiz",
    combo:       "Combo Card — Daily 5-Question Lottery",
    chartguessr: "Chartguessr — Guess the Stock",
    t20:         "Dalal Street T20 — Cricket-Themed Stock Game",
    rewards:     "Rewards Hub — Market Samachar",
  };
  useEffect(() => { document.title = TAB_TITLES[view]; }, [view]);

  const navigate = (v: ViewType) => {
    setView(v);
    const target = viewToPath(v);
    if (window.location.pathname !== target) {
      window.history.pushState({}, "", target);
    }
  };

  // Handle browser back/forward
  useEffect(() => {
    const onPop = () => setView(pathToView(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // Auto-claim daily login reward when authenticated
  const loginClaimRef = React.useRef(false);
  useEffect(() => {
    const token = session?.access_token;
    if (!token || loginClaimRef.current) return;
    loginClaimRef.current = true;
    fetch("/api/rewards/login", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }, [session?.access_token]);

  const [news,         setNews]         = useState<NewsItem[]>([]);
  const [lastFetchTime,setLastFetchTime]= useState<number>(0);
  const [loading,      setLoading]      = useState(true);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [refreshing,   setRefreshing]   = useState(false);
  const [category,     setCategory]     = useState<string>("all");
  const [offset,       setOffset]       = useState(0);
  const [total,        setTotal]        = useState(0);
  const [marketData,      setMarketData]      = useState<MarketQuote[]>([]);
  const [regulatoryItems, setRegulatoryItems] = useState<RegulatoryItem[]>([]);
  const [showAuthModal,    setShowAuthModal]    = useState(false);
  const [showMysteryStock,    setShowMysteryStock]    = useState(false);
  const [certModalData,    setCertModalData]    = useState<CertificateData | null>(null);
  const PAGE_SIZE = 30;

  // ── Market data polling ───────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/market-data");
        if (res.ok) setMarketData(await res.json());
      } catch { /* ignore — keep showing last data */ }
    };
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, []);

  // ── Regulatory feed (SEBI + RBI) ─────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/regulatory");
        if (res.ok) setRegulatoryItems(await res.json());
      } catch { /* ignore */ }
    };
    load();
    const iv = setInterval(load, 10 * 60_000); // refresh every 10 min
    return () => clearInterval(iv);
  }, []);

  // ── News fetching (all existing logic preserved) ──────────────────────────
  const fetchNews = async (cat = category, off = 0, append = false) => {
    if (!append) setLoading(true);
    try {
      const res  = await fetch(`/api/news?category=${cat}&limit=${PAGE_SIZE}&offset=${off}`);
      const data = await res.json();
      const items = data.items as NewsItem[];
      if (!append) setLastFetchTime(data.lastFetchTime);
      setTotal(data.total);
      setNews((prev) => (append ? [...prev, ...items] : items));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const loadMore = async () => {
    const next = offset + PAGE_SIZE;
    setLoadingMore(true);
    setOffset(next);
    await fetchNews(category, next, true);
    setLoadingMore(false);
  };

  const forceRefresh = async () => {
    setRefreshing(true);
    setOffset(0);
    try {
      await fetch("/api/news/refresh", { method: "POST" });
      await fetchNews(category, 0, false);
    } catch { /* ignore */ }
    finally { setRefreshing(false); }
  };

  useEffect(() => {
    setOffset(0);
    fetchNews(category, 0, false);
    const iv = setInterval(() => fetchNews(category, 0, false), 60000);
    return () => clearInterval(iv);
  }, [category]);

  // ── Market status (IST-aware) ─────────────────────────────────────────────
  const getMarketStatus = () => {
    const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const t   = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    if (t >= 9 * 60 + 15 && t <= 15 * 60 + 30)
      return { label: "MARKET OPEN",     color: "#00ff88", live: true  };
    if (t >= 6 * 60 && t <= 20 * 60)
      return { label: "PRE/POST MARKET", color: "#ffdd00", live: false };
    return   { label: "MARKET CLOSED",   color: DIM,       live: false };
  };
  const mStatus = getMarketStatus();

  // Derived ticker items: live when available, static fallback
  const tickerItems = marketData.length > 0
    ? marketData.map((q) => ({
        symbol: q.name,
        price: fmtPrice(q.symbol, q.price),
        pct: fmtPct(q.changePercent),
        up: q.change >= 0,
      }))
    : FALLBACK_TICKER_DATA;

  // Derived market cards: live when available, static fallback
  const CARD_SYMS = ["^NSEI", "^BSESN", "^NSEBANK", "GC=F"];
  const displayCards = CARD_SYMS.map((sym, i) => {
    const q = marketData.find((d) => d.symbol === sym);
    if (!q) return FALLBACK_MARKET_CARDS[i];
    return {
      name: q.name,
      symbol: sym,
      price: fmtPrice(sym, q.price),
      change: fmtChange(sym, q.change),
      pct: fmtPct(q.changePercent),
      up: q.change >= 0,
      high: q.high ? fmtPrice(sym, q.high) : "—",
      low: q.low  ? fmtPrice(sym, q.low)  : "—",
    };
  });


  // ─────────────────────────────────────────────────────────────────────────

  // ── Bottom nav tabs ───────────────────────────────────────────────────────
  const bottomNavTabs = getOnClickNavTabs(view, navigate);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: "#07070e", ...SANS }}>

      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <AppHeader
        showClock
        showMarketStatus
        onRefresh={forceRefresh}
        refreshing={refreshing || loading}
        onSignIn={() => setShowAuthModal(true)}
        navTabs={bottomNavTabs.map(t => ({
          label:   t.label,
          onClick: t.onClick,
          active:  t.active,
        }))}
      />

      {/* Bottom nav — always visible */}
      <BottomNav tabs={bottomNavTabs} />

      {/* ── Non-news pages ─────────────────────────────────────────────── */}
      {view === "trading" && (
        <div key="trading" className="page-enter" style={{ paddingBottom: 72 }}>
          <PaperTrading authToken={session?.access_token} onNavigate={navigate} />
        </div>
      )}
      {view === "pulse" && (
        <div key="pulse" className="page-enter">
          <Pulse authToken={session?.access_token} />
        </div>
      )}
      {view === "move" && (
        <div key="move" className="page-enter">
          <MarketMove />
        </div>
      )}
      {view === "quiz-master" && (
        <div key="quiz-master" className="page-enter">
          <QuizMaster authToken={session?.access_token} />
        </div>
      )}
      {view === "combo" && (
        <div key="combo" className="page-enter">
          <ComboCard authToken={session?.access_token} />
        </div>
      )}
      {view === "chartguessr" && (
        <div key="chartguessr" className="page-enter">
          <Chartguessr authToken={session?.access_token} />
        </div>
      )}
      {view === "t20" && (
        <div key="t20" className="page-enter">
          <DalalStreetT20
            authToken={session?.access_token}
            onExit={() => navigate("rewards")}
          />
        </div>
      )}
      {view === "rewards" && (
        <div key="rewards" className="page-enter" style={{ paddingBottom: 80 }}>
          <RewardsHub
            authToken={session?.access_token}
            onNavigate={(v) => navigate(v as any)}
          />
        </div>
      )}

      {/* Auth modal (Login / Sign Up) */}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      {showMysteryStock && (
        <MysteryStockGame
          onClose={() => setShowMysteryStock(false)}
        />
      )}
      {certModalData && (
        <CertificateModal data={certModalData} onClose={() => setCertModalData(null)} />
      )}

      {/* PWA install prompt — shown after 3rd visit */}
      <AddToHomeScreen />

      {/* ══ NEWS VIEW ═══════════════════════════════════════════════════════ */}
      {view === "news" && <React.Fragment key="news"><div className="page-enter">

      {/* ══ TICKER STRIP ════════════════════════════════════════════════════ */}
      <div
        style={{ background: "#0d0d1e", borderBottom: "1px solid #1a1a2e" }}
        className="overflow-hidden py-2"
      >
        <div className="ticker-scroll flex items-center">
          {[...tickerItems, ...tickerItems].map((tick, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-4 shrink-0"
              style={{ borderRight: "1px solid #1a1a2e" }}
            >
              <span style={{ color: SUBTEXT, ...MONO }} className="text-[11px] uppercase tracking-wider">
                {tick.symbol}
              </span>
              <span style={{ color: TEXT, ...MONO }} className="text-[11px] font-medium">
                {tick.price}
              </span>
              <span style={{ color: tick.up ? "#00ff88" : "#ff2244", ...MONO }} className="text-[10px]">
                {tick.up ? "▲" : "▼"} {tick.pct}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ══ MARKET SUMMARY CARDS ════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-4 py-3">
        {displayCards.map((card) => (
          <MarketCard key={card.name} card={card} />
        ))}
      </div>

      {/* ══ MAIN LAYOUT ═════════════════════════════════════════════════════ */}
      <div className="flex gap-4 px-4 pb-20 lg:pb-24">

        {/* ── LEFT: Category pills + News feed ─────────────────────────── */}
        <div className="flex-1 min-w-0">

          {/* Category pills */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                style={
                  category === cat.id
                    ? { background: `${cat.color}20`, border: `1px solid ${cat.color}60`, color: cat.color, ...MONO }
                    : { background: "#0d0d1e", border: "1px solid #1a1a2e", color: DIM, ...MONO }
                }
                className="px-3 py-1.5 rounded text-[11px] uppercase tracking-wider whitespace-nowrap transition-all"
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Section header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div style={{ background: getCatColor(category) }} className="w-1 h-4 rounded-full" />
              <span style={{ color: SUBTEXT, ...MONO }} className="text-xs uppercase tracking-widest">
                {getCatLabel(category)} — {total} items
              </span>
            </div>
            <div className="flex items-center gap-2">
              {lastFetchTime > 0 && (
                <span style={{ color: DIMMER, ...MONO }} className="text-[10px] hidden sm:block">
                  Updated {formatDistanceToNow(lastFetchTime, { addSuffix: true })}
                </span>
              )}
            </div>
          </div>

          {/* Feed */}
          {loading ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  style={{ background: "#0d0d1e", borderLeft: "3px solid #1a1a2e" }}
                  className="rounded-r-lg p-4 animate-pulse"
                >
                  <div className="h-2 rounded w-1/4 mb-3" style={{ background: "#1a1a2e" }} />
                  <div className="h-3 rounded w-3/4 mb-2" style={{ background: "#1a1a2e" }} />
                  <div className="h-3 rounded w-1/2"       style={{ background: "#1a1a2e" }} />
                </div>
              ))}
            </div>
          ) : news.length === 0 ? (
            <div style={CARD_BG} className="rounded-lg p-12 text-center">
              <Activity className="w-8 h-8 mx-auto mb-3" style={{ color: "#1a1a2e" }} />
              <p style={{ color: DIMMER, ...MONO }} className="text-xs uppercase tracking-wider">
                No data available
              </p>
            </div>
          ) : (
            <>
              {news.map((item, idx) => (
                <NewsCard
                  key={item.id}
                  item={item}
                  isSignedIn={!!session}
                  onSignIn={() => setShowAuthModal(true)}
                  authToken={session?.access_token}
                />
              ))}
              {news.length < total && (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  style={{ background: "#0d0d1e", border: "1px solid #1a1a2e", color: DIM, ...MONO }}
                  className="w-full py-3 rounded text-xs uppercase tracking-wider hover:border-[#00ff8840] hover:text-[#00ff88] disabled:opacity-40 transition-colors flex items-center justify-center gap-2 mt-2"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingMore ? "animate-spin" : ""}`} />
                  {loadingMore ? "Loading…" : `Load More — ${news.length} of ${total}`}
                </button>
              )}
            </>
          )}
        </div>

        {/* ── RIGHT SIDEBAR (300 px, desktop only) ─────────────────────── */}
        <div className="w-[300px] shrink-0 hidden lg:flex flex-col gap-3">

          {/* Quick nav — Paper Trading + Rewards Hub */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { id: "trading"     as ViewType, label: "Paper Trading",  icon: <TradingIcon size={16} />, color: "#00ff88", desc: "Virtual Trading" },
              { id: "pulse"       as ViewType, label: "Pulse",          icon: <Zap         size={16} />, color: "#ff9f3b", desc: "Bull/Bear Swiper" },
              { id: "move"        as ViewType, label: "Market Move",    icon: <Activity    size={16} />, color: "#3b9eff", desc: "Gainers · FII · Buzz" },
              { id: "quiz-master" as ViewType, label: "Quiz Master",    icon: <Brain       size={16} />, color: "#b366ff", desc: "Infinite Quiz Bank" },
              { id: "rewards"     as ViewType, label: "Rewards Hub",    icon: <Star        size={16} />, color: "#ffdd3b", desc: "Coins & Badges"  },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                style={{
                  background:   view === item.id ? `${item.color}15` : "#0d0d1e",
                  border:       `1px solid ${view === item.id ? item.color + "40" : "#1a1a2e"}`,
                  borderRadius: 10,
                  padding:      "10px 12px",
                  cursor:       "pointer",
                  textAlign:    "left",
                  transition:   "all 0.15s",
                }}
              >
                <div style={{ color: item.color, marginBottom: 4 }}>{item.icon}</div>
                <p style={{ color: "#e8eaf0", fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  {item.label}
                </p>
                <p style={{ color: "#445566", fontFamily: "'DM Sans', sans-serif", fontSize: 10, marginTop: 1 }}>
                  {item.desc}
                </p>
              </button>
            ))}
          </div>

          {/* Certificate Profile Card — shown when logged in */}
          {user && (
            <CertificateProfileCard
              userName={profile?.name ?? user.email ?? null}
              investorIq={investorIq}
              iqTitle={getTitleFromIQ(investorIq).title}
              iqEmoji={getTitleFromIQ(investorIq).emoji}
              streakCount={profile?.streak_count ?? 0}
              coins={profile?.coins ?? 0}
              authToken={session?.access_token}
              onShowCertificate={(data) => setCertModalData(data)}
            />
          )}

          {/* IPO Calendar link */}
          <a
            href="/ipo-calendar"
            style={{
              background:   '#0d0d1e',
              border:       '1px solid #1a1a2e',
              borderLeft:   '3px solid #ff3bff',
              borderRadius: '0 8px 8px 0',
              padding:      '10px 14px',
              display:      'flex',
              alignItems:   'center',
              gap:          10,
              textDecoration: 'none',
              transition:   'border-color 0.15s',
            }}
            className="hover:border-[#ff3bff40]"
          >
            <span style={{ fontSize: 18 }}>📅</span>
            <div>
              <p style={{ color: '#ff3bff', ...MONO, fontSize: 10, fontWeight: 700 }}>IPO CALENDAR</p>
              <p style={{ color: '#445566', ...SANS, fontSize: 11, marginTop: 1 }}>
                Upcoming · Open · GMP · Subscription
              </p>
            </div>
            <ExternalLink size={11} style={{ color: '#2a2a4a', marginLeft: 'auto' }} />
          </a>

          {/* Mystery Stock daily game */}
          <button
            onClick={() => setShowMysteryStock(true)}
            style={{
              background:  '#0d0d1e',
              border:      '1px solid #1a1a2e',
              borderRadius: 10,
              padding:     '14px 16px',
              cursor:      'pointer',
              textAlign:   'left',
              width:       '100%',
            }}
            className="hover:border-[#00ff8830] transition-colors group"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 18 }}>🔍</span>
                <span style={{ color: '#00ff88', ...MONO, fontSize: 10, letterSpacing: 2 }} className="uppercase">
                  Mystery Stock
                </span>
              </div>
              <span style={{ background: '#0a1a10', border: '1px solid #00ff8830', color: '#00ff88', ...MONO, fontSize: 8, padding: '2px 6px', borderRadius: 3 }}>
                DAILY
              </span>
            </div>
            <div style={{ color: '#8899aa', ...SANS, fontSize: 11, lineHeight: 1.5 }}>
              Guess the mystery Nifty 500 stock from 5 clues
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
              {['🟩','🟥','🟥','⬜','⬜'].map((e, i) => (
                <span key={i} style={{ fontSize: 12 }}>{e}</span>
              ))}
              <span style={{ color: '#334466', ...MONO, fontSize: 9, marginLeft: 4, alignSelf: 'center' }}>500 pts</span>
            </div>
          </button>

          {/* Market Movers — top gainers / losers / most active */}
          <MarketMovers />

          {/* Daily Forecast — market predictions */}
          <MarketForecast authToken={session?.access_token} />

          {/* News Impact Quiz — answer 4-option MCQs from today's articles */}
          <NewsImpactQuiz authToken={session?.access_token} />

          {/* IPO Predictions — vote on upcoming listings */}
          <IPOPredictions authToken={session?.access_token} />

          {/* Market Quiz */}
          <MarketQuiz />

          {/* Weekly AI Performance Report */}
          <WeeklyReportCard />

          {/* Market Data Widget */}
          <div style={CARD_BG} className="rounded-lg overflow-hidden">
            <div style={{ borderBottom: "1px solid #1a1a2e", background: "#07070e" }} className="px-3 py-2 flex items-center gap-2">
              <Globe2 className="w-3 h-3" style={{ color: DIM }} />
              <span style={{ color: DIM, ...MONO }} className="text-[10px] uppercase tracking-widest">Market Data</span>
            </div>
            {(marketData.length > 0 ? marketData : []).map((q, i) => (
              <div
                key={q.symbol}
                className="flex items-center justify-between px-3 py-2"
                style={{ borderBottom: i < marketData.length - 1 ? "1px solid #1a1a2e" : "none" }}
              >
                <span style={{ color: SUBTEXT, ...MONO }} className="text-[11px] uppercase">{q.name}</span>
                <div className="flex items-center gap-2">
                  <span style={{ color: TEXT,   ...MONO }} className="text-[11px]">{fmtPrice(q.symbol, q.price)}</span>
                  <span style={{ color: q.change >= 0 ? "#00ff88" : "#ff2244", ...MONO }} className="text-[10px]">{fmtPct(q.changePercent)}</span>
                </div>
              </div>
            ))}
            {marketData.length === 0 && (
              <p style={{ color: DIMMER, ...MONO }} className="text-[10px] px-3 py-4 text-center uppercase">Loading market data…</p>
            )}
          </div>

          {/* SEBI / RBI Feed */}
          <div style={CARD_BG} className="rounded-lg overflow-hidden">
            <div style={{ borderBottom: "1px solid #1a1a2e", background: "#07070e" }} className="px-3 py-2 flex items-center gap-2">
              <Radio className="w-3 h-3" style={{ color: "#ff8800" }} />
              <span style={{ color: DIM, ...MONO }} className="text-[10px] uppercase tracking-widest">SEBI / RBI</span>
              <div className="ml-auto flex items-center gap-1.5">
                <span style={{ background: "#ff880020", border: "1px solid #ff880050", color: "#ff8800", ...MONO }} className="text-[9px] px-1.5 py-0.5 rounded uppercase">SEBI</span>
                <span style={{ background: "#00aaff20", border: "1px solid #00aaff50", color: "#00aaff", ...MONO }} className="text-[9px] px-1.5 py-0.5 rounded uppercase">RBI</span>
              </div>
            </div>
            {regulatoryItems.length === 0 ? (
              <p style={{ color: DIMMER, ...MONO }} className="text-[10px] px-3 py-4 text-center uppercase">
                Awaiting updates…
              </p>
            ) : regulatoryItems.map((item) => {
              const isSebi = item.source === "sebi";
              const accent = isSebi ? "#ff8800" : "#00aaff";
              return (
                <a
                  key={item.id}
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-3 py-2.5 group transition-colors"
                  style={{ borderBottom: "1px solid #1a1a2e", borderLeft: `2px solid ${accent}40` }}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span style={{ color: accent, borderColor: `${accent}50`, ...MONO }} className="text-[9px] border px-1.5 py-0.5 rounded-sm uppercase tracking-wider">
                      {item.source.toUpperCase()}
                    </span>
                  </div>
                  <p style={{ color: SUBTEXT, ...SANS }} className="text-[11px] leading-snug line-clamp-2 group-hover:text-[#e8eaf0] transition-colors">
                    {item.title}
                  </p>
                  <span style={{ color: DIMMER, ...MONO }} className="text-[10px] mt-1 block">
                    {(() => { try { const d = new Date(item.pubDate); return isNaN(d.getTime()) ? "" : formatDistanceToNow(d, { addSuffix: true }); } catch { return ""; } })()}
                  </span>
                </a>
              );
            })}
          </div>

          {/* Feed Status */}
          <div style={CARD_BG} className="rounded-lg overflow-hidden">
            <div style={{ borderBottom: "1px solid #1a1a2e", background: "#07070e" }} className="px-3 py-2 flex items-center gap-2">
              <Wifi className="w-3 h-3" style={{ color: DIM }} />
              <span style={{ color: DIM, ...MONO }} className="text-[10px] uppercase tracking-widest">Feed Status</span>
            </div>
            <div className="px-3 py-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span style={{ color: DIM, ...MONO }} className="text-[10px] uppercase">Status</span>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full pulse-green" style={{ background: "#00ff88" }} />
                  <span style={{ color: "#00ff88", ...MONO }} className="text-[10px]">LIVE</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: DIM, ...MONO }} className="text-[10px] uppercase">Items</span>
                <span style={{ color: SUBTEXT, ...MONO }} className="text-[10px]">{total}</span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: DIM, ...MONO }} className="text-[10px] uppercase">Last Fetch</span>
                <span style={{ color: SUBTEXT, ...MONO }} className="text-[10px]">
                  {lastFetchTime > 0 ? formatDistanceToNow(lastFetchTime, { addSuffix: true }) : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: DIM, ...MONO }} className="text-[10px] uppercase">Poll</span>
                <span style={{ color: SUBTEXT, ...MONO }} className="text-[10px]">60s</span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: DIM, ...MONO }} className="text-[10px] uppercase">Market</span>
                <span style={{ color: mStatus.color, ...MONO }} className="text-[10px]">{mStatus.label}</span>
              </div>
            </div>
          </div>

        </div>{/* end sidebar */}
      </div>

      </div></React.Fragment>}{/* end view === "news" */}

    </div>
  );
}
