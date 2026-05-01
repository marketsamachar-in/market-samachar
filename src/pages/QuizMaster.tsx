/**
 * Quiz Master — infinite no-repeat quiz with daily challenge + practice mode.
 *
 * Three screens:
 *   1. Lobby     → user progress + bank stats + mode selector
 *   2. Play      → one question at a time (5 for daily, N for practice)
 *   3. Recap     → score + breakdown + share + back-to-lobby
 */

import React, { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Brain, Trophy, Flame, BookOpen, Zap, ArrowRight, Check, X, Lock,
  ChevronRight, Sparkles,
} from "lucide-react";

interface Props {
  authToken: string | undefined;
}

// ─── Theme ───────────────────────────────────────────────────────────────────
const MONO: CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: CSSProperties = { fontFamily: "'DM Sans', sans-serif" };
const BG       = "#07070e";
const CARD_BG  = "#0d0d1e";
const BORDER   = "#1a1a2e";
const TEXT     = "#e8eaf0";
const SUBTEXT  = "#8899aa";
const DIM      = "#556688";
const GREEN    = "#00ff88";
const RED      = "#ff4466";
const BLUE     = "#3b9eff";
const PURPLE   = "#b366ff";
const YELLOW   = "#ffdd3b";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Question {
  id: number;
  category: string;
  difficulty: number;
  question: string;
  options: [string, string, string, string];
  explanation: string | null;
  source: string | null;
}
interface DailyState {
  date: string;
  finished: boolean;
  score: number;
  coins: number;
  questions: Question[];
  answered: Array<{ questionId: number; selected: string; correct: boolean }>;
}
interface ProgressData {
  totalXp: number;
  weeklyXp: number;
  league: string;
  streakDays: number;
  hearts: number;
  totalCorrect: number;
  totalWrong: number;
  accuracy: number;
  questionsSeen: number;
  bankSize: number;
}
interface AnswerResult {
  correct: boolean;
  correctOption: string;
  explanation: string | null;
  source: string | null;
  coinsAwarded: number;
  xpAwarded: number;
  newBalance: number;
  totalXp: number;
  streakDays: number;
}

type Screen = "lobby" | "daily" | "practice" | "recap";

// ─── Page ────────────────────────────────────────────────────────────────────

const QuizMaster: React.FC<Props> = ({ authToken }) => {
  const [screen, setScreen]     = useState<Screen>("lobby");
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [bankSize, setBankSize] = useState<number>(0);
  const [daily, setDaily]       = useState<DailyState | null>(null);
  const [practice, setPractice] = useState<Question[] | null>(null);
  const [recap, setRecap]       = useState<{
    correct: number; total: number; coins: number; xp: number;
  } | null>(null);
  const [err, setErr]           = useState<string | null>(null);

  const auth = useMemo(() => {
    return authToken
      ? { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" }
      : { "Content-Type": "application/json" };
  }, [authToken]);

  // Load lobby data
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const stats = await fetch("/api/quiz-master/bank/stats").then((r) => r.json());
        if (!cancelled && stats?.ok) setBankSize(stats.active ?? 0);
        if (authToken) {
          const prog = await fetch("/api/quiz-master/progress", { headers: auth })
            .then((r) => r.json());
          if (!cancelled && prog?.ok) setProgress(prog);
        }
      } catch { /* lobby still renders without these */ }
    };
    load();
    return () => { cancelled = true; };
  }, [authToken, auth, screen]);

  const startDaily = async () => {
    if (!authToken) { setErr("Please sign in to play"); return; }
    setErr(null);
    try {
      const r = await fetch("/api/quiz-master/daily", { headers: auth }).then((x) => x.json());
      if (!r.ok) { setErr(r.error ?? "Could not start"); return; }
      setDaily(r);
      if (r.finished || r.questions.length === 0) {
        setRecap({ correct: r.score, total: r.questions.length, coins: r.coins, xp: 0 });
        setScreen("recap");
      } else {
        setScreen("daily");
      }
    } catch { setErr("Network error"); }
  };

  const startPractice = async () => {
    if (!authToken) { setErr("Please sign in to play"); return; }
    setErr(null);
    try {
      const r = await fetch("/api/quiz-master/practice?count=10", { headers: auth })
        .then((x) => x.json());
      if (!r.ok) { setErr(r.error ?? "Could not start"); return; }
      if (!r.questions?.length) { setErr("No more new questions in your category. Bank growing soon!"); return; }
      setPractice(r.questions);
      setScreen("practice");
    } catch { setErr("Network error"); }
  };

  const finishToRecap = (correct: number, total: number, coins: number, xp: number) => {
    setRecap({ correct, total, coins, xp });
    setScreen("recap");
  };

  // ── Render switch ──────────────────────────────────────────────────────────
  return (
    <div style={{ background: BG, minHeight: "100vh", paddingBottom: 80, ...SANS }}>
      {screen === "lobby" && (
        <Lobby
          progress={progress}
          bankSize={bankSize}
          err={err}
          onDaily={startDaily}
          onPractice={startPractice}
          authed={!!authToken}
        />
      )}
      {screen === "daily" && daily && (
        <Player
          mode="daily"
          questions={daily.questions}
          alreadyAnswered={daily.answered}
          auth={auth}
          onExit={() => setScreen("lobby")}
          onFinish={finishToRecap}
        />
      )}
      {screen === "practice" && practice && (
        <Player
          mode="practice"
          questions={practice}
          alreadyAnswered={[]}
          auth={auth}
          onExit={() => setScreen("lobby")}
          onFinish={finishToRecap}
        />
      )}
      {screen === "recap" && recap && (
        <Recap data={recap} onBack={() => setScreen("lobby")} />
      )}
    </div>
  );
};

