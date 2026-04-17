/**
 * IPO Calendar — upcoming / open / allotment / listing tracker
 * for Market Samachar. Driven by /api/ipo/calendar.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar, List, Bell, BellOff, TrendingUp, TrendingDown,
  RefreshCw, Loader2, ChevronLeft, ChevronRight, ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif" };

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IPO {
  id:                  string;
  company_name:        string;
  symbol:              string | null;
  open_date:           string | null;
  close_date:          string | null;
  allotment_date:      string | null;
  listing_date:        string | null;
  price_band_low:      number | null;
  price_band_high:     number | null;
  lot_size:            number | null;
  gmp:                 number | null;
  subscription_status: number | null;
  category:            'mainboard' | 'sme';
  created_at:          number;
}

type IPOStatus = 'upcoming' | 'open' | 'allotment' | 'listing' | 'listed' | 'closed';
type ViewMode  = 'list' | 'calendar';
type FilterCat = 'all' | 'mainboard' | 'sme';
type FilterStatus = 'all' | 'open' | 'upcoming' | 'allotment' | 'listing' | 'listed';

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CFG: Record<IPOStatus, { label: string; color: string; bg: string; dot: string }> = {
  upcoming:  { label: 'Upcoming',     color: '#ffdd3b', bg: '#ffdd3b18', dot: '🟡' },
  open:      { label: 'Open Now',     color: '#00ff88', bg: '#00ff8818', dot: '🟢' },
  allotment: { label: 'Allotment',    color: '#3b9eff', bg: '#3b9eff18', dot: '🔵' },
  listing:   { label: 'Listing Soon', color: '#b366ff', bg: '#b366ff18', dot: '🟣' },
  listed:    { label: 'Listed',       color: '#888899', bg: '#88889918', dot: '⚪' },
  closed:    { label: 'Closed',       color: '#334466', bg: 'transparent', dot: '—' },
};

const STATUS_ORDER: Record<IPOStatus, number> = {
  open: 0, upcoming: 1, allotment: 2, listing: 3, listed: 4, closed: 5,
};

/** IST today as YYYY-MM-DD */
function todayIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function getIPOStatus(ipo: IPO): IPOStatus {
  const today = todayIST();
  const od = ipo.open_date;
  const cd = ipo.close_date ?? od;
  const ad = ipo.allotment_date;
  const ld = ipo.listing_date;

  if (!od || today < od)            return 'upcoming';
  if (today >= od && today <= (cd ?? od)) return 'open';
  if (ad && today > (cd ?? od) && today < ad) return 'allotment';
  if (ld && ad && today >= ad && today < ld)  return 'listing';
  if (ld && today >= ld)            return 'listed';
  return 'closed';
}

