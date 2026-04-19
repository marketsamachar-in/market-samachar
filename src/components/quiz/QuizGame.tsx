import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, ExternalLink, ChevronRight, Loader2, Flame } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import type { SafeQuestion, SubmitResult } from './types';
import { CAT_COLOR, DIFF_COLOR } from './types';

const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif" };
const TIME_PER_Q = 30;
const LETTERS = ['A', 'B', 'C', 'D'];

const QUIZ_CSS = `
@keyframes qz-shake {
  0%,100% { transform: translateX(0); }
  15%     { transform: translateX(-5px); }
  30%     { transform: translateX(5px); }
  45%     { transform: translateX(-4px); }
  60%     { transform: translateX(4px); }
  75%     { transform: translateX(-2px); }
  90%     { transform: translateX(2px); }
}
@keyframes qz-slide-in {
  from { opacity: 0; transform: translateX(28px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes qz-fade-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes qz-pulse {
  0%,100% { opacity: 1; }
  50%     { opacity: 0.35; }
}
.qz-slide-in { animation: qz-slide-in 0.22s ease both; }
.qz-fade-in  { animation: qz-fade-in 0.25s ease both; }
.qz-shake    { animation: qz-shake 0.5s ease; }
.qz-pulse    { animation: qz-pulse 0.65s ease infinite; }
`;

// ─── Types ────────────────────────────────────────────────────────────────────
interface RevealData {
  correct_index:   number;
  correct:         boolean;
  explanation:     string;
  news_source_url: string;
}

interface QuizGameProps {
  questions:    SafeQuestion[];
  onComplete:   (result: SubmitResult) => void;
  onClose:      () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function QuizGame({ questions, onComplete, onClose }: QuizGameProps) {
  const { session } = useAuth();

  const [qIndex,       setQIndex]       = useState(0);
  const [timeLeft,     setTimeLeft]     = useState(TIME_PER_Q);
  const [selectedIdx,  setSelectedIdx]  = useState<number | null>(null);
  const [reveal,       setReveal]       = useState<RevealData | null>(null);
  const [checking,     setChecking]     = useState(false);
  const [timedOut,     setTimedOut]     = useState(false);
  const [sliding,      setSliding]      = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [submitError,  setSubmitError]  = useState('');
  const [liveScore,    setLiveScore]    = useState(0);
  const [confirmQuit,  setConfirmQuit]  = useState(false);

  const answersRef   = useRef<number[]>(Array(questions.length).fill(-1));
  const startTimeRef = useRef(Date.now());
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentQ = questions[qIndex];
  const answered = selectedIdx !== null || timedOut;

  // ── Timer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (answered) return;
    if (timeLeft <= 0) { handleTimeout(); return; }
    timerRef.current = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [timeLeft, answered]);

  // Reset per question
  useEffect(() => {
    setTimeLeft(TIME_PER_Q);
    setSelectedIdx(null);
    setReveal(null);
    setTimedOut(false);
    setChecking(false);
    setSliding(false);
  }, [qIndex]);

