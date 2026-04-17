/**
 * NewsImpactQuiz — interactive quiz that tests understanding of news market impact.
 * Questions are auto-generated from AI-processed articles.
 * Correct answers earn 1X (100 coins).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Brain, CheckCircle, XCircle, ChevronRight, Zap, RefreshCw } from 'lucide-react';

const C: Record<string, string> = {
  bg:     '#07070e',
  card:   '#0d0d1e',
  border: '#1e1e2e',
  green:  '#00ff88',
  red:    '#ff4466',
  text:   '#e8eaf0',
  muted:  '#888899',
  dim:    '#444455',
  blue:   '#3b9eff',
  purple: '#b366ff',
  yellow: '#ffdd3b',
};

const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif" };

interface QuizQuestion {
  id: number;
  articleTitle: string;
  category: string;
  questionText: string;
  options: { A: string; B: string; C: string; D: string };
  symbol: string | null;
  reward: number;
}

interface AnswerResult {
  isCorrect: boolean;
  correct: string;
  coinsEarned: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  indian:    '#00ff88',
  companies: '#ffdd3b',
  global:    '#3bffee',
  commodity: '#ff6b3b',
  crypto:    '#b366ff',
  ipo:       '#ff3bff',
  economy:   '#3b9eff',
  banking:   '#3b9eff',
  sebi:      '#ff9f3b',
  rbi:       '#3b9eff',
};

export default function NewsImpactQuiz({ authToken }: { authToken?: string }) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0, coins: 0 });

  const fetchQuestions = useCallback(async () => {
    if (!authToken) { setLoading(false); return; }
    try {
      const res = await fetch('/api/news-impact/questions?limit=5', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setQuestions(data.questions ?? []);
        setCurrent(0);
        setSelected(null);
        setResult(null);
        setScore({ correct: 0, total: 0, coins: 0 });
      }
    } catch {}
    finally { setLoading(false); }
  }, [authToken]);

  useEffect(() => { fetchQuestions(); }, [fetchQuestions]);

  const handleSubmit = async () => {
    if (!selected || !authToken || submitting) return;
    const q = questions[current];
    setSubmitting(true);
    try {
      const res = await fetch(`/api/news-impact/${q.id}/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ selected }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult(data);
        setScore(prev => ({
          correct: prev.correct + (data.isCorrect ? 1 : 0),
          total: prev.total + 1,
          coins: prev.coins + data.coinsEarned,
        }));
      }
    } catch {}
    finally { setSubmitting(false); }
  };

  const handleNext = () => {
    if (current < questions.length - 1) {
      setCurrent(prev => prev + 1);
      setSelected(null);
      setResult(null);
    }
  };

  // Not signed in
  if (!authToken) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <Brain size={32} color={C.purple} />
        <p style={{ color: C.muted, ...MONO, fontSize: 12, marginTop: 12 }}>
          Sign in to play News Impact Quiz
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, height: 200,
          animation: 'pulse 1.5s ease-in-out infinite' }} />
        <style>{`@keyframes pulse{0%,100%{opacity:.4}50%{opacity:.8}}`}</style>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <Brain size={32} color={C.dim} />
        <p style={{ color: C.muted, ...SANS, fontSize: 13, marginTop: 12 }}>
          No new quiz questions right now. Check back soon!
        </p>
        <button onClick={() => { setLoading(true); fetchQuestions(); }}
          style={{ marginTop: 12, background: 'none', border: `1px solid ${C.border}`, borderRadius: 8,
            color: C.green, padding: '6px 14px', cursor: 'pointer', ...MONO, fontSize: 11 }}>
          <RefreshCw size={12} style={{ marginRight: 4 }} /> Refresh
        </button>
      </div>
    );
  }

  // All done
  if (current >= questions.length || (result && current === questions.length - 1 && result)) {
    const isAllDone = result && current === questions.length - 1;
    if (isAllDone) {
      return (
        <div style={{ padding: 20 }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, textAlign: 'center' }}>
            <Zap size={36} color={C.yellow} />
            <h3 style={{ color: C.text, ...SANS, fontSize: 18, margin: '12px 0 6px' }}>
              Quiz Complete!
            </h3>
            <p style={{ color: C.green, ...MONO, fontSize: 22, margin: '8px 0' }}>
              {score.correct + (result?.isCorrect ? 1 : 0)}/{score.total + 1} Correct
            </p>
            <p style={{ color: C.yellow, ...MONO, fontSize: 14 }}>
              +{score.coins + (result?.coinsEarned ?? 0)} coins earned
            </p>
            <button onClick={() => { setLoading(true); fetchQuestions(); }}
              style={{ marginTop: 16, background: C.green, color: '#000', border: 'none', borderRadius: 8,
                padding: '10px 24px', cursor: 'pointer', ...MONO, fontSize: 12, fontWeight: 500 }}>
              Play Again
            </button>
          </div>
        </div>
      );
    }
  }

  const q = questions[current];
  const catColor = CATEGORY_COLORS[q.category] ?? C.green;

  return (
    <div style={{ padding: '12px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Brain size={16} color={C.purple} />
          <span style={{ color: C.purple, ...MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            News Impact Quiz
          </span>
        </div>
        <span style={{ color: C.muted, ...MONO, fontSize: 11 }}>
          {current + 1}/{questions.length}
        </span>
      </div>

      {/* Score bar */}
      {score.total > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 10, ...MONO, fontSize: 11 }}>
          <span style={{ color: C.green }}>{score.correct} correct</span>
          <span style={{ color: C.yellow }}>+{score.coins} coins</span>
        </div>
      )}

      {/* Question card */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
        borderLeft: `3px solid ${catColor}`, overflow: 'hidden',
      }}>
        {/* Article context */}
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
          <span style={{ color: catColor, ...MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {q.category} {q.symbol ? `· ${q.symbol}` : ''}
          </span>
          <p style={{ color: C.muted, ...SANS, fontSize: 12, margin: '4px 0 0', lineHeight: 1.4,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {q.articleTitle}
          </p>
        </div>

        {/* Question */}
        <div style={{ padding: 16 }}>
          <p style={{ color: C.text, ...SANS, fontSize: 14, lineHeight: 1.5, margin: '0 0 16px' }}>
            {q.questionText}
          </p>

          {/* Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(['A', 'B', 'C', 'D'] as const).map((key) => {
              const optText = q.options[key];
              const isSelected = selected === key;
              const isCorrectAnswer = result?.correct === key;
              const isWrongSelected = result && isSelected && !result.isCorrect;

              let bg = 'transparent';
              let borderColor = C.border;
              if (result) {
                if (isCorrectAnswer) { bg = C.green + '15'; borderColor = C.green; }
                else if (isWrongSelected) { bg = C.red + '15'; borderColor = C.red; }
              } else if (isSelected) {
                bg = C.blue + '15'; borderColor = C.blue;
              }

              return (
                <button
                  key={key}
                  onClick={() => !result && setSelected(key)}
                  disabled={!!result}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: bg, border: `1px solid ${borderColor}`, borderRadius: 10,
                    padding: '10px 14px', cursor: result ? 'default' : 'pointer',
                    textAlign: 'left', transition: 'all 0.2s',
                  }}
                >
                  <span style={{
                    width: 24, height: 24, borderRadius: '50%', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    border: `1.5px solid ${isSelected || isCorrectAnswer ? (result ? (isCorrectAnswer ? C.green : C.red) : C.blue) : C.dim}`,
                    color: isSelected || isCorrectAnswer ? (result ? (isCorrectAnswer ? C.green : C.red) : C.blue) : C.dim,
                    ...MONO, fontSize: 11,
                  }}>
                    {result && isCorrectAnswer ? <CheckCircle size={14} /> :
                     result && isWrongSelected ? <XCircle size={14} /> : key}
                  </span>
                  <span style={{ color: C.text, ...SANS, fontSize: 13, lineHeight: 1.4 }}>
                    {optText}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Result feedback */}
          {result && (
            <div style={{
              marginTop: 12, padding: '10px 14px', borderRadius: 10,
              background: result.isCorrect ? C.green + '10' : C.red + '10',
              border: `1px solid ${result.isCorrect ? C.green + '30' : C.red + '30'}`,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              {result.isCorrect
                ? <CheckCircle size={16} color={C.green} />
                : <XCircle size={16} color={C.red} />}
              <span style={{ color: result.isCorrect ? C.green : C.red, ...MONO, fontSize: 12 }}>
                {result.isCorrect ? `Correct! +${result.coinsEarned} coins` : `Wrong — correct was ${result.correct}`}
              </span>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {!result ? (
              <button onClick={handleSubmit} disabled={!selected || submitting}
                style={{
                  background: selected ? C.blue : C.dim, color: selected ? '#fff' : C.muted,
                  border: 'none', borderRadius: 8, padding: '10px 20px',
                  cursor: selected ? 'pointer' : 'default', ...MONO, fontSize: 12, fontWeight: 500,
                  opacity: submitting ? 0.6 : 1,
                }}>
                {submitting ? 'Submitting...' : 'Submit Answer'}
              </button>
            ) : current < questions.length - 1 ? (
              <button onClick={handleNext}
                style={{
                  background: C.green, color: '#000', border: 'none', borderRadius: 8,
                  padding: '10px 20px', cursor: 'pointer', ...MONO, fontSize: 12, fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                Next <ChevronRight size={14} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
