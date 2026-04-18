import { useContext } from 'react';
import { AuthContext } from './AuthProvider';
import type { AuthState } from './AuthProvider';

// Re-export so callers only need to import from 'hooks/useAuth'
export type { AuthState };
export { AuthProvider } from './AuthProvider';

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
