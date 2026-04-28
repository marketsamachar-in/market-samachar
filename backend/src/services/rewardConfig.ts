/**
 * Reward Configuration — Single source of truth for the entire coin economy.
 *
 * X = 100 coins (base unit).  All rewards scale from this.
 *
 * ┌──────────────────────────────┬──────┬────────┬────────────────────────┐
 * │ Action                       │ Mult │ Coins  │ Difficulty             │
 * ├──────────────────────────────┼──────┼────────┼────────────────────────┤
 * │ First-time login (welcome)   │ 10X  │ 1 000  │ One-time only          │
 * │ Daily login                  │  1X  │   100  │ Easy — just show up    │
 * │ Daily streak bonus (per day) │ 0.5X │ +50/d  │ Cumulative, max 5X    │
 * │ Referral (both parties)      │  5X  │   500  │ Medium — bring a friend│
 * │ Quiz correct answer (each)   │  1X  │   100  │ Medium — ×IQ tier mult │
 * │ Quiz perfect (all 5 correct) │  3X  │   300  │ Hard — ×IQ tier mult   │
 * │ Prediction vote              │  1X  │   100  │ Easy — participate     │
 * │ Prediction correct           │  3X  │   300  │ Hard — must be right   │
 * │ News Impact quiz correct     │  1X  │   100  │ Medium                 │
 * │ IPO prediction vote          │  1X  │   100  │ Easy — participate     │
 * │ IPO prediction correct       │  5X  │   500  │ Hard — predict listing │
 * │ Virtual trade activity       │ 0.5X │    50  │ Easy — just trade      │
 * │ Portfolio profit (≥5% sell)  │  5X  │   500  │ Hard — skill-based     │
 * └──────────────────────────────┴──────┴────────┴────────────────────────┘
 */

// ─── Base unit ───────────────────────────────────────────────────────────────
export const X = 100;  // 1X = 100 coins

// ─── Login & Streak ──────────────────────────────────────────────────────────
export const FIRST_LOGIN_COINS       = 10 * X;      // 1,000 coins — one-time welcome
export const DAILY_LOGIN_COINS       = 1  * X;      //   100 coins — daily base
export const STREAK_BONUS_PER_DAY    = Math.round(0.5 * X);  // +50 per consecutive day
export const STREAK_BONUS_MAX        = 5  * X;      //   500 max streak bonus (10 days max)

// ─── Referral ────────────────────────────────────────────────────────────────
export const REFERRAL_NEW_USER_COINS = 5  * X;      //   500 coins — new user who uses code
export const REFERRAL_INVITER_COINS  = 5  * X;      //   500 coins — referrer reward (same)

// ─── Daily Quiz (Market Quiz) — 1×/day, counts for leaderboard + IQ + rewards
// Per-correct base payout is multiplied by the user's IQ tier (see
// getIQTierMultiplier in src/lib/iq-calculator.ts) so higher IQs earn more.
export const QUIZ_CORRECT_COINS      = 1  * X;      //   100 per correct (×tier mult)
export const QUIZ_PERFECT_BONUS      = 3  * X;      //   300 bonus for 5/5 (×tier mult)

// ─── Quiz Podium Prizes (paid out by cron, top 3 by IQ delta) ────────────────
// Rank is by IQ earned during the period, not raw score — so speed + streak
// (which feed into IQ) both matter. Same tier for daily / weekly / monthly.
export const QUIZ_PODIUM_PRIZES: [number, number, number] = [
  10 * X,   // 1st place — 1,000 coins
  Math.round(7.5 * X),  // 2nd place — 750 coins
  5  * X,   // 3rd place — 500 coins
];

// ─── Daily Predictions (Bazaar Bhavishya) ────────────────────────────────────
export const PREDICTION_VOTE_COINS   = 1  * X;      //   100 for participating
export const PREDICTION_CORRECT_COINS= 3  * X;      //   300 for correct prediction

// ─── News Impact Quiz ────────────────────────────────────────────────────────
export const NEWS_IMPACT_CORRECT_COINS = 1 * X;     //   100 per correct answer

// ─── IPO Predictions ─────────────────────────────────────────────────────────
export const IPO_PREDICTION_VOTE_COINS   = 1 * X;   //   100 for participating
export const IPO_PREDICTION_CORRECT_COINS= 5 * X;   //   500 for correct IPO call

// ─── Virtual Trading (Paper Trading) ─────────────────────────────────────────
export const TRADE_ACTIVITY_COINS    = Math.round(0.5 * X);  //  50 per trade
export const PROFIT_BONUS_COINS      = 5  * X;      //   500 for ≥5% profit on sell
export const PROFIT_BONUS_THRESHOLD  = 0.05;         // 5% gain required

// ─── Reading Rewards (News Engagement) ───────────────────────────────────────
export const AI_SUMMARY_READ_COINS         = 5;        //   5 coins per unique AI summary view
export const ARTICLE_LISTEN_COINS          = 10;       //  10 coins per unique article listen
export const DAILY_READING_STREAK_COINS    = 5 * X;    // 500 coins daily bonus for reading
export const DAILY_READING_STREAK_MIN_ARTICLES = 5;    // must read 5 unique articles to unlock streak bonus
export const READING_REWARD_DAILY_CAP      = 100;      // max 100 unique articles per action per day

// ─── Starting balance ────────────────────────────────────────────────────────
export const STARTING_BALANCE        = 10 * X;      // 1,000 coins for new users

// ─── Community Engagement ────────────────────────────────────────────────────
export const POLL_VOTE_COINS         = 3;           //   3 coins for voting on community poll
export const SHARE_ARTICLE_COINS     = 2;           //   2 coins for sharing an article

// ─── PULSE — Bull/Bear News Swiper ───────────────────────────────────────────
export const PULSE_SWIPE_COINS         = 5;     //  +5 coins per swipe (capped daily)
export const PULSE_CORRECT_BONUS_COINS = 20;    // +20 coins after 24h if direction correct
export const PULSE_DAILY_SWIPE_CAP     = 100;   // max coin-paying swipes per day per user

// ─── CHARTGUESSR — Guess the Stock from chart ────────────────────────────────
export const CHARTGUESSR_CORRECT_COINS  = 20;   // +20 coins per correct guess
export const CHARTGUESSR_WRONG_PENALTY  = 5;    //  −5 coins per wrong guess
export const CHARTGUESSR_DAILY_LIMIT    = 30;   // max plays/day before paywall
export const CHARTGUESSR_STREAK_5_BONUS = 50;   // +50 at streak of 5
export const CHARTGUESSR_STREAK_10_BONUS = 200; // +200 at streak of 10
export const CHARTGUESSR_STREAK_20_BONUS = 1000;// +1000 at streak of 20