// ─── LOBBY ───────────────────────────────────────────────────────────────────

const Lobby: React.FC<{
  progress: ProgressData | null;
  bankSize: number;
  err: string | null;
  onDaily: () => void;
  onPractice: () => void;
  authed: boolean;
}> = ({ progress, bankSize, err, onDaily, onPractice, authed }) => (
  <div>
    <Header />

    {progress ? <ProgressBlock progress={progress} bankSize={bankSize} /> : (
      <div style={{
        ...MONO, color: DIM, fontSize: 11, padding: "12px 16px",
      }}>
        {bankSize.toLocaleString()} questions in the bank — and growing.
      </div>
    )}

    {err && (
      <div style={{ padding: "0 16px 12px" }}>
        <div style={{
          background: "#2a1620", border: `1px solid ${RED}`, borderRadius: 6,
          padding: 10, color: RED, ...MONO, fontSize: 11,
        }}>{err}</div>
      </div>
    )}

    <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <ModeCard
        accent={GREEN}
        icon={<Trophy size={18} color={GREEN} />}
        title="Daily Challenge"
        sub="5 questions · once per day · biggest rewards"
        cta={authed ? "PLAY TODAY" : "SIGN IN TO PLAY"}
        onClick={onDaily}
      />
      <ModeCard
        accent={BLUE}
        icon={<BookOpen size={18} color={BLUE} />}
        title="Practice Mode"
        sub="10 fresh questions · unlimited · earn coins per correct answer"
        cta={authed ? "PRACTICE" : "SIGN IN TO PLAY"}
        onClick={onPractice}
      />
      <ModeCard
        accent={PURPLE}
        icon={<Zap size={18} color={PURPLE} />}
        title="Speed Round"
        sub="Coming soon — 60 seconds, max correct"
        cta="LOCKED"
        locked
      />
      <ModeCard
        accent={YELLOW}
        icon={<Sparkles size={18} color={YELLOW} />}
        title="Weekly League"
        sub="Coming soon — climb leagues, win weekly prizes"
        cta="LOCKED"
        locked
      />
    </div>

    <Footer />
  </div>
);