/** Format YYYY-MM-DD → "Apr 01" */
function fmtDate(d: string | null): string {
  if (!d) return '—';
  const [, m, day] = d.split('-');
  const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m)]} ${day}`;
}

// ─── Reminder helpers (localStorage) ─────────────────────────────────────────

function loadReminders(): Set<string> {
  try {
    const raw = localStorage.getItem('ipo_reminders');
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function saveReminders(set: Set<string>) {
  localStorage.setItem('ipo_reminders', JSON.stringify([...set]));
}

// ─── IPO Card ─────────────────────────────────────────────────────────────────

function IPOCard({
  ipo,
  reminded,
  onToggleReminder,
}: {
  ipo:              IPO;
  reminded:         boolean;
  onToggleReminder: (id: string) => void;
}) {
  const status  = getIPOStatus(ipo);
  const cfg     = STATUS_CFG[status];
  const minInvest = ipo.price_band_high && ipo.lot_size
    ? `₹${(ipo.price_band_high * ipo.lot_size).toLocaleString('en-IN')}`
    : null;

  const gmpPct = ipo.gmp && ipo.price_band_high
    ? ((ipo.gmp / ipo.price_band_high) * 100).toFixed(1)
    : null;

  const isGMPPositive = (ipo.gmp ?? 0) >= 0;

  return (
    <div
      style={{
        background:   '#0d0d1e',
        border:       `1px solid ${status === 'open' ? '#00ff8830' : '#1e1e2e'}`,
        borderLeft:   `3px solid ${cfg.color}`,
        borderRadius: '0 8px 8px 0',
        padding:      '14px 16px',
        marginBottom: 10,
        transition:   'border-color 0.15s',
      }}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status badge */}
          <span
            style={{
              background:   cfg.bg,
              border:       `1px solid ${cfg.color}40`,
              color:        cfg.color,
              ...MONO,
              fontSize:     9,
              padding:      '2px 8px',
              borderRadius: 20,
              letterSpacing: '0.06em',
            }}
          >
            {cfg.dot} {cfg.label.toUpperCase()}
          </span>
          {/* Category */}
          <span
            style={{
              background: '#1a1a2e', border: '1px solid #2a2a4e',
              color: '#556688', ...MONO, fontSize: 9,
              padding: '2px 7px', borderRadius: 4,
            }}
          >
            {ipo.category.toUpperCase()}
          </span>
          {/* HOT badge if open */}
          {status === 'open' && (
            <span style={{ background: '#ff224420', border: '1px solid #ff224440', color: '#ff4466', ...MONO, fontSize: 9, padding: '2px 7px', borderRadius: 4 }}>
              LIVE
            </span>
          )}
        </div>

        {/* Reminder button */}
        {(status === 'upcoming' || status === 'open') && (
          <button
            onClick={() => onToggleReminder(ipo.id)}
            title={reminded ? 'Remove reminder' : 'Set reminder'}
            style={{
              background:   reminded ? '#ffdd3b18' : 'none',
              border:       `1px solid ${reminded ? '#ffdd3b40' : '#1e1e2e'}`,
              color:        reminded ? '#ffdd3b' : '#334466',
              borderRadius: 6,
              padding:      '4px 8px',
              cursor:       'pointer',
              display:      'flex',
              alignItems:   'center',
              gap:          4,
              ...MONO,
              fontSize:     9,
              flexShrink:   0,
              transition:   'all 0.15s',
            }}
          >
            {reminded ? <BellOff size={11} /> : <Bell size={11} />}
            {reminded ? 'Reminded' : 'Remind me'}
          </button>
        )}
      </div>

      {/* Company name */}
      <h3 style={{ color: '#e8eaf0', ...SANS, fontSize: 15, fontWeight: 700 }} className="mb-1 leading-tight">
        {ipo.company_name}
        {ipo.symbol && (
          <span style={{ color: '#445566', ...MONO, fontSize: 11, fontWeight: 400 }} className="ml-2">
            {ipo.symbol}
          </span>
        )}
      </h3>

      {/* Price + lot */}
      <div className="flex items-center gap-3 flex-wrap mb-2">
        {ipo.price_band_high && (
          <span style={{ color: '#8899aa', ...MONO, fontSize: 12 }}>
            {ipo.price_band_low && ipo.price_band_low !== ipo.price_band_high
              ? `₹${ipo.price_band_low} – ₹${ipo.price_band_high}`
              : `₹${ipo.price_band_high}`
            }
          </span>
        )}
        {ipo.lot_size && (
          <span style={{ color: '#445566', ...MONO, fontSize: 11 }}>
            Lot: {ipo.lot_size} shares
          </span>
        )}
        {minInvest && (
          <span style={{ color: '#445566', ...MONO, fontSize: 11 }}>
            Min: {minInvest}
          </span>
        )}
      </div>

      {/* Dates row */}
      <div
        className="flex items-center gap-3 flex-wrap mb-3 py-2"
        style={{ borderTop: '1px solid #111122', borderBottom: '1px solid #111122' }}
      >
        {ipo.open_date && (
          <div>
            <span style={{ color: '#2a3a50', ...MONO, fontSize: 8, letterSpacing: '0.06em' }} className="uppercase block">Open</span>
            <span style={{ color: '#00ff8890', ...MONO, fontSize: 11 }}>{fmtDate(ipo.open_date)}</span>
          </div>
        )}
        {ipo.close_date && (
          <div>
            <span style={{ color: '#2a3a50', ...MONO, fontSize: 8 }} className="uppercase block">Close</span>
            <span style={{ color: '#ff446690', ...MONO, fontSize: 11 }}>{fmtDate(ipo.close_date)}</span>
          </div>
        )}
        {ipo.allotment_date && (
          <div>
            <span style={{ color: '#2a3a50', ...MONO, fontSize: 8 }} className="uppercase block">Allotment</span>
            <span style={{ color: '#3b9eff90', ...MONO, fontSize: 11 }}>{fmtDate(ipo.allotment_date)}</span>
          </div>
        )}
        {ipo.listing_date && (
          <div>
            <span style={{ color: '#2a3a50', ...MONO, fontSize: 8 }} className="uppercase block">Listing</span>
            <span style={{ color: '#b366ff90', ...MONO, fontSize: 11 }}>{fmtDate(ipo.listing_date)}</span>
          </div>
        )}
      </div>

      {/* GMP + Subscription row */}
      <div className="flex items-center gap-4 flex-wrap">
        {ipo.gmp !== null && (
          <div className="flex items-center gap-1.5">
            <span style={{ color: '#334466', ...MONO, fontSize: 9 }} className="uppercase">GMP</span>
            <span
              style={{
                background:   isGMPPositive ? '#00ff8818' : '#ff446618',
                border:       `1px solid ${isGMPPositive ? '#00ff8840' : '#ff446640'}`,
                color:        isGMPPositive ? '#00ff88' : '#ff4466',
                ...MONO, fontSize: 11, fontWeight: 700,
                padding:      '2px 8px', borderRadius: 4,
                display:      'inline-flex', alignItems: 'center', gap: 3,
              }}
            >
              {isGMPPositive
                ? <TrendingUp size={10} />
                : <TrendingDown size={10} />
              }
              {ipo.gmp > 0 ? '+' : ''}₹{ipo.gmp}
              {gmpPct && <span style={{ opacity: 0.7 }}> ({ipo.gmp > 0 ? '+' : ''}{gmpPct}%)</span>}
            </span>
          </div>
        )}

        {ipo.subscription_status !== null && ipo.subscription_status > 0 && (
          <div className="flex items-center gap-1.5">
            <span style={{ color: '#334466', ...MONO, fontSize: 9 }} className="uppercase">Subscribed</span>
            <span
              style={{
                color:        ipo.subscription_status >= 1 ? '#00ff88' : '#ff9f3b',
                ...MONO, fontSize: 12, fontWeight: 700,
              }}
            >
              {ipo.subscription_status.toFixed(2)}×
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Calendar view ────────────────────────────────────────────────────────────

const CAL_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function CalendarView({ ipos, year, month, onChangeMonth }: {
  ipos:          IPO[];
  year:          number;
  month:         number;   // 0-based (JS)
  onChangeMonth: (delta: number) => void;
}) {
  const today    = todayIST();
  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInM  = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const dateStr = (d: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const eventsFor = (d: number) => {
    const ds = dateStr(d);
    return {
      opens:  ipos.filter(i => i.open_date      === ds),
      closes: ipos.filter(i => i.close_date     === ds),
      allots: ipos.filter(i => i.allotment_date === ds),
      lists:  ipos.filter(i => i.listing_date   === ds),
    };
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInM }, (_, i) => i + 1),
  ];

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => onChangeMonth(-1)}
          style={{ background: '#07070e', border: '1px solid #1e1e2e', color: '#556688', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}
        >
          <ChevronLeft size={14} />
        </button>
        <span style={{ color: '#e8eaf0', ...MONO, fontSize: 13, fontWeight: 700 }}>
          {monthNames[month]} {year}
        </span>
        <button
          onClick={() => onChangeMonth(1)}
          style={{ background: '#07070e', border: '1px solid #1e1e2e', color: '#556688', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 3 }}>
        {CAL_DAYS.map(d => (
          <div key={d} style={{ textAlign: 'center', color: '#2a3a50', ...MONO, fontSize: 9, padding: '4px 0' }}>
            {d.toUpperCase()}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {cells.map((day, i) => {
          if (day === null) return <div key={`e${i}`} style={{ minHeight: 56 }} />;
          const ds   = dateStr(day);
          const ev   = eventsFor(day);
          const isToday = ds === today;
          const total   = ev.opens.length + ev.closes.length + ev.allots.length + ev.lists.length;

          return (
            <div
              key={day}
              style={{
                background:   isToday ? '#00ff8810' : total > 0 ? '#0d0d1e' : 'transparent',
                border:       `1px solid ${isToday ? '#00ff8830' : total > 0 ? '#1e1e2e' : 'transparent'}`,
                borderRadius: 6,
                padding:      '5px 4px',
                minHeight:    56,
              }}
            >
              <div style={{
                color:       isToday ? '#00ff88' : '#445566',
                ...MONO, fontSize: 10,
                textAlign:  'right',
                fontWeight:  isToday ? 700 : 400,
                marginBottom: 3,
              }}>
                {day}
              </div>

              {/* Event dots with tooltips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                {ev.opens.map(ipo => (
                  <div key={`o${ipo.id}`} title={`${ipo.company_name} opens`}
                    style={{ width: 6, height: 6, borderRadius: '50%', background: '#00ff88', flexShrink: 0 }} />
                ))}
                {ev.closes.map(ipo => (
                  <div key={`c${ipo.id}`} title={`${ipo.company_name} closes`}
                    style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff4466', flexShrink: 0 }} />
                ))}
                {ev.allots.map(ipo => (
                  <div key={`a${ipo.id}`} title={`${ipo.company_name} allotment`}
                    style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b9eff', flexShrink: 0 }} />
                ))}
                {ev.lists.map(ipo => (
                  <div key={`l${ipo.id}`} title={`${ipo.company_name} listing`}
                    style={{ width: 6, height: 6, borderRadius: '50%', background: '#b366ff', flexShrink: 0 }} />
                ))}
              </div>

              {/* IPO names (compact) */}
              {total > 0 && (
                <div style={{ marginTop: 2 }}>
                  {[...ev.opens, ...ev.lists].slice(0, 1).map(ipo => (
                    <p key={ipo.id} style={{ color: '#334466', ...MONO, fontSize: 7, lineHeight: 1.2 }}
                      className="truncate">
                      {ipo.company_name.split(' ')[0]}
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 flex-wrap">
        {[
          { color: '#00ff88', label: 'Opens' },
          { color: '#ff4466', label: 'Closes' },
          { color: '#3b9eff', label: 'Allotment' },
          { color: '#b366ff', label: 'Listing' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
            <span style={{ color: '#334466', ...MONO, fontSize: 9 }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Reminder notification check ─────────────────────────────────────────────

function checkAndFireReminders(ipos: IPO[], reminders: Set<string>) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const today = todayIST();
  for (const id of reminders) {
    const ipo = ipos.find(i => i.id === id);
    if (!ipo || !ipo.open_date) continue;
    if (ipo.open_date === today) {
      new Notification(`🟢 ${ipo.company_name} IPO is open today!`, {
        body: ipo.price_band_high
          ? `Price: ₹${ipo.price_band_low ?? ipo.price_band_high}–₹${ipo.price_band_high}  ·  Lot: ${ipo.lot_size ?? '—'}`
          : 'Subscribe now on your broker.',
        icon: '/ms-favicon.svg',
      });
    }
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export function IPOCalendar() {
  const [ipos,          setIpos]          = useState<IPO[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [view,          setView]          = useState<ViewMode>('list');
  const [filterCat,     setFilterCat]     = useState<FilterCat>('all');
  const [filterStatus,  setFilterStatus]  = useState<FilterStatus>('all');
  const [reminders,     setReminders]     = useState<Set<string>>(loadReminders);
  const [calYear,       setCalYear]       = useState(() => {
    const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    return ist.getUTCFullYear();
  });
  const [calMonth,      setCalMonth]      = useState(() => {
    const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    return ist.getUTCMonth();
  });

  const loadIPOs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/ipo/calendar');
      if (!res.ok) throw new Error('Failed to load IPO data');
      const data = await res.json();
      setIpos(data);
      checkAndFireReminders(data, reminders);
    } catch (err: any) {
      setError(err.message ?? 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadIPOs(); }, [loadIPOs]);

  const toggleReminder = useCallback(async (id: string) => {
    const ipo = ipos.find(i => i.id === id);
    const next = new Set(reminders);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      // Request permission on first reminder
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      if ('Notification' in window && Notification.permission === 'granted' && ipo?.open_date) {
        new Notification(`🔔 Reminder set: ${ipo.company_name} IPO`, {
          body: `Opens ${fmtDate(ipo.open_date)}. We'll remind you when it's time.`,
          icon: '/ms-favicon.svg',
        });
      }
    }
    setReminders(next);
    saveReminders(next);
  }, [reminders, ipos]);

  const changeCalMonth = useCallback((delta: number) => {
    setCalMonth(m => {
      let nm = m + delta;
      let ny = calYear;
      if (nm < 0)  { nm = 11; ny--; }
      if (nm > 11) { nm = 0;  ny++; }
      setCalYear(ny);
      return nm;
    });
  }, [calYear]);

  // ── Filtered + sorted list ─────────────────────────────────────────────────
  const filtered = ipos
    .filter(i => filterCat    === 'all' || i.category === filterCat)
    .filter(i => filterStatus === 'all' || getIPOStatus(i) === filterStatus)
    .sort((a, b) => {
      const sa = STATUS_ORDER[getIPOStatus(a)];
      const sb = STATUS_ORDER[getIPOStatus(b)];
      if (sa !== sb) return sa - sb;
      return (a.open_date ?? '9999').localeCompare(b.open_date ?? '9999');
    });

  // ── Counts per status ──────────────────────────────────────────────────────
  const counts = ipos.reduce<Partial<Record<FilterStatus, number>>>((acc, i) => {
    const s = getIPOStatus(i) as FilterStatus;
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  // ── Active reminders that open soon ───────────────────────────────────────
  const dueReminders = ipos.filter(i =>
    reminders.has(i.id) && i.open_date &&
    i.open_date >= todayIST() &&
    i.open_date <= new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 5.5 * 60 * 60 * 1000)
      .toISOString().slice(0, 10),
  );

  return (
    <div style={{ background: '#07070e', minHeight: '100vh', color: '#e8eaf0' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div
        style={{ background: '#0d0d1e', borderBottom: '1px solid #1e1e2e' }}
        className="px-4 py-3"
      >
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#00ff88', display: 'inline-block' }} className="pulse-green" />
                <span style={{ color: '#00ff88', ...MONO, fontSize: 9, letterSpacing: '0.1em' }} className="uppercase">
                  Market Samachar
                </span>
              </div>
              <h1 style={{ color: '#e8eaf0', ...SANS, fontSize: 20, fontWeight: 700 }}>
                IPO Calendar 2026
              </h1>
              <p style={{ color: '#445566', ...MONO, fontSize: 10 }}>
                Upcoming · Open · Allotment · Listing · GMP · Subscription
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* View toggle */}
              <div style={{ display: 'flex', background: '#07070e', border: '1px solid #1e1e2e', borderRadius: 6 }}>
                {(['list', 'calendar'] as ViewMode[]).map(v => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    style={{
                      background:   view === v ? '#00ff8818' : 'none',
                      border:       'none',
                      color:        view === v ? '#00ff88' : '#334466',
                      cursor:       'pointer',
                      padding:      '5px 10px',
                      borderRadius: 5,
                      display:      'flex',
                      alignItems:   'center',
                      gap:          4,
                      ...MONO,
                      fontSize:     10,
                    }}
                  >
                    {v === 'list' ? <List size={12} /> : <Calendar size={12} />}
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>

              {/* Refresh */}
              <button
                onClick={loadIPOs}
                disabled={loading}
                style={{
                  background: '#07070e', border: '1px solid #1e1e2e', color: '#334466',
                  borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4, ...MONO, fontSize: 10,
                }}
              >
                {loading
                  ? <Loader2 size={12} className="animate-spin" style={{ color: '#00ff88' }} />
                  : <RefreshCw size={12} />
                }
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px' }}>

        {/* ── Reminder alerts ──────────────────────────────────────────────── */}
        {dueReminders.length > 0 && (
          <div
            style={{ background: '#ffdd3b10', border: '1px solid #ffdd3b30', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}
            className="flex items-start gap-3"
          >
            <Bell size={14} style={{ color: '#ffdd3b', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ color: '#ffdd3b', ...MONO, fontSize: 10, fontWeight: 700 }} className="mb-1">
                UPCOMING REMINDERS
              </p>
              {dueReminders.map(i => (
                <p key={i.id} style={{ color: '#8899aa', ...SANS, fontSize: 12 }}>
                  {i.company_name} — opens <strong style={{ color: '#ffdd3b' }}>{fmtDate(i.open_date)}</strong>
                </p>
              ))}
            </div>
          </div>
        )}

        {/* ── Error ────────────────────────────────────────────────────────── */}
        {error && (
          <div style={{ background: '#ff446610', border: '1px solid #ff446630', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}
            className="flex items-center gap-2">
            <AlertCircle size={13} style={{ color: '#ff4466' }} />
            <span style={{ color: '#ff4466', ...MONO, fontSize: 11 }}>{error}</span>
          </div>
        )}

        {view === 'list' ? (
          <>
            {/* ── Filters ────────────────────────────────────────────────── */}
            <div className="flex flex-wrap gap-2 mb-4">
              {/* Category filter */}
              <div style={{ display: 'flex', gap: 2 }}>
                {(['all', 'mainboard', 'sme'] as FilterCat[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilterCat(f)}
                    style={{
                      background:   filterCat === f ? '#00ff8818' : '#0d0d1e',
                      border:       `1px solid ${filterCat === f ? '#00ff8840' : '#1e1e2e'}`,
                      color:        filterCat === f ? '#00ff88' : '#445566',
                      ...MONO, fontSize: 9, padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
                    }}
                  >
                    {f === 'all' ? 'ALL' : f.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Status filter */}
              <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                {(['all', 'open', 'upcoming', 'allotment', 'listing', 'listed'] as FilterStatus[]).map(s => {
                  const cfg = s === 'all' ? null : STATUS_CFG[s as IPOStatus];
                  const cnt = s === 'all' ? ipos.length : (counts[s] ?? 0);
                  if (cnt === 0 && s !== 'all') return null;
                  return (
                    <button
                      key={s}
                      onClick={() => setFilterStatus(s)}
                      style={{
                        background:   filterStatus === s ? `${cfg?.color ?? '#00ff88'}18` : '#0d0d1e',
                        border:       `1px solid ${filterStatus === s ? `${cfg?.color ?? '#00ff88'}40` : '#1e1e2e'}`,
                        color:        filterStatus === s ? (cfg?.color ?? '#00ff88') : '#445566',
                        ...MONO, fontSize: 9, padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
                        display:      'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      {cfg?.dot} {s === 'all' ? 'ALL' : cfg?.label.toUpperCase()}
                      <span style={{ opacity: 0.5 }}>{cnt}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── List ───────────────────────────────────────────────────── */}
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16">
                <Loader2 size={16} className="animate-spin" style={{ color: '#00ff88' }} />
                <span style={{ color: '#334466', ...MONO, fontSize: 11 }} className="uppercase">
                  Loading IPO data…
                </span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <Calendar size={32} className="mx-auto mb-3" style={{ color: '#1e1e2e' }} />
                <p style={{ color: '#334466', ...MONO, fontSize: 11 }} className="uppercase">
                  No IPOs found for this filter
                </p>
                <p style={{ color: '#1e2840', ...MONO, fontSize: 10, marginTop: 6 }}>
                  New IPOs are added daily — check back soon
                </p>
              </div>
            ) : (
              <div>
                <p style={{ color: '#2a3a50', ...MONO, fontSize: 9 }} className="uppercase mb-3">
                  {filtered.length} IPO{filtered.length !== 1 ? 's' : ''} found
                </p>
                {filtered.map(ipo => (
                  <IPOCard
                    key={ipo.id}
                    ipo={ipo}
                    reminded={reminders.has(ipo.id)}
                    onToggleReminder={toggleReminder}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          /* ── Calendar view ─────────────────────────────────────────────── */
          <div style={{ background: '#0d0d1e', border: '1px solid #1e1e2e', borderRadius: 10, padding: 16 }}>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16">
                <Loader2 size={16} className="animate-spin" style={{ color: '#00ff88' }} />
              </div>
            ) : (
              <CalendarView
                ipos={ipos}
                year={calYear}
                month={calMonth}
                onChangeMonth={changeCalMonth}
              />
            )}
          </div>
        )}

        {/* ── Footer SEO note ─────────────────────────────────────────────── */}
        <p style={{ color: '#1e2840', ...MONO, fontSize: 9, textAlign: 'center', marginTop: 24 }}
          className="uppercase tracking-wider">
          Market Samachar · IPO Calendar · Updated daily from NSE / BSE · marketsamachar.in
        </p>

      </div>
    </div>
  );
}
