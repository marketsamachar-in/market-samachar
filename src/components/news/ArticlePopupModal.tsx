/**
 * ArticlePopupModal — reusable 1:1 aspect-ratio popup for article actions.
 */

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif" };

const TYPE_COLORS: Record<string, string> = {
  'market-impact':  '#3b9eff',
  'ai-summary':     '#00ff88',
  listen:           '#b366ff',
  source:           '#ffdd3b',
  'story-timeline': '#3bffee',
  'community-poll': '#ff9f3b',
  'share-card':     '#ff6bff',
};

interface Props {
  isOpen:   boolean;
  onClose:  () => void;
  title:    string;
  type:     'market-impact' | 'ai-summary' | 'listen' | 'source' | 'story-timeline' | 'community-poll' | 'share-card';
  badge?:   React.ReactNode;
  children: React.ReactNode;
}

export function ArticlePopupModal({ isOpen, onClose, title, type, badge, children }: Props) {
  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;

  const accent = TYPE_COLORS[type] || '#00ff88';

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position:        'fixed',
        inset:           0,
        zIndex:          9500,
        background:      'rgba(0,0,0,0.85)',
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        padding:         16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width:           'min(90vw, 500px)',
          maxHeight:       '90vh',
          background:      '#0d0d1e',
          border:          `1px solid ${accent}30`,
          borderTop:       `3px solid ${accent}`,
          borderRadius:    12,
          display:         'flex',
          flexDirection:   'column',
          overflow:        'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding:      '12px 16px',
            borderBottom: '1px solid #1e1e2e',
            display:      'flex',
            alignItems:   'center',
            gap:          8,
            flexShrink:   0,
          }}
        >
          <div
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: accent, flexShrink: 0,
            }}
          />
          <span
            style={{ color: accent, ...MONO, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', flex: 1 }}
          >
            {title}
          </span>
          {badge}
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: '#556677',
              cursor: 'pointer', padding: 4, display: 'flex',
              alignItems: 'center', flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable content */}
        <div
          style={{
            flex:      1,
            overflowY: 'auto',
            padding:   '16px',
            ...SANS,
          }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
