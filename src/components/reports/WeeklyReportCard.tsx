import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Brain, TrendingUp, TrendingDown, Minus,
  CheckCircle2, Circle, Download, Share2,
  ChevronDown, ChevronUp, Loader2, BarChart2,
  Calendar, Copy, Check,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { BRAND_HOST } from '../../lib/config';

const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif" };

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeeklyReport {
  id:               string;
  week_start:       string;
  week_end:         string;
  quizzes_taken:    number;
  quizzes_possible: number;
  scores_json:      string;  // JSON array
  accuracy_pct:     number;
  iq_start:         number;
  iq_end:           number;
  rank_weekly:      number | null;
  strong_cats:      string;  // JSON array
  weak_cats:        string;  // JSON array
  ai_report:        string;
  is_read:          boolean;
  generated_at:     string;
}

// ─── Typewriter hook ──────────────────────────────────────────────────────────

function useTypewriter(text: string, speed = 18, startDelay = 400) {
  const [displayed, setDisplayed] = useState('');
  const [done,      setDone]      = useState(false);

  useEffect(() => {
    setDisplayed('');
    setDone(false);
    if (!text) return;

    let i    = 0;
    let timer: ReturnType<typeof setTimeout>;

    const type = () => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i++;
        timer = setTimeout(type, speed);
      } else {
        setDone(true);
      }
    };

    const delay = setTimeout(type, startDelay);
    return () => { clearTimeout(delay); clearTimeout(timer); };
  }, [text, speed, startDelay]);

  return { displayed, done };
}

// ─── Share card generator ─────────────────────────────────────────────────────

