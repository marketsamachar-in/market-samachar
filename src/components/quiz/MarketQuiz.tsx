/**
 * MarketQuiz — top-level controller.
 *
 * Renders:
 *   • A compact sidebar widget (always visible in the right rail)
 *   • Full-screen overlays for: playing → result → leaderboard
 *
 * State machine:  idle → playing → result → leaderboard → idle
 */
import React, { useState, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { QuizLanding }     from './QuizLanding';
import { QuizGame }        from './QuizGame';
import { QuizResult }      from './QuizResult';
import { QuizLeaderboard } from './QuizLeaderboard';
import { AuthModal }       from '../auth/AuthModal';
import { CertificateModal } from '../certificate';
import type { SafeQuestion, SubmitResult } from './types';
import type { CertificateData } from '../../lib/certificate';

type View = 'idle' | 'playing' | 'result' | 'leaderboard';

export function MarketQuiz() {
  const { user, profile, session } = useAuth();
  const [view,         setView]         = useState<View>('idle');
  const [questions,    setQuestions]    = useState<SafeQuestion[]>([]);
  const [result,       setResult]       = useState<SubmitResult | null>(null);
  const [prevIQ,       setPrevIQ]       = useState(0);
  const [showAuth,     setShowAuth]     = useState(false);
  const [loadErr,      setLoadErr]      = useState('');
  const [certificate,  setCertificate]  = useState<CertificateData | null>(null);
  const [startIndex,   setStartIndex]   = useState(0);
  const [savedAnswers, setSavedAnswers] = useState<(number | null)[]>([]);
  const [initialScore, setInitialScore] = useState(0);

  // ── Start quiz ─────────────────────────────────────────────────────────────
  const handlePlay = useCallback(async () => {
    if (!user) {
      setShowAuth(true);
      return;
    }
    setLoadErr('');
    try {
      const res  = await fetch('/api/quiz/today');
      const data = await res.json();
      if (!res.ok || !data.questions?.length) {
        setLoadErr(data.error ?? 'Quiz unavailable right now — try again later.');
        return;
      }
      setQuestions(data.questions);
      setPrevIQ(profile?.investor_iq ?? 0);

      // Restore session if available (resume from where user stopped)
      if (data.session) {
        const sess = data.session;
        setStartIndex(sess.current_q);
        const filled: (number | null)[] = data.questions.map((_: SafeQuestion, i: number) =>
          sess.answers[i] ? (sess.answers[i].selected as number) : null
        );
        setSavedAnswers(filled);
        setInitialScore(
          (sess.answers as any[]).filter((a: any) => a?.correct === true).length
        );
      } else {
        setStartIndex(0);
        setSavedAnswers([]);
        setInitialScore(0);
      }

      setView('playing');
    } catch {
      setLoadErr('Could not load quiz. Check your connection.');
    }
  }, [user, profile]);

  // ── Game complete ──────────────────────────────────────────────────────────
  const handleGameComplete = useCallback(async (r: SubmitResult) => {
    setResult(r);
    setView('result');

    // Check for 30-day milestone — issue certificate if earned
    if (r.new_streak > 0 && r.new_streak % 30 === 0 && session?.access_token) {
      try {
        const certRes = await fetch('/api/certificate/issue', {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        });
        if (certRes.ok) {
          const certData = await certRes.json();
          setCertificate(certData as CertificateData);
        }
      } catch {
        // Certificate issue is non-blocking — don't break quiz result flow
      }
    }
  }, [session]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const goLeaderboard = useCallback(() => setView('leaderboard'), []);
  const goIdle        = useCallback(() => setView('idle'), []);
  const goPlay        = useCallback(() => { setView('idle'); setTimeout(handlePlay, 50); }, [handlePlay]);

  return (
    <>
      {/* Sidebar widget — always rendered */}
      <QuizLanding
        onPlay={handlePlay}
        onLeaderboard={goLeaderboard}
        lastResult={result}
      />

      {loadErr && (
        <p style={{ color: '#ff4466', fontFamily: "'DM Mono', monospace", fontSize: 10, marginTop: 4 }}>
          {loadErr}
        </p>
      )}

      {/* Overlays */}
      {view === 'playing' && questions.length > 0 && (
        <QuizGame
          questions={questions}
          startIndex={startIndex}
          savedAnswers={savedAnswers}
          initialScore={initialScore}
          onComplete={handleGameComplete}
          onClose={goIdle}
        />
      )}

      {view === 'result' && result && (
        <QuizResult
          result={result}
          prevIQ={prevIQ}
          onLeaderboard={goLeaderboard}
          onClose={goIdle}
        />
      )}

      {view === 'leaderboard' && (
        <QuizLeaderboard
          onClose={goIdle}
          onPlayAgain={goPlay}
        />
      )}

      {/* Auth modal triggered when unauthenticated user tries to play */}
      {showAuth && (
        <AuthModal
          onClose={() => {
            setShowAuth(false);
            // Auto-start if user signed in
            if (user) handlePlay();
          }}
          defaultTab="phone"
        />
      )}

      {/* Certificate modal — shown on 30-day milestone */}
      {certificate && (
        <CertificateModal
          data={certificate}
          onClose={() => setCertificate(null)}
        />
      )}
    </>
  );
}
