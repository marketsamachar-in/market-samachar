import { useState, useEffect, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, type Profile } from '../lib/supabase';
import { registerSWAndGetToken, listenForegroundMessages } from '../lib/firebase';

export interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isPro: boolean;
  proExpiresAt: Date | null;
  coins: number;
  investorIq: number;
  /** Shorthand for signInWithGoogle — opens OAuth redirect */
  signIn: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithPhone: (phone: string) => Promise<void>;
  verifyPhoneOtp: (phone: string, token: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [user, setUser]       = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  // Start as false when supabase is unconfigured — no async work to do.
  const [loading, setLoading] = useState(!!supabase);

  // ── Fetch profile ───────────────────────────────────────────────────────────
  const fetchProfile = useCallback(async (userId: string) => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (!error && data) setProfile(data as Profile);
  }, []);

  // ── Bootstrap ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) fetchProfile(data.session.user.id);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        fetchProfile(newSession.user.id);
        // Request push permission + save FCM token on login
        if (_event === 'SIGNED_IN') {
          requestNotificationPermission(newSession.user.id);
        }
      } else {
        setProfile(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [fetchProfile]);

  // ── FCM permission + token ──────────────────────────────────────────────────
  const requestNotificationPermission = useCallback(async (userId: string) => {
    if (!supabase) return;
    if (!('Notification' in window)) return;

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      const token = await registerSWAndGetToken();
      if (!token) return;

      // Persist FCM token on the user's profile so the server can reach them
      await supabase.from('profiles').update({ fcm_token: token }).eq('id', userId);

      // Start listening for foreground messages
      listenForegroundMessages();
    } catch {
      // Non-fatal — app works fine without push notifications
    }
  }, []);

  // ── Derived values ──────────────────────────────────────────────────────────
  const proExpiresAt = profile?.pro_expires_at ? new Date(profile.pro_expires_at) : null;
  const isPro = !!(profile?.is_pro && (!proExpiresAt || proExpiresAt > new Date()));
  const coins     = profile?.coins      ?? 0;
  const investorIq = profile?.investor_iq ?? 300;

  // ── Auth methods — all no-op when supabase is unconfigured ──────────────────
  const signInWithGoogle = useCallback(async () => {
    if (!supabase) throw new Error('Supabase not configured');
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  }, []);

  const signInWithPhone = useCallback(async (phone: string) => {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) throw error;
  }, []);

  const verifyPhoneOtp = useCallback(async (phone: string, token: string) => {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
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

  return {
    user, session, profile, loading,
    isPro, proExpiresAt,
    coins, investorIq,
    signIn: signInWithGoogle,
    signInWithGoogle,
    signInWithPhone,
    verifyPhoneOtp,
    signInWithEmail,
    signUpWithEmail,
    signOut,
  };
}
