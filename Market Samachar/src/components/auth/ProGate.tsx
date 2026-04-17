import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { AuthModal } from './AuthModal';

interface SignInGateProps {
  children: React.ReactNode;
  /** Feature name shown in the sign-in prompt */
  feature?: string;
}

/**
 * Wraps features that require sign-in.
 * - Unauthenticated → shows sign-in prompt
 * - Authenticated → renders children normally
 */
export function ProGate({ children, feature = 'this feature' }: SignInGateProps) {
  const { user, loading } = useAuth();
  const [showModal, setShowModal] = useState(false);

  if (loading) return null;

  if (!user) {
    return (
      <>
        <div
          style={{
            background: '#0d0d1e',
            border: '1px solid #1e1e2e',
            borderRadius: '10px',
            padding: '2rem 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.75rem',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'rgba(0,255,136,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Lock size={18} color="#00ff88" />
          </div>

          <div>
            <p
              style={{
                color: '#e8eaf0',
                fontFamily: "'DM Mono', monospace",
                fontSize: '0.85rem',
                fontWeight: 500,
                letterSpacing: '0.04em',
                marginBottom: '4px',
              }}
            >
              SIGN IN REQUIRED
            </p>
            <p
              style={{
                color: '#888899',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.82rem',
                lineHeight: 1.5,
              }}
            >
              Sign in to access {feature}
            </p>
          </div>

          <button
            onClick={() => setShowModal(true)}
            style={{
              background: '#00ff88',
              border: 'none',
              borderRadius: '6px',
              color: '#07070e',
              fontFamily: "'DM Mono', monospace",
              fontSize: '0.78rem',
              fontWeight: 600,
              padding: '0.6rem 1.25rem',
              cursor: 'pointer',
              letterSpacing: '0.06em',
              marginTop: '0.25rem',
            }}
          >
            SIGN IN / SIGN UP
          </button>
        </div>
        {showModal && <AuthModal onClose={() => setShowModal(false)} />}
      </>
    );
  }

  return <>{children}</>;
}
