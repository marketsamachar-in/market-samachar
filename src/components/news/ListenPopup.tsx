/**
 * ListenPopup — audio player popup with waveform animation and +10 coin reward.
 */

import React, { useState, useEffect } from 'react';
import { Play, Pause, SkipForward, Volume2, Coins, Check } from 'lucide-react';

const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif" };

interface NewsItem {
  id: string;
  title: string;
  contentSnippet?: string;
  translations?: Record<string, { title: string; summary?: string; bullets?: string[] }>;
}

interface VoiceItemInput {
  id: string;
  title: string;
  contentSnippet?: string;
  translations?: Record<string, { title: string; summary?: string; bullets?: string[] }>;
}

interface VoicePlayer {
  isPlaying: boolean;
  isPaused: boolean;
  isTranslating: boolean;
  speed: number;
  play: (items: VoiceItemInput[], startIdx?: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  setSpeed: (s: 1 | 1.5 | 2) => void;
}

interface Props {
  item: NewsItem;
  voicePlayer: VoicePlayer;
  isSignedIn?: boolean;
  authToken?: string | null;
}

// CSS for waveform bars
const barKeyframes = `
@keyframes waveBar1 { 0%,100% { height: 20% } 50% { height: 80% } }
@keyframes waveBar2 { 0%,100% { height: 40% } 50% { height: 100% } }
@keyframes waveBar3 { 0%,100% { height: 60% } 50% { height: 30% } }
@keyframes waveBar4 { 0%,100% { height: 30% } 50% { height: 90% } }
@keyframes waveBar5 { 0%,100% { height: 50% } 50% { height: 70% } }
@keyframes waveBar6 { 0%,100% { height: 70% } 50% { height: 40% } }
@keyframes waveBar7 { 0%,100% { height: 25% } 50% { height: 85% } }
@keyframes coinPop  { 0% { transform: scale(0.5); opacity: 0 } 50% { transform: scale(1.2) } 100% { transform: scale(1); opacity: 1 } }
`;

const BAR_ANIMATIONS = [
  'waveBar1 1.2s ease-in-out infinite',
  'waveBar2 1.0s ease-in-out infinite 0.1s',
  'waveBar3 1.4s ease-in-out infinite 0.2s',
  'waveBar4 1.1s ease-in-out infinite 0.15s',
  'waveBar5 1.3s ease-in-out infinite 0.25s',
  'waveBar6 0.9s ease-in-out infinite 0.1s',
  'waveBar7 1.2s ease-in-out infinite 0.3s',
];

export function ListenPopup({ item, voicePlayer, isSignedIn, authToken }: Props) {
  const [coinsEarned, setCoinsEarned]     = useState(0);
  const [streakBonus, setStreakBonus]      = useState(0);
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);
  const [showCoinAnim, setShowCoinAnim]   = useState(false);
  const [hasStarted, setHasStarted]       = useState(false);

  // Claim reward when playback starts
  useEffect(() => {
    if (!hasStarted || !isSignedIn || !authToken) return;

    fetch('/api/reading-rewards/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ articleId: item.id, rewardType: 'ARTICLE_LISTEN' }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.alreadyClaimed || data.alreadyCapped) {
          setAlreadyClaimed(true);
        } else if (data.coinsEarned > 0) {
          setCoinsEarned(data.coinsEarned);
          setStreakBonus(data.streakBonusEarned || 0);
          setShowCoinAnim(true);
          setTimeout(() => setShowCoinAnim(false), 3000);
        }
      })
      .catch(() => {});
  }, [hasStarted, item.id, isSignedIn, authToken]);

  const handlePlay = () => {
    voicePlayer.play([{
      id:             item.id,
      title:          item.title,
      contentSnippet: item.contentSnippet,
      translations:   item.translations,
    }]);
    setHasStarted(true);
  };

  const handleToggle = () => {
    if (voicePlayer.isPlaying) {
      voicePlayer.pause();
    } else if (voicePlayer.isPaused) {
      voicePlayer.resume();
    } else {
      handlePlay();
    }
  };

  const isActive = voicePlayer.isPlaying || voicePlayer.isTranslating;
  const isPaused = voicePlayer.isPaused;

  return (
    <div>
      <style>{barKeyframes}</style>

      {/* Coin reward feedback */}
      {showCoinAnim && (
        <div style={{
          background: '#b366ff15', border: '1px solid #b366ff30', borderRadius: 8,
          padding: '8px 12px', marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 8,
          animation: 'coinPop 0.4s ease-out',
        }}>
          <Coins size={14} style={{ color: '#b366ff' }} />
          <span style={{ color: '#b366ff', ...MONO, fontSize: 11 }}>
            +{coinsEarned} coins earned!
            {streakBonus > 0 && ` +${streakBonus} daily streak bonus!`}
          </span>
        </div>
      )}

      {alreadyClaimed && !showCoinAnim && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          marginBottom: 12, color: '#556677', ...MONO, fontSize: 10,
        }}>
          <Check size={12} /> Already earned today
        </div>
      )}

      {/* Article title */}
      <h3 style={{ color: '#e8eaf0', ...SANS, fontSize: 14, fontWeight: 600, lineHeight: 1.4, marginBottom: 20, textAlign: 'center' }}>
        {item.title}
      </h3>

      {/* Waveform visualizer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 4, height: 80, marginBottom: 24,
      }}>
        {BAR_ANIMATIONS.map((anim, i) => (
          <div
            key={i}
            style={{
              width:      6,
              borderRadius: 3,
              background: isActive ? '#b366ff' : isPaused ? '#b366ff60' : '#2a2a4e',
              animation:  isActive ? anim : 'none',
              height:     isActive ? undefined : '30%',
              transition: 'background 0.3s, height 0.3s',
            }}
          />
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        {/* Speed */}
        <button
          onClick={() => {
            const speeds: Array<1 | 1.5 | 2> = [1, 1.5, 2];
            const idx = speeds.indexOf(voicePlayer.speed as 1 | 1.5 | 2);
            voicePlayer.setSpeed(speeds[(idx + 1) % 3]);
          }}
          style={{
            background: '#1a1a2e', border: '1px solid #2a2a4e', color: '#889',
            ...MONO, fontSize: 11, borderRadius: 6, padding: '6px 12px', cursor: 'pointer',
          }}
        >
          {voicePlayer.speed}x
        </button>

        {/* Play/Pause */}
        <button
          onClick={handleToggle}
          style={{
            width: 56, height: 56, borderRadius: '50%',
            background: isActive ? '#b366ff' : '#b366ff20',
            border: `2px solid ${isActive ? '#b366ff' : '#b366ff60'}`,
            color: isActive ? '#07070e' : '#b366ff',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s',
          }}
        >
          {isActive ? <Pause size={22} /> : <Play size={22} style={{ marginLeft: 2 }} />}
        </button>

        {/* Stop */}
        <button
          onClick={() => voicePlayer.stop()}
          style={{
            background: '#1a1a2e', border: '1px solid #2a2a4e', color: '#889',
            ...MONO, fontSize: 10, borderRadius: 6, padding: '6px 12px', cursor: 'pointer',
            letterSpacing: '0.06em',
          }}
        >
          STOP
        </button>
      </div>

      {/* Status */}
      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <span style={{ color: '#556677', ...MONO, fontSize: 10 }}>
          {voicePlayer.isTranslating ? 'Translating...' : isActive ? 'Playing...' : isPaused ? 'Paused' : 'Tap play to listen'}
        </span>
      </div>
    </div>
  );
}
