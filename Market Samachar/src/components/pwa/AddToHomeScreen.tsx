/**
 * AddToHomeScreen — prompts the user to install the PWA.
 *
 * Shows after the 3rd visit (tracked in localStorage).
 * Uses the `beforeinstallprompt` event on supported browsers.
 * Dismissed state is also persisted so it never nags again.
 */

import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

const VISIT_KEY    = 'ms_visit_count';
const DISMISSED_KEY = 'ms_a2hs_dismissed';
const SHOW_AFTER   = 3;

const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif" };

export function AddToHomeScreen() {
  const [show,       setShow]       = useState(false);
  const [deferredEvt, setDeferredEvt] = useState<any>(null);
  const [installing, setInstalling] = useState(false);
  const [installed,  setInstalled]  = useState(false);

  useEffect(() => {
    // Increment visit counter
    const visits = parseInt(localStorage.getItem(VISIT_KEY) ?? '0', 10) + 1;
    localStorage.setItem(VISIT_KEY, String(visits));

    // Already dismissed or installed as PWA
    if (localStorage.getItem(DISMISSED_KEY)) return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if ((window.navigator as any).standalone === true) return; // iOS Safari standalone

    if (visits < SHOW_AFTER) return;

    // Capture the browser's install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredEvt(e);
      setShow(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // On iOS Safari, the event never fires — show our custom guidance instead
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /safari/i.test(navigator.userAgent) && !/chrome/i.test(navigator.userAgent);
    if (isIOS && isSafari) setShow(true);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredEvt) return; // iOS — no native prompt
    setInstalling(true);
    try {
      deferredEvt.prompt();
      const { outcome } = await deferredEvt.userChoice;
      if (outcome === 'accepted') {
        setInstalled(true);
        setTimeout(() => setShow(false), 1800);
      }
    } finally {
      setInstalling(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setShow(false);
  };

  if (!show) return null;

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const hasNativePrompt = !!deferredEvt;

  return (
    <div
      style={{
        position:   'fixed',
        bottom:     20,
        left:       '50%',
        transform:  'translateX(-50%)',
        zIndex:     9999,
        width:      'min(360px, calc(100vw - 32px))',
        background: '#0d0d1e',
        border:     '1px solid #00ff8840',
        borderRadius: 10,
        padding:    '14px 16px',
        boxShadow:  '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px #00ff8812',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: '#00ff8812', border: '1px solid #00ff8830',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Smartphone size={16} style={{ color: '#00ff88' }} />
          </div>
          <div>
            <div style={{ color: '#00ff88', ...MONO, fontSize: 10, letterSpacing: 1 }}>
              ADD TO HOME SCREEN
            </div>
            <div style={{ color: '#e8eaf0', ...SANS, fontSize: 13, fontWeight: 600 }}>
              Market Samachar
            </div>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#334466', padding: 4,
          }}
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      {installed ? (
        <div style={{ color: '#00ff88', ...MONO, fontSize: 12, textAlign: 'center', padding: '6px 0' }}>
          ✓ Installed! Launch from your home screen.
        </div>
      ) : isIOS && !hasNativePrompt ? (
        /* iOS guidance */
        <div style={{ color: '#8899aa', ...SANS, fontSize: 12, lineHeight: 1.5 }}>
          Tap{' '}
          <span style={{ color: '#e8eaf0' }}>
            <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2} style={{ verticalAlign: 'middle', display: 'inline-block' }}>
              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/>
            </svg>
            {' '}Share
          </span>
          {' '}then{' '}
          <span style={{ color: '#e8eaf0' }}>"Add to Home Screen"</span>
          {' '}for instant access, offline reading and live alerts.
        </div>
      ) : (
        <>
          <div style={{ color: '#8899aa', ...SANS, fontSize: 12, lineHeight: 1.5, marginBottom: 10 }}>
            Get instant alerts, offline news and a Bloomberg-style terminal on your home screen.
          </div>
          <button
            onClick={handleInstall}
            disabled={installing}
            style={{
              width:        '100%',
              background:   '#00ff8818',
              border:       '1px solid #00ff8840',
              color:        '#00ff88',
              borderRadius: 6,
              padding:      '9px 0',
              cursor:       'pointer',
              ...MONO,
              fontSize:     11,
              fontWeight:   700,
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'center',
              gap:          6,
              opacity:      installing ? 0.6 : 1,
            }}
          >
            <Download size={13} />
            {installing ? 'Installing…' : 'Install App'}
          </button>
        </>
      )}
    </div>
  );
}