const Header: React.FC = () => (
  <div style={{
    padding: "20px 16px 14px", borderBottom: `1px solid ${BORDER}`, background: CARD_BG,
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Brain size={20} color={GREEN} />
      <div>
        <div style={{ ...SANS, color: TEXT, fontSize: 18, fontWeight: 500, lineHeight: 1.2 }}>
          Quiz Master
        </div>
        <div style={{ ...MONO, color: DIM, fontSize: 10, letterSpacing: "0.08em", marginTop: 2 }}>
          INFINITE NO-REPEAT MARKET QUIZ
        </div>
      </div>
    </div>
  </div>
);

const ProgressBlock: React.FC<{ progress: ProgressData; bankSize: number }> = ({
  progress, bankSize,
}) => {
  const pctSeen = bankSize > 0 ? Math.min(100, (progress.questionsSeen / bankSize) * 100) : 0;
  return (
    <div style={{ padding: 16, borderBottom: `1px solid ${BORDER}` }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <Stat label="STREAK"   value={`${progress.streakDays}d`} icon={<Flame size={14} color={RED} />} />
        <Stat label="XP"       value={progress.totalXp.toLocaleString()} icon={<Zap size={14} color={YELLOW} />} />
        <Stat label="ACCURACY" value={`${progress.accuracy}%`} icon={<Check size={14} color={GREEN} />} />
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{
          ...MONO, fontSize: 9, color: DIM, letterSpacing: "0.1em",
          display: "flex", justifyContent: "space-between",
        }}>
          <span>BANK PROGRESS</span>
          <span>{progress.questionsSeen} / {bankSize}</span>
        </div>
        <div style={{
          marginTop: 4, height: 4, background: BORDER, borderRadius: 2, overflow: "hidden",
        }}>
          <div style={{ width: `${pctSeen}%`, height: "100%", background: GREEN }} />
        </div>
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; icon: React.ReactNode }> = ({
  label, value, icon,
}) => (
  <div style={{
    background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 10,
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      {icon}
      <span style={{ ...MONO, fontSize: 9, color: DIM, letterSpacing: "0.1em" }}>{label}</span>
    </div>
    <div style={{ ...MONO, fontSize: 18, color: TEXT, marginTop: 4, fontWeight: 500 }}>{value}</div>
  </div>
);

const ModeCard: React.FC<{
  accent: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
  cta: string;
  onClick?: () => void;
  locked?: boolean;
}> = ({ accent, icon, title, sub, cta, onClick, locked }) => (
  <button
    onClick={locked ? undefined : onClick}
    disabled={locked}
    style={{
      background: CARD_BG, border: `1px solid ${BORDER}`,
      borderLeft: `2px solid ${accent}`, borderRadius: 8, padding: 14,
      display: "flex", alignItems: "center", gap: 12, textAlign: "left",
      cursor: locked ? "not-allowed" : "pointer",
      opacity: locked ? 0.5 : 1, width: "100%",
    }}
  >
    <div style={{
      width: 36, height: 36, borderRadius: 8, background: `${accent}15`,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    }}>{icon}</div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ ...SANS, color: TEXT, fontSize: 15, fontWeight: 500 }}>{title}</div>
      <div style={{ ...MONO, color: SUBTEXT, fontSize: 10, marginTop: 2 }}>{sub}</div>
    </div>
    <div style={{
      ...MONO, fontSize: 10, color: locked ? DIM : accent,
      letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 4,
    }}>
      {cta}
      {locked ? <Lock size={12} /> : <ChevronRight size={14} />}
    </div>
  </button>
);

const Footer: React.FC = () => (
  <div style={{
    ...MONO, fontSize: 9, color: DIM, padding: "20px 16px 12px",
    textAlign: "center", lineHeight: 1.6,
  }}>
    Question pool grows continuously · Each user gets unique questions ·<br/>
    Educational only — not investment advice
  </div>
);

// ─── PLAYER ──────────────────────────────────────────────────────────────────

const Player: React.FC<{
  mode: "daily" | "practice";
  questions: Question[];
  alreadyAnswered: Array<{ questionId: number; selected: string; correct: boolean }>;
  auth: Record<string, string>;
  onExit: () => void;
  onFinish: (correct: number, total: number, coins: number, xp: number) => void;
}> = ({ mode, questions, alreadyAnswered, auth, onExit, onFinish }) => {
  const [idx, setIdx] = useState<number>(() => {
    // Skip already-answered Qs in daily mode
    return Math.min(alreadyAnswered.length, questions.length - 1);
  });
  const [selected, setSelected]   = useState<string | null>(null);
  const [result, setResult]       = useState<AnswerResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tally, setTally] = useState({
    correct: alreadyAnswered.filter((a) => a.correct).length,
    coins: 0, xp: 0,
  });

  const q = questions[idx];

  const submit = async () => {
    if (!q || !selected) return;
    setSubmitting(true);
    try {
      const r = await fetch("/api/quiz-master/answer", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ questionId: q.id, selected, mode }),
      }).then((x) => x.json()) as AnswerResult & { ok: boolean; error?: string };
      if (!r.ok) {
        // E.g. "Already answered" — skip forward
        next();
        return;
      }
      setResult(r);
      setTally((t) => ({
        correct: t.correct + (r.correct ? 1 : 0),
        coins:   t.coins + (r.coinsAwarded ?? 0),
        xp:      t.xp + (r.xpAwarded ?? 0),
      }));
    } catch { /* ignore */ }
    finally { setSubmitting(false); }
  };

  const next = () => {
    setSelected(null);
    setResult(null);
    if (idx + 1 >= questions.length) {
      onFinish(tally.correct, questions.length, tally.coins, tally.xp);
      return;
    }
    setIdx(idx + 1);
  };

  if (!q) {
    onFinish(tally.correct, questions.length, tally.coins, tally.xp);
    return null;
  }

  const optLabels: Array<"A" | "B" | "C" | "D"> = ["A", "B", "C", "D"];

  return (
    <div>
      {/* Top bar */}
      <div style={{
        padding: "12px 16px", borderBottom: `1px solid ${BORDER}`,
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <button
          onClick={onExit}
          style={{
            background: "transparent", border: "none", color: DIM,
            ...MONO, fontSize: 11, cursor: "pointer", padding: 0,
          }}
        >EXIT</button>
        <div style={{ flex: 1 }}>
          <div style={{
            height: 3, background: BORDER, borderRadius: 2, overflow: "hidden",
          }}>
            <div style={{
              width: `${((idx + (result ? 1 : 0)) / questions.length) * 100}%`,
              height: "100%", background: GREEN, transition: "width 0.3s",
            }} />
          </div>
        </div>
        <div style={{ ...MONO, fontSize: 11, color: TEXT }}>
          {idx + 1} / {questions.length}
        </div>
      </div>

      {/* Question */}
      <div style={{ padding: 16 }}>
        <div style={{
          display: "flex", gap: 8, marginBottom: 8,
        }}>
          <Pill text={q.category} color={BLUE} />
          <Pill text={`Lv ${q.difficulty}`} color={PURPLE} />
        </div>
        <div style={{
          ...SANS, fontSize: 17, color: TEXT, lineHeight: 1.4, marginTop: 8, marginBottom: 18,
        }}>
          {q.question}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {q.options.map((opt, i) => {
            const lbl = optLabels[i];
            const isSel = selected === lbl;
            let bg: string = CARD_BG, border: string = BORDER, color: string = TEXT;
            if (result) {
              if (lbl === result.correctOption) {
                bg = "#0d2218"; border = GREEN; color = GREEN;
              } else if (isSel && !result.correct) {
                bg = "#2a1620"; border = RED; color = RED;
              } else {
                color = DIM;
              }
            } else if (isSel) {
              border = GREEN;
            }
            return (
              <button
                key={lbl}
                onClick={() => !result && setSelected(lbl)}
                disabled={!!result}
                style={{
                  background: bg, border: `1px solid ${border}`, borderRadius: 6,
                  padding: "12px 14px", textAlign: "left", cursor: result ? "default" : "pointer",
                  display: "flex", alignItems: "center", gap: 10, color, ...SANS, fontSize: 14,
                }}
              >
                <span style={{
                  ...MONO, fontSize: 11, color: result ? color : DIM,
                  width: 18, flexShrink: 0,
                }}>{lbl}</span>
                <span style={{ flex: 1 }}>{opt}</span>
                {result && lbl === result.correctOption && <Check size={16} color={GREEN} />}
                {result && isSel && !result.correct && <X size={16} color={RED} />}
              </button>
            );
          })}
        </div>

        {/* Explanation panel */}
        {result && (
          <div style={{
            marginTop: 18, padding: 12, background: CARD_BG,
            border: `1px solid ${BORDER}`, borderLeft: `2px solid ${result.correct ? GREEN : RED}`,
            borderRadius: 6,
          }}>
            <div style={{
              ...MONO, fontSize: 9, color: DIM, letterSpacing: "0.1em",
              marginBottom: 6,
            }}>{result.correct ? "CORRECT" : "INCORRECT"}{result.coinsAwarded > 0 ? ` · +${result.coinsAwarded} COINS` : ""} · +{result.xpAwarded} XP</div>
            <div style={{ ...SANS, fontSize: 13, color: TEXT, lineHeight: 1.5 }}>
              {result.explanation || "No explanation provided."}
            </div>
            {result.source && (
              <div style={{ ...MONO, fontSize: 9, color: DIM, marginTop: 8 }}>
                Source: {result.source}
              </div>
            )}
          </div>
        )}

        {/* Action button */}
        <div style={{ marginTop: 18 }}>
          {!result ? (
            <button
              onClick={submit}
              disabled={!selected || submitting}
              style={{
                width: "100%", padding: 14, borderRadius: 6,
                background: !selected || submitting ? "#1a1a2e" : GREEN,
                color: !selected || submitting ? DIM : "#000",
                border: "none", ...MONO, fontSize: 12, letterSpacing: "0.1em",
                cursor: !selected || submitting ? "not-allowed" : "pointer",
                fontWeight: 500,
              }}
            >{submitting ? "CHECKING…" : "SUBMIT ANSWER"}</button>
          ) : (
            <button
              onClick={next}
              style={{
                width: "100%", padding: 14, borderRadius: 6,
                background: GREEN, color: "#000", border: "none",
                ...MONO, fontSize: 12, letterSpacing: "0.1em",
                cursor: "pointer", fontWeight: 500,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              {idx + 1 >= questions.length ? "FINISH" : "NEXT QUESTION"}
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const Pill: React.FC<{ text: string; color: string }> = ({ text, color }) => (
  <span style={{
    ...MONO, fontSize: 9, color, letterSpacing: "0.08em",
    background: `${color}15`, border: `1px solid ${color}30`,
    padding: "3px 8px", borderRadius: 4,
  }}>{text}</span>
);

// ─── RECAP ───────────────────────────────────────────────────────────────────

const Recap: React.FC<{
  data: { correct: number; total: number; coins: number; xp: number };
  onBack: () => void;
}> = ({ data, onBack }) => {
  const pct = data.total === 0 ? 0 : Math.round((data.correct / data.total) * 100);
  const verdict =
    pct === 100 ? "PERFECT" :
    pct >= 80  ? "EXCELLENT" :
    pct >= 60  ? "GOOD" :
    pct >= 40  ? "KEEP GOING" :
                 "TRY AGAIN";
  const accent = pct >= 60 ? GREEN : pct >= 40 ? YELLOW : RED;

  return (
    <div style={{ padding: 20 }}>
      <div style={{
        background: CARD_BG, border: `1px solid ${BORDER}`,
        borderTop: `2px solid ${accent}`, borderRadius: 8, padding: 24, textAlign: "center",
      }}>
        <div style={{ ...MONO, fontSize: 10, color: DIM, letterSpacing: "0.15em" }}>
          QUIZ COMPLETE
        </div>
        <div style={{ ...SANS, fontSize: 28, color: accent, marginTop: 6, fontWeight: 500 }}>
          {verdict}
        </div>

        <div style={{ ...MONO, fontSize: 56, color: TEXT, marginTop: 16, fontWeight: 500 }}>
          {data.correct}<span style={{ color: DIM, fontSize: 28 }}> / {data.total}</span>
        </div>
        <div style={{ ...MONO, fontSize: 11, color: DIM, marginTop: 4 }}>
          {pct}% accuracy
        </div>

        <div style={{
          marginTop: 22, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
        }}>
          <div style={{
            background: BG, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 12,
          }}>
            <div style={{ ...MONO, fontSize: 9, color: DIM }}>COINS</div>
            <div style={{ ...MONO, fontSize: 18, color: GREEN, marginTop: 4 }}>
              +{data.coins.toLocaleString()}
            </div>
          </div>
          <div style={{
            background: BG, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 12,
          }}>
            <div style={{ ...MONO, fontSize: 9, color: DIM }}>XP</div>
            <div style={{ ...MONO, fontSize: 18, color: YELLOW, marginTop: 4 }}>
              +{data.xp.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={onBack}
        style={{
          marginTop: 16, width: "100%", padding: 14, borderRadius: 6,
          background: GREEN, color: "#000", border: "none",
          ...MONO, fontSize: 12, letterSpacing: "0.1em", cursor: "pointer",
          fontWeight: 500,
        }}
      >BACK TO LOBBY</button>
    </div>
  );
};

export default QuizMaster;
