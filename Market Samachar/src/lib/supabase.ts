/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not set — auth disabled');
}

// Guard: createClient throws if URL is empty, which crashes the whole module graph.
export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// ─── Database types ────────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  phone: string | null;
  name: string | null;
  avatar: string | null;
  investor_iq: number;
  streak_count: number;
  streak_last_date: string | null;
  coins: number;
  is_pro: boolean;
  pro_expires_at: string | null;
  quiz_attempts_today: number;
  fcm_token: string | null;
  created_at: string;
}
