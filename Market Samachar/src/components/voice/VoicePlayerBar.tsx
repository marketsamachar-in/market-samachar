/**
 * VoicePlayerBar — floating bottom player for News Audio.
 * Appears when a voice playlist is active; hidden otherwise.
 */

import React from 'react';
import {
  Pause, Play, SkipForward, Volume2, X, Loader2, Headphones,
} from 'lucide-react';
import type { VoicePlayer } from '../../hooks/useVoicePlayer';

const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif" };

const SPEEDS: Array<1 | 1.5 | 2> = [1, 1.5, 2];

interface VoicePlayerBarProps {
  player: VoicePlayer;
}

export function VoicePlayerBar({ player }: VoicePlayerBarProps) {
  const {
    playlist, currentIndex, isPlaying, isPaused, isTranslating,
    speed, volume,
    pause, resume, next, close, setSpeed, setVolume,
  } = player;

  if (playlist.length === 0) return null;

  const current    = playlist[currentIndex];
  const isAtEnd    = currentIndex >= playlist.length - 1;
  const pct        = playlist.length > 1
    ? ((currentIndex + (isPlaying ? 1 : 0)) / playlist.length) * 100
    : 100;

  return (
    <div
      style={{
        position:   'fixed',
        bottom:     0, left: 0, right: 0,
        background: '#07070e',
        borderTop:  '2px solid #00ff8830',
        boxShadow:  '0 -12px 40px rgba(0, 255, 136, 0.06)',
        zIndex:     9000,
        padding:    '10px 16px 12px',
      }}
    >
      {/* Progress bar */}
      {playlist.length > 1 && (
        <div style={{ height: 2, background: '#1e1e2e', borderRadius: 1, marginBottom: 10 }}>
          <div style={{
            height:     '100%',
            width:      `${pct}%`,
            background: '#00ff88',
            borderRadius: 1,
            transition: 'width 0.4s ease',
          }} />
        </div>
      )}

      <div style={{ maxWidth: 1024, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>

        {/* Icon + track info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
            background: isTranslating ? '#3b9eff18' : '#00ff8818',
            border:     `1px solid ${isTranslating ? '#3b9eff30' : '#00ff8830'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {isTranslating
              ? <Loader2   size={14} style={{ color: '#3b9eff' }} className="animate-spin" />
              : <Headphones size={14} style={{ color: '#00ff88' }} />
            }
          </div>

          <div style={{ minWidth: 0 }}>
            {/* Label row */}
            <div className="flex items-center gap-2 mb-0.5">
              <span style={{ color: '#00ff88', ...MONO, fontSize: 8, letterSpacing: '0.1em' }}
                className="uppercase">
                News Audio
              </span>
              <span style={{ color: '#1e2840', ...MONO, fontSize: 8 }}>
                {currentIndex + 1} / {playlist.length}
              </span>
            </div>
            {/* Title */}
            <p style={{ color: isTranslating ? '#334466' : '#e8eaf0', ...SANS, fontSize: 12, fontWeight: 500 }}
              className="truncate leading-tight">
              {isTranslating ? 'Translating…' : (current?.title ?? '—')}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>

          {/* Play / Pause */}
          <button
            onClick={isPlaying ? pause : resume}
            disabled={isTranslating}
            title={isPlaying ? 'Pause' : 'Play'}
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: '#00ff88', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: isTranslating ? 'wait' : 'pointer',
              flexShrink: 0,
              opacity: isTranslating ? 0.5 : 1,
            }}
          >
            {isPlaying
              ? <Pause size={14} style={{ color: '#07070e' }} />
              : <Play  size={14} style={{ color: '#07070e' }} />
            }
          </button>

          {/* Next */}
          <button
            onClick={next}
            disabled={isAtEnd || isTranslating}
            title="Next article"
            style={{
              background: 'none',
              border: `1px solid ${isAtEnd ? '#111122' : '#1e1e2e'}`,
              borderRadius: 6,
              width: 30, height: 30,
              cursor: isAtEnd ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: isAtEnd ? '#1e2840' : '#556688',
              flexShrink: 0,
              transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            <SkipForward size={13} />
          </button>

          {/* Speed buttons */}
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
            {SPEEDS.map(s => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                style={{
                  background:   speed === s ? '#00ff8820' : 'none',
                  border:       `1px solid ${speed === s ? '#00ff8840' : '#1e1e2e'}`,
                  color:        speed === s ? '#00ff88' : '#334466',
                  borderRadius: 4,
                  padding:      '3px 7px',
                  cursor:       'pointer',
                  ...MONO,
                  fontSize: 9,
                  transition:   'all 0.12s',
                }}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* Volume (desktop only) */}
          <div
            className="hidden sm:flex items-center gap-2"
            style={{ flexShrink: 0 }}
          >
            <Volume2 size={12} style={{ color: '#334466' }} />
            <input
              type="range"
              min={0} max={1} step={0.05}
              value={volume}
              onChange={e => setVolume(parseFloat(e.target.value))}
              style={{ width: 64, accentColor: '#00ff88', cursor: 'pointer' }}
              title={`Volume: ${Math.round(volume * 100)}%`}
            />
          </div>

          {/* Close */}
          <button
            onClick={close}
            title="Close player"
            style={{
              background: 'none',
              border:     '1px solid #1e1e2e',
              borderRadius: 6,
              width: 30, height: 30,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#334466',
              flexShrink: 0,
              transition: 'color 0.15s, border-color 0.15s',
            }}
            className="hover:border-[#ff446650] hover:text-[#ff4466]"
          >
            <X size={13} />
          </button>

        </div>
      </div>
    </div>
  );
}
