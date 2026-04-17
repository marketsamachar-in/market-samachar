// ─── Shared types for the Market Quiz system ─────────────────────────────────

export interface SafeQuestion {
  id: string;
  question: string;
  options: string[];          // exactly 4
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  news_source_url: string;
}

export interface AnswerResult {
  question_id: string;
  selected_index: number;     // -1 = timed out
  correct_index: number;
  correct: boolean;
  explanation: string;
  question: string;
  options: string[];
  category?: string;
}

export interface SubmitResult {
  date: string;
  score: number;
  total: number;
  coins_earned: number;
  tier_multiplier?: number;
  new_iq: number;
  new_streak: number;
  results: AnswerResult[];
}

export interface LeaderboardEntry {
  user_id: string;
  name?: string;
  avatar?: string | null;
  investor_iq?: number;
  // daily fields
  score?: number;
  iq_change?: number;
  time_taken_secs?: number;
  coins_earned?: number;
  // weekly / all-time aggregated fields
  total_iq_gained?: number;
  total_score?: number;
  days_played?: number;
  total_coins?: number;
  avg_score?: number;
}

export type QuizView = 'landing' | 'playing' | 'result' | 'leaderboard';

export const DIFF_COLOR: Record<string, string> = {
  easy:   '#00ff88',
  medium: '#ffdd3b',
  hard:   '#ff4466',
};

export const CAT_COLOR: Record<string, string> = {
  indian:    '#00ff88',
  companies: '#ffdd3b',
  global:    '#3bffee',
  commodity: '#ff6b3b',
  crypto:    '#b366ff',
  ipo:       '#ff3bff',
  economy:   '#3b9eff',
  banking:   '#3b9eff',
  sebi:      '#ff9f3b',
  rbi:       '#3b9eff',
};