async function generateWeekShareCard(report: WeeklyReport, userName: string): Promise<string> {
  await Promise.allSettled([
    document.fonts.load('700 48px "DM Mono"'),
    document.fonts.load('400 20px "DM Sans"'),
  ]);

  const W = 1080, H = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const scores      = JSON.parse(report.scores_json) as number[];
  const accuracy    = report.accuracy_pct;
  const iqDelta     = report.iq_end - report.iq_start;
  const acColor     = accuracy >= 80 ? '#00ff88' : accuracy >= 60 ? '#ffdd3b' : '#ff4466';
  const weekLabel   = `${fmtDate(report.week_start)} – ${fmtDate(report.week_end)}`;

  // Background
  ctx.fillStyle = '#07070e';
  ctx.fillRect(0, 0, W, H);

  // Dot grid
  ctx.fillStyle = '#0d0d20';
  for (let gx = 54; gx < W; gx += 54)
    for (let gy = 54; gy < H; gy += 54) {
      ctx.beginPath(); ctx.arc(gx, gy, 1, 0, Math.PI * 2); ctx.fill();
    }

  // Top bar
  ctx.fillStyle = '#00ff88';
  ctx.fillRect(0, 0, W, 5);

  // Left glow
  const lg = ctx.createLinearGradient(0, 0, 120, 0);
  lg.addColorStop(0, '#00ff8818'); lg.addColorStop(1, 'transparent');
  ctx.fillStyle = lg; ctx.fillRect(0, 0, 120, H);

  const PAD = 72;

  // Logo
  ctx.beginPath(); ctx.arc(PAD + 10, 96, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#00ff88'; ctx.fill();
  ctx.font = `700 30px "DM Mono", monospace`;
  ctx.fillStyle = '#e8eaf0'; ctx.textAlign = 'left';
  ctx.fillText('MARKET SAMACHAR', PAD + 28, 100);
  ctx.font = `400 16px "DM Mono", monospace`;
  ctx.fillStyle = '#334466';
  ctx.fillText('Weekly Performance Report', PAD + 28, 128);

  // Divider
  const div = ctx.createLinearGradient(PAD, 0, W - PAD, 0);
  div.addColorStop(0, 'transparent'); div.addColorStop(0.3, '#1e1e2e');
  div.addColorStop(0.7, '#1e1e2e'); div.addColorStop(1, 'transparent');
  ctx.strokeStyle = div; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, 150); ctx.lineTo(W - PAD, 150); ctx.stroke();

  // User name
  ctx.font = `700 52px "DM Sans", sans-serif`;
  ctx.fillStyle = '#e8eaf0'; ctx.textAlign = 'center';
  ctx.fillText(userName, W / 2, 230);
  ctx.font = `400 18px "DM Mono", monospace`;
  ctx.fillStyle = '#334466';
  ctx.fillText(weekLabel, W / 2, 262);

  // Big accuracy
  ctx.save();
  ctx.shadowColor = acColor; ctx.shadowBlur = 60;
  ctx.font = `700 180px "DM Mono", monospace`;
  ctx.fillStyle = acColor; ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(accuracy)}%`, W / 2, 480);
  ctx.restore();
  ctx.font = `400 22px "DM Mono", monospace`;
  ctx.fillStyle = '#556688'; ctx.textAlign = 'center';
  ctx.fillText('weekly accuracy', W / 2, 516);

  // Divider
  ctx.strokeStyle = '#1e1e2e'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, 556); ctx.lineTo(W - PAD, 556); ctx.stroke();

  // Stats row
  const stats = [
    { label: 'Quizzes',  value: `${report.quizzes_taken}/${report.quizzes_possible}`, color: '#e8eaf0' },
    { label: 'IQ Change', value: `${iqDelta >= 0 ? '+' : ''}${iqDelta}`, color: iqDelta >= 0 ? '#00ff88' : '#ff4466' },
    { label: 'IQ Score',  value: String(report.iq_end), color: '#3b9eff' },
  ];
  const bW = (W - PAD * 2 - 36) / 3;
  stats.forEach((s, i) => {
    const bx = PAD + i * (bW + 18);
    ctx.fillStyle = '#0d0d1e';
    ctx.beginPath(); ctx.roundRect(bx, 576, bW, 100, 12); ctx.fill();
    ctx.strokeStyle = s.color + '40'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bx, 576, bW, 100, 12); ctx.stroke();
    ctx.font = `700 28px "DM Mono", monospace`;
    ctx.fillStyle = s.color; ctx.textAlign = 'center';
    ctx.fillText(s.value, bx + bW / 2, 625);
    ctx.font = `400 16px "DM Mono", monospace`;
    ctx.fillStyle = '#334466';
    ctx.fillText(s.label, bx + bW / 2, 656);
  });

  // Score dots
  const dotY = 718, dotSpacing = 52, startX = W / 2 - (scores.length - 1) * dotSpacing / 2;
  ctx.font = `400 14px "DM Mono", monospace`;
  scores.forEach((sc, i) => {
    const x = startX + i * dotSpacing;
    const col = sc >= 4 ? '#00ff88' : sc >= 3 ? '#ffdd3b' : '#ff4466';
    ctx.beginPath(); ctx.arc(x, dotY, 16, 0, Math.PI * 2);
    ctx.fillStyle = col + '22'; ctx.fill();
    ctx.strokeStyle = col + '80'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = col; ctx.textAlign = 'center';
    ctx.fillText(String(sc), x, dotY + 5);
  });
  ctx.font = `400 13px "DM Mono", monospace`;
  ctx.fillStyle = '#334466'; ctx.textAlign = 'center';
  ctx.fillText('daily scores', W / 2, dotY + 38);

  // CTA
  ctx.font = `400 22px "DM Sans", sans-serif`;
  ctx.fillStyle = '#556688'; ctx.textAlign = 'center';
  ctx.fillText('Track your market knowledge at', W / 2, 832);
  ctx.save();
  ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 20;
  ctx.font = `700 28px "DM Mono", monospace`;
  ctx.fillStyle = '#00ff88';
  ctx.fillText(BRAND_HOST, W / 2, 870);
  ctx.restore();

  // Bottom bar gradient
  const bg = ctx.createLinearGradient(0, 0, W, 0);
  bg.addColorStop(0, 'transparent'); bg.addColorStop(0.5, '#00ff88'); bg.addColorStop(1, 'transparent');
  ctx.fillStyle = bg; ctx.fillRect(0, H - 4, W, 4);

  return canvas.toDataURL('image/png');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short',
  });
}

function fmtWeekRange(start: string, end: string) {
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

// ─── Single report view ───────────────────────────────────────────────────────

interface ReportViewProps {
  report:   WeeklyReport;
  userName: string;
  session:  any;
  isLatest: boolean;
}

function ReportView({ report, userName, session, isLatest }: ReportViewProps) {
  const scores     = JSON.parse(report.scores_json) as number[];
  const strongCats = JSON.parse(report.strong_cats) as string[];
  const weakCats   = JSON.parse(report.weak_cats)   as string[];
  const iqDelta    = report.iq_end - report.iq_start;
  const accuracy   = report.accuracy_pct;
  const acColor    = accuracy >= 80 ? '#00ff88' : accuracy >= 60 ? '#ffdd3b' : '#ff4466';

  const { displayed, done } = useTypewriter(isLatest ? report.ai_report : '', 16, 600);
  const [shareUrl,  setShareUrl]  = useState('');
  const [sharing,   setSharing]   = useState(false);
  const [copied,    setCopied]    = useState(false);

  // Mark as read on mount if latest
  useEffect(() => {
    if (!isLatest || report.is_read || !session?.access_token) return;
    fetch(`/api/reports/weekly/${report.id}/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    }).catch(() => {});
  }, []);

  const handleShare = async () => {
    setSharing(true);
    try {
      const url = await generateWeekShareCard(report, userName);
      setShareUrl(url);
    } finally {
      setSharing(false);
    }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href     = shareUrl;
    a.download = `ms-weekly-${report.week_end}.png`;
    a.click();
  };

  const handleCopy = async () => {
    const text =
      `My Market Samachar week: ${Math.round(accuracy)}% accuracy | IQ ${iqDelta >= 0 ? '+' : ''}${iqDelta}\n` +
      `Scores: ${scores.join(', ')} | ${BRAND_HOST}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        {/* Accuracy */}
        <div style={{ background: '#07070e', border: `1px solid ${acColor}30`, borderRadius: 8 }} className="p-2.5 text-center">
          <div style={{ color: acColor, ...MONO, fontSize: 20, fontWeight: 700 }}>
            {Math.round(accuracy)}%
          </div>
          <div style={{ color: '#334466', ...MONO }} className="text-[9px] uppercase mt-0.5">Accuracy</div>
        </div>

        {/* Quizzes */}
        <div style={{ background: '#07070e', border: '1px solid #1e1e2e', borderRadius: 8 }} className="p-2.5 text-center">
          <div style={{ color: '#e8eaf0', ...MONO, fontSize: 20, fontWeight: 700 }}>
            {report.quizzes_taken}<span style={{ color: '#334466', fontSize: 13 }}>/{report.quizzes_possible}</span>
          </div>
          <div style={{ color: '#334466', ...MONO }} className="text-[9px] uppercase mt-0.5">Quizzes</div>
        </div>

        {/* IQ change */}
        <div style={{ background: '#07070e', border: `1px solid ${iqDelta >= 0 ? '#00ff8830' : '#ff446630'}`, borderRadius: 8 }} className="p-2.5 text-center">
          <div style={{ color: iqDelta >= 0 ? '#00ff88' : '#ff4466', ...MONO }} className="text-[20px] font-bold flex items-center justify-center gap-0.5">
            {iqDelta > 0 ? <TrendingUp size={14} /> : iqDelta < 0 ? <TrendingDown size={14} /> : <Minus size={14} />}
            {iqDelta >= 0 ? '+' : ''}{iqDelta}
          </div>
          <div style={{ color: '#334466', ...MONO }} className="text-[9px] uppercase mt-0.5">IQ Δ</div>
        </div>

        {/* Rank */}
        {report.rank_weekly && (
          <div style={{ background: '#07070e', border: '1px solid #1e1e2e', borderRadius: 8 }} className="p-2.5 text-center">
            <div style={{ color: '#ffdd3b', ...MONO, fontSize: 20, fontWeight: 700 }}>#{report.rank_weekly}</div>
            <div style={{ color: '#334466', ...MONO }} className="text-[9px] uppercase mt-0.5">Week Rank</div>
          </div>
        )}
      </div>

      {/* Daily score dots */}
      <div>
        <div style={{ color: '#334466', ...MONO }} className="text-[9px] uppercase tracking-wider mb-2">Daily Scores</div>
        <div className="flex items-center gap-2">
          {Array.from({ length: 7 }, (_, i) => {
            const sc = scores[i];
            const hasScore = sc !== undefined;
            const col = !hasScore ? '#2a2a4a' : sc >= 4 ? '#00ff88' : sc >= 3 ? '#ffdd3b' : '#ff4466';
            return (
              <div
                key={i}
                style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: col + (hasScore ? '18' : '10'),
                  border: `1px solid ${col}40`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {hasScore
                  ? <span style={{ color: col, ...MONO, fontSize: 13, fontWeight: 700 }}>{sc}</span>
                  : <span style={{ color: '#2a2a4a', fontSize: 10 }}>—</span>
                }
              </div>
            );
          })}
          <div style={{ marginLeft: 4 }}>
            <div style={{ color: '#8899aa', ...MONO, fontSize: 12 }}>{report.iq_start} → {report.iq_end}</div>
            <div style={{ color: '#334466', ...MONO, fontSize: 9 }}>IQ this week</div>
          </div>
        </div>
      </div>

      {/* Strong / weak categories */}
      {(strongCats.length > 0 || weakCats.length > 0) && (
        <div className="grid grid-cols-2 gap-2">
          {strongCats.length > 0 && (
            <div style={{ background: '#00ff8808', border: '1px solid #00ff8820', borderRadius: 8 }} className="p-2.5">
              <div style={{ color: '#00ff88', ...MONO }} className="text-[9px] uppercase mb-1.5">Strong</div>
              <div className="flex flex-wrap gap-1">
                {strongCats.map(c => (
                  <span key={c} style={{ background: '#00ff8818', border: '1px solid #00ff8830', color: '#00ff88', ...MONO, fontSize: 9, padding: '1px 6px', borderRadius: 20 }}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
          {weakCats.length > 0 && (
            <div style={{ background: '#ff446608', border: '1px solid #ff446620', borderRadius: 8 }} className="p-2.5">
              <div style={{ color: '#ff4466', ...MONO }} className="text-[9px] uppercase mb-1.5">Needs Work</div>
              <div className="flex flex-wrap gap-1">
                {weakCats.map(c => (
                  <span key={c} style={{ background: '#ff446618', border: '1px solid #ff446630', color: '#ff4466', ...MONO, fontSize: 9, padding: '1px 6px', borderRadius: 20 }}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI report with typewriter */}
      {report.ai_report && (
        <div style={{ background: '#07070e', border: '1px solid #1e1e2e', borderRadius: 8 }} className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <Brain size={11} style={{ color: '#3b9eff' }} />
            <span style={{ color: '#3b9eff', ...MONO }} className="text-[9px] uppercase tracking-wider">AI Mentor Analysis</span>
            {!done && isLatest && <span className="inline-block w-1.5 h-3 ml-0.5 bg-[#3b9eff] animate-pulse" />}
          </div>
          <p style={{ color: '#8899aa', ...SANS, fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {isLatest ? displayed : report.ai_report}
            {!done && isLatest && <span className="inline-block w-0.5 h-3 ml-px bg-[#3b9eff] animate-pulse align-text-bottom" />}
          </p>
        </div>
      )}

      {/* Share section */}
      <div>
        {!shareUrl ? (
          <button
            onClick={handleShare}
            disabled={sharing}
            style={{ background: '#07070e', border: '1px solid #1e1e2e', color: '#8899aa', ...MONO }}
            className="w-full py-2 rounded text-[11px] uppercase tracking-wide flex items-center justify-center gap-2 hover:border-[#00ff8830] hover:text-[#00ff88] transition-all disabled:opacity-50"
          >
            {sharing
              ? <><Loader2 size={12} className="animate-spin" /> Generating card…</>
              : <><Share2 size={12} /> Share My Week</>
            }
          </button>
        ) : (
          <div className="space-y-2">
            <img
              src={shareUrl}
              alt="Share card"
              style={{ width: '100%', borderRadius: 8, border: '1px solid #1e1e2e', display: 'block' }}
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleDownload}
                style={{ background: '#07070e', border: '1px solid #1e1e2e', color: '#8899aa', ...MONO }}
                className="py-2 rounded text-[11px] uppercase tracking-wide flex items-center justify-center gap-1.5 hover:text-[#00ff88] hover:border-[#00ff8830] transition-all"
              >
                <Download size={12} /> Download
              </button>
              <button
                onClick={handleCopy}
                style={{
                  background: copied ? '#00ff8818' : '#07070e',
                  border: `1px solid ${copied ? '#00ff8840' : '#1e1e2e'}`,
                  color: copied ? '#00ff88' : '#8899aa',
                  ...MONO,
                }}
                className="py-2 rounded text-[11px] uppercase tracking-wide flex items-center justify-center gap-1.5 transition-all"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copied!' : 'Copy Text'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function WeeklyReportCard() {
  const { user, profile, session } = useAuth();
  const [reports,    setReports]    = useState<WeeklyReport[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [showArchive, setShowArchive] = useState(false);
  const [archiveIdx,  setArchiveIdx]  = useState<number | null>(null);
  const fetched = useRef(false);

  useEffect(() => {
    if (!user || !session?.access_token || fetched.current) return;
    fetched.current = true;
    setLoading(true);

    fetch('/api/reports/weekly?limit=8', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(r => r.json())
      .then(d => setReports(d.reports ?? []))
      .catch(() => setError('Could not load report'))
      .finally(() => setLoading(false));
  }, [user, session]);

  if (!user || !profile) return null;

  const latest   = reports[0];
  const archived = reports.slice(1);
  const unread   = latest && !latest.is_read;

  return (
    <div
      style={{
        background: '#0d0d1e',
        border: '1px solid #1e1e2e',
        borderTop: unread ? '2px solid #3b9eff' : '2px solid #1e1e2e',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{ background: '#07070e', borderBottom: '1px solid #1e1e2e' }}
        className="px-4 py-2.5 flex items-center gap-2"
      >
        <BarChart2 size={13} style={{ color: '#3b9eff' }} />
        <span style={{ color: '#3b9eff', ...MONO }} className="text-[10px] uppercase tracking-widest">
          Weekly Performance
        </span>
        {unread && (
          <span
            style={{ background: '#3b9eff18', border: '1px solid #3b9eff40', color: '#3b9eff', ...MONO, fontSize: 9 }}
            className="px-1.5 py-0.5 rounded-full"
          >
            NEW
          </span>
        )}
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex items-center gap-2 py-4" style={{ color: '#334466' }}>
            <Loader2 size={13} className="animate-spin" />
            <span style={{ ...MONO }} className="text-[10px] uppercase">Loading report…</span>
          </div>
        ) : error ? (
          <p style={{ color: '#ff4466', ...MONO }} className="text-[10px] py-2">{error}</p>
        ) : !latest ? (
          <div className="py-4 text-center">
            <Calendar size={24} style={{ color: '#2a2a4a', margin: '0 auto 8px' }} />
            <p style={{ color: '#334466', ...MONO }} className="text-[10px] uppercase">
              No report yet
            </p>
            <p style={{ color: '#2a2a4a', ...SANS, fontSize: 11, marginTop: 4 }}>
              Reports are generated every Sunday 8 PM IST for Pro users who completed quizzes this week.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Week label */}
            <div className="flex items-center justify-between">
              <span style={{ color: '#556688', ...MONO }} className="text-[10px]">
                {fmtWeekRange(latest.week_start, latest.week_end)}
              </span>
              <span style={{ color: '#334466', ...MONO }} className="text-[9px] uppercase">
                Latest
              </span>
            </div>

            <ReportView
              report={latest}
              userName={profile.name ?? 'Anonymous'}
              session={session}
              isLatest
            />
          </div>
        )}

        {/* Archive */}
        {archived.length > 0 && (
          <div className="mt-4">
            <div style={{ height: 1, background: '#1e1e2e', marginBottom: 12 }} />
            <button
              onClick={() => setShowArchive(v => !v)}
              style={{ color: '#334466', ...MONO, background: 'none', border: 'none', cursor: 'pointer', width: '100%' }}
              className="flex items-center gap-2 text-[9px] uppercase tracking-wider hover:text-[#556688] transition-colors"
            >
              <Calendar size={11} />
              Past Reports ({archived.length})
              {showArchive ? <ChevronUp size={11} className="ml-auto" /> : <ChevronDown size={11} className="ml-auto" />}
            </button>

            {showArchive && (
              <div className="mt-3 space-y-2">
                {archived.map((r, i) => (
                  <div
                    key={r.id}
                    style={{ background: '#07070e', border: '1px solid #1e1e2e', borderRadius: 8 }}
                  >
                    <button
                      onClick={() => setArchiveIdx(archiveIdx === i ? null : i)}
                      style={{ color: '#556688', ...MONO, background: 'none', border: 'none', cursor: 'pointer', width: '100%' }}
                      className="flex items-center gap-2 px-3 py-2 text-[10px] hover:text-[#8899aa] transition-colors"
                    >
                      <span>{fmtWeekRange(r.week_start, r.week_end)}</span>
                      <span style={{ color: r.accuracy_pct >= 80 ? '#00ff88' : r.accuracy_pct >= 60 ? '#ffdd3b' : '#ff4466', marginLeft: 'auto' }}>
                        {Math.round(r.accuracy_pct)}%
                      </span>
                      {archiveIdx === i ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    </button>

                    {archiveIdx === i && (
                      <div className="px-3 pb-3 border-t border-[#1e1e2e]" style={{ paddingTop: 12 }}>
                        <ReportView
                          report={r}
                          userName={profile.name ?? 'Anonymous'}
                          session={session}
                          isLatest={false}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
