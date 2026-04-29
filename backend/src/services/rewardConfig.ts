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

// ─── Community Engagement — Polls ────────────────────────────────────────────
// Polls drive sentiment data we can show on every news card. Pay generously
// to get the volume needed for meaningful "X% bullish" signals.
export const POLL_VOTE_COINS              = 10;     //  10 coins per vote (was 3)
export const POLL_VOTE_DAILY_CAP          = 30;     //  max coin-paying votes per day
export const POLL_STREAK_5_BONUS_COINS    = 50;     //  +50 bonus when you hit 5 votes today
export const POLL_STREAK_15_BONUS_COINS   = 150;    //  +150 additional bonus at 15 votes
                                                    //  → max poll coins/day = 30×10 + 50 + 150 = 500

// ─── Community Engagement — Shares (viral growth) ────────────────────────────
// Shares are user-acquisition. Each click-through that converts to a signup
// triggers the existing REFERRAL flow (+500 to both parties) — that is the
// "viral jackpot" on top of the per-share reward below.
export const SHARE_ARTICLE_COINS          = 25;     //  25 coins per share (was 2)
export const SHARE_ARTICLE_DAILY_CAP      = 10;     //  max coin-paying shares per day
export const SHARE_MULTI_PLATFORM_BONUS   = 50;     //  +50 if same article shared to 2+ platforms
export const SHARE_STREAK_5_BONUS_COINS   = 100;    //  +100 when you hit 5 shares today
                                                    //  → max share coins/day (excl. signups) = 10×25 + 50 + 100 = 400

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

// ─── COMBO CARD — Daily 5-question prediction lottery ────────────────────────
// Submitted before 9:30 IST market open, settled at 15:35 IST close.
// Payout is score-based — no participation reward (keeps the tension).
//   3/5 → 1X   |   4/5 → 5X   |   5/5 → 50X (jackpot)
// 0–2/5 → 0 coins.  Expected EV per random play ≈ 75 coins/day, capped by the
// once-per-day rule.  Tune here if economy drifts.
export const COMBO_CARD_3OF5_COINS = 1  * X;        //   100 coins
export const COMBO_CARD_4OF5_COINS = 5  * X;        //   500 coins
export const COMBO_CARD_5OF5_COINS = 50 * X;        // 5,000 coins jackpot
export const COMBO_CARD_SUBMIT_CUTOFF_IST = { h: 9,  m: 30 };  // strict
export const COMBO_CARD_SETTLE_IST        = { h: 15, m: 35 };

// ─── DALAL STREET T20 — Cricket-themed chart-reading reaction game ───────────
//   36 balls per match · 10 wickets max · 5 matches per IST day.
//   Each ball: tap UP or DOWN within 1.8s of seeing the chart.
//   Runs scored by reaction time (faster = more runs); wrong tap = wicket.
//
//   Average match score (good play): 80–150 runs ≈ 80–150 coins.
//   Centuries (≥100 runs)      : +200 bonus.
//   Double-tons (≥200 runs)    : +500 bonus (replaces century, not stacked).
//   Daily cap on matches keeps coin-burn bounded at ~750 coins/day.
export const T20_DAILY_MATCH_CAP   = 5;
export const T20_BALLS_PER_MATCH   = 36;
export const T20_WICKETS_MAX       = 10;
export const T20_COINS_PER_RUN     = 1;
export const T20_CENTURY_BONUS     = 200;     // runs ≥ 100
export const T20_DOUBLE_TON_BONUS  = 500;     // runs ≥ 200 (replaces century)

// Reaction-time scoring tiers (ms).  ≥ TIMEOUT or wrong direction = wicket.
export const T20_BALL_TIMEOUT_MS   = 1800;
export const T20_BALL_FAST_MS      = 600;     // <600 ms correct → 6 (six)
export const T20_BALL_NORMAL_MS    = 1000;    // 600–999 ms     → 4 (boundary)
export const T20_BALL_SLOW_MS      = 1500;    // 1000–1499 ms   → 2
                                              // 1500–1799 ms   → 1
                                              // ≥1800 ms       → wicket
