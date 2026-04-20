import React, { useState, useEffect, useCallback, createContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, type Profile } from '../lib/supabase';
import { registerSWAndGetToken, listenForegroundMessages } from '../lib/firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isPro: boolean;
  proExpiresAt: Date | null;
  coins: number;
  /** SQLite virtual_coin_balance — live balance used across trading + navbar. */
  virtualBalance: number;
  /** Re-fetch the SQLite balance (call after buy/sell/reward events). */
  refreshBalance: () => Promise<void>;
  investorIq: number;
  /** Shorthand for signInWithGoogle — opens OAuth redirect */
  signIn: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

export const AuthContext = createContext<AuthState | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [virtualBalance, setVirtualBalance] = useState<number>(0);
  // Start as false when supabase is unconfigured — no async work to do.
  const [loading, setLoading] = useState(!!supabase);

  // ── SQLite virtual balance fetch ────────────────────────────────────────────
  const refreshBalance = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;
      const res = await fetch('/api/auth/balance', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      if (typeof json?.virtualBalance === 'number') {
        setVirtualBalance(json.virtualBalance);
      }
    } catch {
      // Non-fatal — navbar falls back to 0
    }
  }, []);

  // ── Fetch profile ───────────────────────────────────────────────────────────
  const fetchProfile = useCallback(async (userId: string) => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (!error && data) setProfile(data as Profile);
  }, []);

  // ── FCM permission + token ──────────────────────────────────────────────────
  const requestNotificationPermission = useCallback(async (userId: string) => {
    if (!supabase) return;
    if (!('Notification' in window)) return;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;
      const token = await registerSWAndGetToken();
      if (!token) return;
      await supabase.from('profiles').update({ fcm_token: token }).eq('id', userId);
      listenForegroundMessages();
    } catch {
      // Non-fatal — app works fine without push notifications
    }
  }, []);

  // ── Bootstrap + auth listener ───────────────────────────────────────────────
  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        fetchProfile(data.session.user.id);
        refreshBalance();
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        fetchProfile(newSession.user.id);
        if (_event === 'SIGNED_IN') {
          requestNotificationPermission(newSession.user.id);
          // Sync user into local SQLite — non-fatal if it fails
          const u = newSession.user;
          fetch('/api/auth/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id:     u.id,
              email:  u.email,
              name:   u.user_metadata?.full_name || u.email,
              avatar: u.user_metadata?.avatar_url || null,
            }),
          })
            .then(r => r.ok ? r.json() : null)
            .then(j => {
              const v = j?.user?.virtual_coin_balance;
              if (typeof v === 'number') setVirtualBalance(v);
            })
            .catch(() => {});
        }
      } else {
        setProfile(null);
        setVirtualBalance(0);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [fetchProfile, requestNotificationPermission, refreshBalance]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const proExpiresAt = profile?.pro_expires_at ? new Date(profile.pro_expires_at) : null;
  const isPro        = !!(profile?.is_pro && (!proExpiresAt || proExpiresAt > new Date()));
  const coins        = profile?.coins       ?? 0;
  const investorIq   = profile?.investor_iq ?? 300;

  // ── Auth methods — all no-op when supabase is unconfigured ──────────────────
  const signInWithGoogle = useCallback(async () => {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const value: AuthState = {
    user, session, profile, loading,
    isPro, proExpiresAt,
    coins, virtualBalance, refreshBalance,
    investorIq,
    signIn: signInWithGoogle,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