  // ── Timer colours ─────────────────────────────────────────────────────────
  const timerColor  = timeLeft <= 10 ? '#ff4466' : timeLeft <= 15 ? '#ffdd3b' : '#00ff88';
  const timerPulse  = timeLeft <= 10 && !answered;
  const timerShake  = timeLeft <= 5  && !answered;
  const timerPct    = (timeLeft / TIME_PER_Q) * 100;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleTimeout = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    answersRef.current[qIndex] = -1;
    setTimedOut(true);
  }, [qIndex]);

  const handleAnswer = useCallback(async (idx: number) => {
    if (answered || checking) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    answersRef.current[qIndex] = idx;
    setSelectedIdx(idx);
    setChecking(true);

    try {
      const token = session?.access_token;
      const res = await fetch('/api/quiz/check', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ question_id: currentQ.id, answer_index: idx }),
      });
      if (res.ok) {
        const data: RevealData = await res.json();
        setReveal(data);
        if (data.correct) setLiveScore(s => s + 1);
      }
    } catch {
      // Reveal unavailable — still allow advancing
    }
    setChecking(false);
  }, [answered, checking, qIndex, currentQ.id, session]);

  // ── Advance to next question / submit ─────────────────────────────────────
  const advance = useCallback(() => {
    if (qIndex < questions.length - 1) {
      setSliding(true);
      setTimeout(() => {
        setQIndex(i => i + 1);
        setSliding(false);
      }, 220);
    } else {
      submitQuiz();
    }
  }, [qIndex, questions.length]);

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function submitQuiz() {
    setSubmitting(true);
    setSubmitError('');
    const answers   = answersRef.current.map(a => Math.max(0, a));
    const timeTaken = Math.round((Date.now() - startTimeRef.current) / 1000);
    const token     = session?.access_token;

    if (!token) {
      setSubmitError('Please sign in to save your score.');
      setSubmitting(false);
      return;
    }
    try {
      const res = await fetch('/api/quiz/submit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ answers, time_taken_secs: Math.max(1, timeTaken) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(
          res.status === 409
            ? 'Already played today! Check the leaderboard.'
            : (data.error ?? 'Submission failed'),
        );
        setSubmitting(false);
        return;
      }
      onComplete(data as SubmitResult);
    } catch {
      setSubmitError('Network error. Please try again.');
      setSubmitting(false);
    }
  }

  const progress = ((qIndex + (answered ? 1 : 0)) / questions.length) * 100;

  // ─ Option styling ────────────────────────────────────────────────────────
  function optionStyle(i: number): {
    borderColor: string; bgColor: string; textColor: string;
    letterBg: string; letterColor: string; checkmark: string;
  } {
    const isSelected = selectedIdx === i;
    const isCorrect  = reveal !== null && i === reveal.correct_index;
    const isWrong    = reveal !== null && isSelected && !reveal.correct;
    const isLocked   = answered;

    if (reveal) {
      if (isCorrect)
        return { borderColor:'#00ff8855', bgColor:'#00ff8814', textColor:'#e8eaf0', letterBg:'#00ff8825', letterColor:'#00ff88', checkmark: isSelected ? '✅' : '✓' };
      if (isWrong)
        return { borderColor:'#ff446655', bgColor:'#ff446614', textColor:'#e8eaf0', letterBg:'#ff446625', letterColor:'#ff4466', checkmark: '❌' };
      return { borderColor:'#0f0f20', bgColor:'#070710', textColor:'#2a2a3a', letterBg:'#0f0f20', letterColor:'#222230', checkmark: '' };
    }
    if (isSelected && checking)
      return { borderColor:'#ffdd3b40', bgColor:'#ffdd3b0a', textColor:'#e8eaf0', letterBg:'#ffdd3b18', letterColor:'#ffdd3b', checkmark: '' };
    if (isSelected)
      return { borderColor:'#ffdd3b40', bgColor:'#ffdd3b0a', textColor:'#e8eaf0', letterBg:'#ffdd3b18', letterColor:'#ffdd3b', checkmark: '' };
    if (!isLocked)
      return { borderColor:'#1e1e2e', bgColor:'#07070e', textColor:'#aab8cc', letterBg:'#1e1e2e', letterColor:'#556688', checkmark: '' };
    return { borderColor:'#111122', bgColor:'#07070e', textColor:'#3a3a5a', letterBg:'#111122', letterColor:'#222232', checkmark: '' };
  }

  return (
    <>
      <style>{QUIZ_CSS}</style>
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(7,7,14,0.97)',
        zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}>
        <div
          style={{
            background: '#0d0d1e',
            border: '1px solid #1e1e2e',
            borderRadius: 14,
            width: '100%', maxWidth: 560,
            maxHeight: '90vh', overflowY: 'auto',
            opacity: sliding ? 0 : 1,
            transform: sliding ? 'translateX(20px)' : 'translateX(0)',
            transition: sliding ? 'opacity 0.18s ease, transform 0.18s ease' : 'none',
          }}
          className={!sliding ? 'qz-slide-in' : ''}
        >
          {/* ── Top bar ───────────────────────────────────────────────────── */}
          <div
            style={{ borderBottom: '1px solid #1e1e2e', background: '#07070e' }}
            className="px-4 py-3 flex items-center gap-3"
          >
            <span style={{ color: '#00ff88', ...MONO }} className="text-[10px] uppercase tracking-widest">
              Market Quiz
            </span>
            <span style={{ color: '#334466', ...MONO }} className="text-[10px]">
              Q {qIndex + 1}/{questions.length}
            </span>

            {/* Live score */}
            {liveScore > 0 && (
              <span style={{ color: '#00ff88', ...MONO }} className="text-[10px] flex items-center gap-1">
                ✓ {liveScore}
              </span>
            )}

            {/* Progress bar */}
            <div style={{ flex: 1, background: '#1e1e2e', height: 3, borderRadius: 2 }}>
              <div style={{
                width: `${progress}%`,
                background: '#00ff88', height: '100%', borderRadius: 2,
                transition: 'width 0.4s ease',
              }} />
            </div>

            <button
              onClick={() => setConfirmQuit(true)}
              style={{
                color: '#ff4466', background: 'rgba(255,68,102,0.08)',
                border: '1px solid rgba(255,68,102,0.3)', borderRadius: 5,
                cursor: 'pointer', padding: '3px 8px',
                display: 'flex', alignItems: 'center', gap: 4,
                ...MONO, fontSize: '0.6rem', letterSpacing: '0.06em',
              }}
              title="Quit quiz"
            >
              <X size={12} /> QUIT
            </button>
          </div>

          <div className="p-5">
            {/* ── Timer + category row ────────────────────────────────────── */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span
                  style={{
                    color:       CAT_COLOR[currentQ.category] ?? '#00ff88',
                    borderColor: `${CAT_COLOR[currentQ.category] ?? '#00ff88'}40`,
                    ...MONO,
                  }}
                  className="text-[9px] border px-2 py-0.5 rounded-sm uppercase tracking-wider"
                >
                  {currentQ.category}
                </span>
                <span
                  style={{
                    color:       DIFF_COLOR[currentQ.difficulty] ?? '#00ff88',
                    borderColor: `${DIFF_COLOR[currentQ.difficulty] ?? '#00ff88'}40`,
                    ...MONO,
                  }}
                  className="text-[9px] border px-2 py-0.5 rounded-sm uppercase tracking-wider"
                >
                  {currentQ.difficulty}
                </span>
              </div>

              {/* Countdown */}
              <div className={`flex items-center gap-2 ${timerShake ? 'qz-shake' : ''}`}>
                <div style={{ width: 60, background: '#1a1a2e', height: 4, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    width: `${timerPct}%`, height: '100%',
                    background: timerColor,
                    transition: 'width 0.9s linear, background 0.4s',
                    borderRadius: 2,
                  }} />
                </div>
                <span
                  style={{
                    color: timerColor, ...MONO,
                    fontSize: 15, fontWeight: 700,
                    minWidth: 24, textAlign: 'right',
                  }}
                  className={timerPulse ? 'qz-pulse' : ''}
                >
                  {timeLeft}
                </span>
              </div>
            </div>

            {/* ── Question ────────────────────────────────────────────────── */}
            <p style={{ color: '#e8eaf0', lineHeight: 1.65, ...SANS, fontSize: 16, fontWeight: 500, marginBottom: '1.5rem' }}>
              {currentQ.question}
            </p>

            {/* ── Options ─────────────────────────────────────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: '1.25rem' }}>
              {currentQ.options.map((opt, i) => {
                const s = optionStyle(i);
                const isSelected = selectedIdx === i;
                const isCorrect  = reveal !== null && i === reveal.correct_index;
                const isLocked   = answered;

                return (
                  <button
                    key={i}
                    onClick={() => handleAnswer(i)}
                    disabled={isLocked || checking}
                    style={{
                      width:        '100%',
                      background:   s.bgColor,
                      border:       `1px solid ${s.borderColor}`,
                      borderRadius: 8,
                      padding:      '10px 14px',
                      display:      'flex',
                      alignItems:   'center',
                      gap:          12,
                      cursor:       isLocked || checking ? 'default' : 'pointer',
                      transition:   'all 0.18s ease',
                      textAlign:    'left',
                    }}
                    className={!isLocked && !checking ? 'hover:border-[#00ff8830] hover:bg-[#00ff8808]' : ''}
                  >
                    {/* Letter badge */}
                    <span style={{
                      background:  s.letterBg,
                      color:       s.letterColor,
                      borderRadius: 4,
                      width: 24, height: 24, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontFamily: "'DM Mono', monospace", fontWeight: 600,
                    }}>
                      {LETTERS[i]}
                    </span>

                    {/* Text */}
                    <span style={{ color: s.textColor, ...SANS, fontSize: 13, lineHeight: 1.4, flex: 1 }}>
                      {opt}
                    </span>

                    {/* Result icon */}
                    {reveal && isCorrect && (
                      <span style={{ flexShrink: 0, fontSize: 14 }}>✅</span>
                    )}
                    {reveal && isSelected && !isCorrect && (
                      <span style={{ flexShrink: 0, fontSize: 14 }}>❌</span>
                    )}

                    {/* Checking spinner */}
                    {checking && isSelected && (
                      <Loader2 size={13} className="animate-spin" style={{ color: '#ffdd3b', flexShrink: 0 }} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── Explanation panel ────────────────────────────────────────── */}
            {reveal && (
              <div
                style={{
                  background: reveal.correct ? '#00ff8810' : '#ff446610',
                  border:     `1px solid ${reveal.correct ? '#00ff8830' : '#ff446630'}`,
                  borderLeft: `3px solid ${reveal.correct ? '#00ff88' : '#ff4466'}`,
                  borderRadius: '0 8px 8px 0',
                  padding: '12px 14px',
                  marginBottom: '1rem',
                }}
                className="qz-fade-in"
              >
                <p style={{
                  color: reveal.correct ? '#00ff88' : '#ff4466',
                  ...MONO, fontSize: 10, letterSpacing: '0.08em',
                  marginBottom: reveal.explanation ? 8 : 0,
                }}>
                  {reveal.correct ? '✅  CORRECT!' : '❌  INCORRECT'}
                </p>
                {reveal.explanation && (
                  <p style={{ color: '#9ab0c8', ...SANS, fontSize: 12, lineHeight: 1.65, marginBottom: 8 }}>
                    {reveal.explanation}
                  </p>
                )}
                {reveal.news_source_url && (
                  <a
                    href={reveal.news_source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#3b9eff', ...MONO }}
                    className="flex items-center gap-1.5 text-[10px] hover:underline uppercase"
                  >
                    <ExternalLink size={10} /> Read Source Article
                  </a>
                )}
              </div>
            )}

            {/* ── Timeout notice ───────────────────────────────────────────── */}
            {timedOut && (
              <div
                style={{ background: '#ff446610', border: '1px solid #ff446630', borderRadius: 8 }}
                className="px-3 py-2 mb-3 qz-fade-in"
              >
                <p style={{ color: '#ff4466', ...MONO }} className="text-[11px] uppercase">
                  ⏰ Time's up — moving on
                </p>
              </div>
            )}

            {/* ── Next / Submit button ─────────────────────────────────────── */}
            {(reveal || timedOut) && !submitting && (
              <button
                onClick={advance}
                style={{
                  background: '#00ff88', color: '#07070e', border: 'none',
                  borderRadius: 8, cursor: 'pointer', ...MONO,
                }}
                className="w-full py-2.5 text-[11px] font-semibold uppercase tracking-wider flex items-center justify-center gap-2 qz-fade-in"
              >
                {qIndex < questions.length - 1
                  ? <><ChevronRight size={14} />Next Question</>
                  : <>See Results →</>
                }
              </button>
            )}

            {/* ── Submit error ─────────────────────────────────────────────── */}
            {submitError && (
              <div
                style={{ background: '#ff446612', border: '1px solid #ff446630', borderRadius: 6 }}
                className="px-3 py-2 mt-3"
              >
                <p style={{ color: '#ff4466', ...MONO }} className="text-[11px]">{submitError}</p>
              </div>
            )}

            {/* ── Submitting loader ─────────────────────────────────────────── */}
            {submitting && (
              <div className="flex items-center justify-center gap-2 py-4" style={{ color: '#00ff88' }}>
                <Loader2 size={14} className="animate-spin" />
                <span style={{ ...MONO }} className="text-[11px] uppercase">Grading your answers…</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Quit confirmation dialog ──────────────────────────────────────── */}
      {confirmQuit && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(7,7,14,0.92)',
          zIndex: 10001,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem',
        }}>
          <div style={{
            background: '#0d0d1e',
            border: '1px solid #ff446640',
            borderTop: '2px solid #ff4466',
            borderRadius: 12,
            padding: '1.5rem',
            width: '100%', maxWidth: 340,
            textAlign: 'center',
          }}>
            <p style={{ color: '#e8eaf0', ...SANS, fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              Quit the quiz?
            </p>
            <p style={{ color: '#556688', ...MONO, fontSize: 11, marginBottom: 20 }}>
              Your progress will be lost. This counts as your daily attempt.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setConfirmQuit(false)}
                style={{
                  flex: 1, padding: '10px 0',
                  background: 'none', border: '1px solid #1e1e2e',
                  borderRadius: 8, color: '#778899',
                  cursor: 'pointer', ...MONO, fontSize: 11,
                }}
              >
                Keep Playing
              </button>
              <button
                onClick={onClose}
                style={{
                  flex: 1, padding: '10px 0',
                  background: 'rgba(255,68,102,0.12)', border: '1px solid #ff446640',
                  borderRadius: 8, color: '#ff4466',
                  cursor: 'pointer', ...MONO, fontSize: 11,
                }}
              >
                Quit
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
