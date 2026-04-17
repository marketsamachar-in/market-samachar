/**
 * useVoicePlayer — Web Speech API powered voice news hook for Voice News.
 * Manages a playlist, translate-before-speak flow, speed/volume, and session control.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VoiceItem {
  id:              string;
  title:           string;
  contentSnippet?: string;
  /** Optional pre-generated translations keyed by language code (e.g. "hi", "te"). */
  translations?:   Record<string, { title: string; summary?: string; bullets?: string[] }>;
}

export interface VoicePlayerState {
  playlist:      VoiceItem[];
  currentIndex:  number;
  isPlaying:     boolean;
  isPaused:      boolean;
  isTranslating: boolean;
  speed:         1 | 1.5 | 2;
  volume:        number;
}

export interface VoicePlayer extends VoicePlayerState {
  play:      (items: VoiceItem[], startIndex?: number) => void;
  pause:     () => void;
  resume:    () => void;
  next:      () => void;
  close:     () => void;
  setSpeed:  (s: 1 | 1.5 | 2) => void;
  setVolume: (v: number) => void;
}

// ─── Language → BCP-47 ───────────────────────────────────────────────────────

const LANG_BCP47: Record<string, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  te: 'te-IN',
  ta: 'ta-IN',
  mr: 'mr-IN',
  bn: 'bn-BD',
  kn: 'kn-IN',
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVoicePlayer(lang: string): VoicePlayer {
  const [state, setState] = useState<VoicePlayerState>({
    playlist:      [],
    currentIndex:  0,
    isPlaying:     false,
    isPaused:      false,
    isTranslating: false,
    speed:         1,
    volume:        1,
  });

  // Refs: always up-to-date, readable inside async callbacks without stale closures
  const stateRef   = useRef(state);
  const sessionRef = useRef(0);      // incremented on every play/close — cancels stale async chains
  const speedRef   = useRef<1 | 1.5 | 2>(1);
  const volumeRef  = useRef<number>(1);
  const cacheRef   = useRef<Map<string, string>>(new Map());

  stateRef.current = state;

  // Cleanup on unmount
  useEffect(() => {
    return () => { window.speechSynthesis?.cancel(); };
  }, []);

  // Cancel playback when language changes mid-stream
  useEffect(() => {
    if (stateRef.current.isPlaying || stateRef.current.isPaused) {
      ++sessionRef.current;
      window.speechSynthesis?.cancel();
      setState(s => ({ ...s, isPlaying: false, isPaused: false, isTranslating: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // ── Translation helper ────────────────────────────────────────────────────

  const getVoiceText = useCallback(async (item: VoiceItem): Promise<string> => {
    const raw = [item.title, item.contentSnippet]
      .filter(Boolean).join('. ').replace(/\s+/g, ' ').trim();

    if (lang === 'en') return raw;

    const cacheKey = `${item.id}_${lang}`;
    const cached   = cacheRef.current.get(cacheKey);
    if (cached) return cached;

    // Prefer pre-generated translations from the backend — avoids a Gemini call.
    const pre = item.translations?.[lang];
    if (pre?.title) {
      const text = [pre.title, pre.summary].filter(Boolean).join('. ').trim();
      cacheRef.current.set(cacheKey, text);
      return text;
    }

    try {
      const res = await fetch('/api/translate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          items: [{
            id:             item.id,
            title:          item.title,
            contentSnippet: item.contentSnippet ?? '',
            content:        '',
          }],
          lang,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const t    = data.items?.[0];
        if (t) {
          const text = [t.title, t.contentSnippet].filter(Boolean).join('. ').trim();
          cacheRef.current.set(cacheKey, text);
          return text;
        }
      }
    } catch { /* fall through to original */ }

    return raw;
  }, [lang]);

  // ── Core speak logic ─────────────────────────────────────────────────────

  const speakItem = useCallback(async (
    playlist: VoiceItem[],
    index:    number,
    session:  number,
  ) => {
    if (session !== sessionRef.current) return; // cancelled

    if (index >= playlist.length) {
      setState(s => ({ ...s, isPlaying: false, isPaused: false, isTranslating: false }));
      return;
    }

    const item = playlist[index];
    setState(s => ({
      ...s, playlist, currentIndex: index,
      isTranslating: true, isPlaying: true, isPaused: false,
    }));

    window.speechSynthesis?.cancel();

    const text = await getVoiceText(item);
    if (session !== sessionRef.current) return; // cancelled during translation

    setState(s => ({ ...s, isTranslating: false }));

    const utt    = new SpeechSynthesisUtterance(text);
    utt.lang     = LANG_BCP47[lang] ?? 'en-IN';
    utt.rate     = speedRef.current;
    utt.volume   = volumeRef.current;

    // Best-effort voice match
    const voices = window.speechSynthesis.getVoices();
    const bcp47  = LANG_BCP47[lang] ?? 'en-IN';
    const voice  = voices.find(v => v.lang === bcp47)
                ?? voices.find(v => v.lang.startsWith(bcp47.slice(0, 2)));
    if (voice) utt.voice = voice;

    utt.onend   = () => speakItem(playlist, index + 1, session);
    utt.onerror = (e) => {
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      if (session === sessionRef.current) {
        setState(s => ({ ...s, isPlaying: false, isTranslating: false }));
      }
    };

    window.speechSynthesis?.speak(utt);
  }, [lang, getVoiceText]);

  // ── Public API ────────────────────────────────────────────────────────────

  const play = useCallback((items: VoiceItem[], startIndex = 0) => {
    if (!window.speechSynthesis) return;
    const session = ++sessionRef.current;
    window.speechSynthesis.cancel();
    speakItem(items, startIndex, session);
  }, [speakItem]);

  const pause = useCallback(() => {
    window.speechSynthesis?.pause();
    setState(s => ({ ...s, isPlaying: false, isPaused: true }));
  }, []);

  const resume = useCallback(() => {
    window.speechSynthesis?.resume();
    setState(s => ({ ...s, isPlaying: true, isPaused: false }));
  }, []);

  const next = useCallback(() => {
    const { playlist, currentIndex } = stateRef.current;
    if (currentIndex >= playlist.length - 1) return;
    const session = ++sessionRef.current;
    window.speechSynthesis?.cancel();
    speakItem(playlist, currentIndex + 1, session);
  }, [speakItem]);

  const close = useCallback(() => {
    ++sessionRef.current;
    window.speechSynthesis?.cancel();
    setState({
      playlist: [], currentIndex: 0,
      isPlaying: false, isPaused: false,
      isTranslating: false, speed: 1, volume: 1,
    });
    speedRef.current  = 1;
    volumeRef.current = 1;
  }, []);

  const setSpeed = useCallback((speed: 1 | 1.5 | 2) => {
    speedRef.current = speed;
    setState(s => ({ ...s, speed }));
    if (stateRef.current.isPlaying) {
      const { playlist, currentIndex } = stateRef.current;
      const session = ++sessionRef.current;
      window.speechSynthesis?.cancel();
      speakItem(playlist, currentIndex, session);
    }
  }, [speakItem]);

  const setVolume = useCallback((volume: number) => {
    volumeRef.current = volume;
    setState(s => ({ ...s, volume }));
    // Volume changes take effect on the next utterance
  }, []);

  return { ...state, play, pause, resume, next, close, setSpeed, setVolume };
}
