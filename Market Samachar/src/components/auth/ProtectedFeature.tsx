import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { AuthModal } from './AuthModal';

interface ProtectedFeatureProps {
  children: React.ReactNode;
  /** Optional label shown on the lock overlay */
  label?: string;
  /** Render a custom trigger instead of the default lock overlay */
  renderLock?: (openModal: () => void) => React.ReactNode;
}

/**
 * Wraps any feature that requires a logged-in user.
 * If unauthenticated, shows a lock overlay that opens AuthModal on click.
 */
export function ProtectedFeature({ children, label = 'Sign in to access this feature', renderLock }: ProtectedFeatureProps) {
  const { user, loading } = useAuth();
  const [showModal, setShowModal] = useState(false);

  if (loading) return null;

  if (!user) {
    return (
      <>
        {renderLock ? (
          renderLock(() => setShowModal(true))
        ) : (
          <div
            style={{
              position: 'relative',
              cursor: 'pointer',
              userSelect: 'none',
            }}
            onClick={() => setShowModal(true)}
            title={label}
          >
            {/* Blurred children as preview */}
            <div style={{ filter: 'blur(4px)', pointerEvents: 'none', opacity: 0.4 }}>
              {children}
            </div>

            {/* Lock overlay */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                background: 'rgba(7,7,14,0.6)',
                borderRadius: '8px',
              }}
            >
              <Lock size={20} color="#00ff88" />
              <span
                style={{
                  color: '#00ff88',
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '0.72rem',
                  letterSpacing: '0.06em',
                  textAlign: 'center',
                  padding: '0 1rem',
                }}
              >
                {label.toUpperCase()}
              </span>
            </div>
          </div>
        )}

        {showModal && <AuthModal onClose={() => setShowModal(false)} />}
      </>
    );
  }

  return <>{children}</>;
}
