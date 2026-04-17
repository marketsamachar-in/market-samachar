/**
 * MysteryStockGame — "Guess the Mystery Nifty 500 stock from 5 clues"
 * Pro-only daily game.  One stock per day, same for all users.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, TrendingUp, ChevronRight, RotateCcw,
  Share2, CheckCircle, XCircle, Lock, Loader2,
} from 'lucide-react';
import { BRAND_HOST } from '../../lib/config';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SymbolEntry { symbol: string; name: string; }

interface GameState {
  date:         string;
  clues:        string[];
  guesses:      string[];   // wrong guesses so far
  won:          boolean;
  lost:         boolean;
  clues_loaded: number;     // 1–5
  points:       number;
  answer:       string | null;
  stock_info?:  { name: string; sector: string; founded: number; city: string; fun_fact: string };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const POINTS_MAP: Record<number, number> = { 1: 500, 2: 400, 3: 300, 4: 200, 5: 100 };

function gridEmoji(guesses: string[], won: boolean, clues_loaded: number): string {
  const cells: string[] = [];
  for (let i = 1; i <= 5; i++) {
    if (won && i === clues_loaded) { cells.push('🟩'); break; }
    if (i <= guesses.length) cells.push('🟥');
    else cells.push('⬜');
  }
  return cells.join('');
}

function getTodayIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const STORAGE_KEY = (date: string) => `mystery_stock_${date}`;

// ─── Style constants ──────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif" };
const GREEN  = '#00ff88';
const DIM    = '#334466';
const DIMMER = '#1e2840';
const TEXT   = '#e8eaf0';
const SUBTEXT = '#8899aa';

// ─── Typewriter hook ──────────────────────────────────────────────────────────

function useTypewriter(text: string, speed = 18): string {
  const [displayed, setDisplayed] = useState('');
  const idxRef = useRef(0);

  useEffect(() => {
    setDisplayed('');
    idxRef.current = 0;
    if (!text) return;
    const tick = setInterval(() => {
      idxRef.current++;
      setDisplayed(text.slice(0, idxRef.current));
      if (idxRef.current >= text.length) clearInterval(tick);
    }, speed);
    return () => clearInterval(tick);
  }, [text, speed]);

  return displayed;
}

// ─── ClueRow component ────────────────────────────────────────────────────────

const ClueRow: React.FC<{ n: number; text: string; animate: boolean }> = ({ n, text, animate }) => {
  const shown = useTypewriter(animate ? text : '', 14);
  const display = animate ? shown : text;

  return (
    <div
      style={{
        background: '#0a0a18',
        border:     '1px solid #1a1a2e',
        borderLeft: `3px solid ${GREEN}`,
        borderRadius: 6,
        padding:    '10px 14px',
        marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ color: GREEN, ...MONO, fontSize: 11, minWidth: 20 }}>#{n}</span>
        <span style={{ color: TEXT, ...SANS, fontSize: 13, lineHeight: 1.5 }}>
          {display}
          {animate && shown.length < text.length && (
            <span style={{ color: GREEN, opacity: 0.7 }}>▋</span>
          )}
        </span>
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  onClose:   () => void;
}

export function MysteryStockGame({ onClose }: Props) {
  const [loading,   setLoading]   = useState(true);
  const [submitting,setSubmitting]= useState(false);
  const [symbols,   setSymbols]   = useState<SymbolEntry[]>([]);
  const [input,     setInput]     = useState('');
  const [filtered,  setFiltered]  = useState<SymbolEntry[]>([]);
  const [showDrop,  setShowDrop]  = useState(false);
  const [lastClue,  setLastClue]  = useState(0);   // index of the newest clue to animate
  const [error,     setError]     = useState<string | null>(null);
  const [copied,    setCopied]    = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const today = getTodayIST();

  // ── Game state (persisted in localStorage) ─────────────────────────────────
  const [game, setGame] = useState<GameState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY(today));
      if (saved) return JSON.parse(saved) as GameState;
    } catch {}
    return {
      date: today, clues: [], guesses: [], won: false, lost: false,
      clues_loaded: 1, points: 0, answer: null,
    };
  });

  const saveGame = useCallback((g: GameState) => {
    setGame(g);
    localStorage.setItem(STORAGE_KEY(today), JSON.stringify(g));
  }, [today]);

  // ── Load clues from API ────────────────────────────────────────────────────
  const loadClues = useCallback(async (reveal: number) => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/mystery-stock/today?reveal=${reveal}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load');
      setSymbols(data.symbols ?? []);
      return data.clues as string[];
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // On mount: load the current number of clues
  useEffect(() => {
    loadClues(game.clues_loaded).then(clues => {
      if (clues) {
        setGame(g => ({ ...g, clues }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Autocomplete filtering ─────────────────────────────────────────────────
  useEffect(() => {
    if (!input.trim()) { setFiltered([]); setShowDrop(false); return; }
    const q = input.toLowerCase();
    const matches = symbols.filter(
      s => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    ).slice(0, 8);
    setFiltered(matches);
    setShowDrop(matches.length > 0);
  }, [input, symbols]);

  // ── Submit guess ───────────────────────────────────────────────────────────
  const handleGuess = async (guessSymbol: string) => {
    if (!guessSymbol.trim() || game.won || game.lost) return;
    setInput('');
    setShowDrop(false);
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/mystery-stock/guess', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ symbol: guessSymbol, clues_used: game.clues_loaded, date: today }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Guess failed');

      if (data.correct) {
        const updated: GameState = {
          ...game,
          won:       true,
          points:    data.points,
          answer:    data.answer,
          stock_info: data.stock,
          guesses:   game.guesses,
        };
        saveGame(updated);
      } else {
        const newGuesses = [...game.guesses, guessSymbol.toUpperCase()];
        const newCluesLoaded = Math.min(5, game.clues_loaded + 1);
        const isLost = newGuesses.length >= 5;

        // Load next clue if available
        let newClues = game.clues;
        if (!isLost && newCluesLoaded > game.clues_loaded) {
          const fetched = await loadClues(newCluesLoaded);
          if (fetched) newClues = fetched;
        }

        // If all 5 wrong, server reveals answer
        const updated: GameState = {
          ...game,
          guesses:     newGuesses,
          clues:       newClues,
          clues_loaded: newCluesLoaded,
          lost:        isLost,
          answer:      isLost ? data.answer : null,
          stock_info:  isLost ? data.stock  : undefined,
        };
        setLastClue(newCluesLoaded - 1);
        saveGame(updated);

        // If lost, also trigger the final reveal fetch to get answer
        if (isLost && !data.answer) {
          const finalRes = await fetch('/api/mystery-stock/guess', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ symbol: '_reveal_', clues_used: 5, date: today }),
          });
          const finalData = await finalRes.json();
          saveGame({ ...updated, answer: finalData.answer, stock_info: finalData.stock });
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Share result ───────────────────────────────────────────────────────────
  const handleShare = () => {
    const grid  = gridEmoji(game.guesses, game.won, game.clues_loaded);
    const lines = [
      `Mystery Stock ${today}`,
      game.won ? `${grid} Guessed in ${game.clues_loaded} clue${game.clues_loaded > 1 ? 's' : ''}! 🎉` : `${grid} Better luck tomorrow!`,
      game.won ? `+${game.points} pts` : '',
      BRAND_HOST,
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Game over: result screen ───────────────────────────────────────────────
  const gameOver = game.won || game.lost;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div
        style={modalStyle}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #1a1a2e' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>🔍</span>
            <div>
              <div style={{ color: GREEN, ...MONO, fontSize: 12, letterSpacing: 2 }}>MYSTERY STOCK</div>
              <div style={{ color: DIM, ...MONO, fontSize: 9 }}>{today} · Nifty 500 Daily Challenge</div>
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle}><X className="w-4 h-4" /></button>
        </div>

        {/* Attempts indicator */}
        <div style={{ padding: '10px 18px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
          {[1,2,3,4,5].map(i => {
            const isWrong   = game.guesses.length >= i && !game.won;
            const isCorrect = game.won && game.clues_loaded === i;
            const active    = !gameOver && i === game.clues_loaded;
            return (
              <div
                key={i}
                style={{
                  width: 28, height: 28,
                  borderRadius: 4,
                  background: isCorrect ? '#00ff8830'
                    : isWrong   ? '#ff446630'
                    : active    ? '#1a1a2e'
                    : '#0a0a18',
                  border: `1px solid ${isCorrect ? GREEN : isWrong ? '#ff4466' : active ? '#334466' : '#1a1a2e'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  ...MONO, fontSize: 11,
                  color: isCorrect ? GREEN : isWrong ? '#ff4466' : active ? SUBTEXT : DIM,
                }}
              >
                {isCorrect ? '✓' : isWrong ? '✗' : i}
              </div>
            );
          })}
          <span style={{ color: DIM, ...MONO, fontSize: 10, marginLeft: 4 }}>
            {game.won ? `+${game.points} pts` : game.lost ? 'Better luck tomorrow!' : `Clue ${game.clues_loaded} of 5`}
          </span>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', maxHeight: 'calc(100% - 160px)', padding: '12px 18px' }}>

          {/* Loading */}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: DIM, padding: '20px 0' }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span style={{ ...MONO, fontSize: 11 }}>LOADING CLUES…</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ background: '#1a0a0a', border: '1px solid #ff2244', color: '#ff6688', borderRadius: 6, padding: '8px 12px', ...SANS, fontSize: 12, marginBottom: 10 }}>
              {error}
            </div>
          )}

          {/* Clues */}
          {!loading && game.clues.map((clue, idx) => (
            <ClueRow
              key={idx}
              n={idx + 1}
              text={clue}
              animate={idx === lastClue}
            />
          ))}

          {/* Wrong guesses */}
          {game.guesses.length > 0 && !gameOver && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {game.guesses.map(g => (
                <span key={g} style={{ background: '#2a0a0a', border: '1px solid #ff2244', color: '#ff6688', ...MONO, fontSize: 11, padding: '3px 8px', borderRadius: 4 }}>
                  ✗ {g}
                </span>
              ))}
            </div>
          )}

          {/* RESULT screen */}
          {gameOver && (
            <div
              style={{
                background: game.won ? '#001a0a' : '#1a0808',
                border:     `1px solid ${game.won ? '#00ff8840' : '#ff444440'}`,
                borderRadius: 8,
                padding:    '16px',
                marginTop:  10,
                textAlign:  'center',
              }}
            >
              {game.won ? (
                <>
                  <CheckCircle className="w-8 h-8 mx-auto mb-2" style={{ color: GREEN }} />
                  <div style={{ color: GREEN, ...MONO, fontSize: 14, fontWeight: 700 }}>CORRECT!</div>
                  <div style={{ color: TEXT, ...SANS, fontSize: 20, fontWeight: 700, margin: '6px 0' }}>
                    {game.stock_info?.name ?? game.answer}
                  </div>
                </>
              ) : (
                <>
                  <XCircle className="w-8 h-8 mx-auto mb-2" style={{ color: '#ff4466' }} />
                  <div style={{ color: '#ff4466', ...MONO, fontSize: 14, fontWeight: 700 }}>WRONG!</div>
                  <div style={{ color: TEXT, ...SANS, fontSize: 16, fontWeight: 700, margin: '6px 0' }}>
                    {game.stock_info?.name ?? game.answer}
                  </div>
                </>
              )}

              {game.stock_info && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12, textAlign: 'left' }}>
                  {[
                    ['Sector',  game.stock_info.sector],
                    ['Founded', String(game.stock_info.founded)],
                    ['City',    game.stock_info.city],
                  ].map(([label, val]) => (
                    <div key={label} style={{ background: '#0a0a18', border: '1px solid #1a1a2e', borderRadius: 6, padding: '8px 10px' }}>
                      <div style={{ color: DIM, ...MONO, fontSize: 9, marginBottom: 2 }}>{label.toUpperCase()}</div>
                      <div style={{ color: TEXT, ...SANS, fontSize: 12 }}>{val}</div>
                    </div>
                  ))}
                </div>
              )}

              {game.stock_info?.fun_fact && (
                <div style={{ background: '#0a0a18', border: '1px solid #1a1a2e', borderRadius: 6, padding: '8px 10px', marginTop: 8, textAlign: 'left' }}>
                  <div style={{ color: DIM, ...MONO, fontSize: 9, marginBottom: 3 }}>FUN FACT</div>
                  <div style={{ color: SUBTEXT, ...SANS, fontSize: 12, lineHeight: 1.5 }}>{game.stock_info.fun_fact}</div>
                </div>
              )}

              {/* Share grid */}
              <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'center' }}>
                <div style={{ background: '#0a0a18', border: '1px solid #1a1a2e', borderRadius: 6, padding: '8px 14px', ...MONO, fontSize: 16 }}>
                  {gridEmoji(game.guesses, game.won, game.clues_loaded)}
                </div>
                <button
                  onClick={handleShare}
                  style={{ background: copied ? '#00ff8820' : '#0a0a18', border: `1px solid ${copied ? GREEN : '#1a1a2e'}`, color: copied ? GREEN : SUBTEXT, borderRadius: 6, padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, ...MONO, fontSize: 11 }}
                >
                  <Share2 className="w-3.5 h-3.5" />
                  {copied ? 'COPIED!' : 'SHARE'}
                </button>
              </div>

              <div style={{ color: DIM, ...MONO, fontSize: 10, marginTop: 10 }}>
                Next Mystery Stock tomorrow at midnight IST
              </div>
            </div>
          )}

          {/* Input area */}
          {!gameOver && !loading && (
            <div style={{ marginTop: 14, position: 'relative' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && input.trim()) {
                        const exact = symbols.find(
                          s => s.symbol.toLowerCase() === input.toLowerCase() ||
                               s.name.toLowerCase() === input.toLowerCase()
                        );
                        handleGuess(exact?.symbol ?? input.trim().toUpperCase());
                      }
                      if (e.key === 'Escape') setShowDrop(false);
                    }}
                    placeholder="Type stock name or symbol…"
                    disabled={submitting}
                    style={{
                      width: '100%',
                      background: '#0a0a18',
                      border: '1px solid #334466',
                      borderRadius: 6,
                      padding: '10px 12px',
                      color: TEXT,
                      ...MONO,
                      fontSize: 12,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                    autoFocus
                  />

                  {/* Dropdown */}
                  {showDrop && (
                    <div style={{
                      position: 'absolute', bottom: '100%', left: 0, right: 0, zIndex: 50,
                      background: '#0d0d1e', border: '1px solid #1a1a2e', borderRadius: 6,
                      marginBottom: 4, maxHeight: 200, overflowY: 'auto',
                    }}>
                      {filtered.map(s => (
                        <button
                          key={s.symbol}
                          onMouseDown={() => { setInput(''); setShowDrop(false); handleGuess(s.symbol); }}
                          style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left' }}
                          className="hover:bg-[#1a1a2e]"
                        >
                          <span style={{ color: TEXT, ...SANS, fontSize: 12 }}>{s.name}</span>
                          <span style={{ color: DIM, ...MONO, fontSize: 10 }}>{s.symbol}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => {
                    if (!input.trim()) return;
                    const exact = symbols.find(
                      s => s.symbol.toLowerCase() === input.toLowerCase() ||
                           s.name.toLowerCase() === input.toLowerCase()
                    );
                    handleGuess(exact?.symbol ?? input.trim().toUpperCase());
                  }}
                  disabled={submitting || !input.trim()}
                  style={{ background: submitting ? '#0a0a18' : GREEN, color: submitting ? DIM : '#000', border: 'none', borderRadius: 6, padding: '10px 16px', cursor: 'pointer', ...MONO, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, opacity: input.trim() ? 1 : 0.5 }}
                >
                  {submitting
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <><ChevronRight className="w-4 h-4" />GUESS</>
                  }
                </button>
              </div>

              <div style={{ color: DIMMER, ...MONO, fontSize: 10, marginTop: 6 }}>
                {5 - game.guesses.length} attempt{5 - game.guesses.length !== 1 ? 's' : ''} remaining ·  {game.clues_loaded < 5 ? `Wrong guess reveals clue #${game.clues_loaded + 1}` : 'Last clue shown'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Overlay / Modal styles ───────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 1000,
  background: 'rgba(0,0,0,0.85)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 16,
};

const modalStyle: React.CSSProperties = {
  background: '#07070e',
  border: '1px solid #1a1a2e',
  borderRadius: 12,
  width: '100%',
  maxWidth: 540,
  maxHeight: '90vh',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 0 60px rgba(0,255,136,0.06)',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#334466',
  cursor: 'pointer',
  padding: 4,
  display: 'flex',
  alignItems: 'center',
};
