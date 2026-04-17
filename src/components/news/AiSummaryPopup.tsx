/**
 * AiSummaryPopup — AI-generated summary in popup with +5 coin reward.
 */

import React, { useState, useEffect } from 'react';
import { Sparkles, Check, Coins } from 'lucide-react';
import { AiSummaryCard } from './AiSummaryCard';

const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };

interface NewsItem {
  id: string;
  title: string;
  source: string;
  category: string;
  pubDate: string;
  contentSnippet?: string;
  aiSummary?: string;
  summaryBullets?: string[];
  sentiment?: 'bullish' | 'bearish' | 'neutral';
  impactSectors?: string[];
  keyNumbers?: { value: string; context: string }[];
  translations?: Record<string, { title: string; summary: string; bullets: string[] }>;
}

interface Props {
  item: NewsItem;
  isSignedIn?: boolean;
  authToken?: string | null;
}

export function AiSummaryPopup({ item, isSignedIn, authToken }: Props) {
  const [coinsEarned, setCoinsEarned]     = useState(0);
  const [streakBonus, setStreakBonus]      = useState(0);
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);
  const [showCoinAnim, setShowCoinAnim]   = useState(false);

  // Claim reward on mount
  useEffect(() => {
    if (!isSignedIn || !authToken) return;

    fetch('/api/reading-rewards/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ articleId: item.id, rewardType: 'AI_SUMMARY_READ' }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.alreadyClaimed || data.alreadyCapped) {
          setAlreadyClaimed(true);
        } else if (data.coinsEarned > 0) {
          setCoinsEarned(data.coinsEarned);
          setStreakBonus(data.streakBonusEarned || 0);
          setShowCoinAnim(true);
          setTimeout(() => setShowCoinAnim(false), 3000);
        }
      })
      .catch(() => {});
  }, [item.id, isSignedIn, authToken]);

  const hasAiData = !!(item.aiSummary || (item.summaryBullets && item.summaryBullets.length > 0));

  return (
    <div>
      {/* Coin reward feedback */}
      {showCoinAnim && (
        <div style={{
          background: '#00ff8815', border: '1px solid #00ff8830', borderRadius: 8,
          padding: '8px 12px', marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 8,
          animation: 'fadeIn 0.3s ease-out',
        }}>
          <Coins size={14} style={{ color: '#00ff88' }} />
          <span style={{ color: '#00ff88', ...MONO, fontSize: 11 }}>
            +{coinsEarned} coins earned!
            {streakBonus > 0 && ` +${streakBonus} daily streak bonus!`}
          </span>
        </div>
      )}

      {alreadyClaimed && !showCoinAnim && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          marginBottom: 12, color: '#556677', ...MONO, fontSize: 10,
        }}>
          <Check size={12} /> Already earned today
        </div>
      )}

      {/* AI Summary content */}
      {hasAiData ? (
        <AiSummaryCard item={item} />
      ) : (
        <div>
          {/* Snippet fallback while AI processes */}
          {item.contentSnippet ? (
            <div style={{
              background: '#0d0d1e', border: '1px solid #1e1e2e',
              borderRadius: 8, padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Sparkles size={12} style={{ color: '#444455' }} />
                <span style={{ color: '#444455', ...MONO, fontSize: 10, letterSpacing: '0.06em' }}>
                  AI SUMMARY GENERATING…
                </span>
              </div>
              <p style={{ color: '#888899', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                {item.contentSnippet}
              </p>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <Sparkles size={24} style={{ color: '#334466', marginBottom: 8 }} />
              <p style={{ color: '#556677', ...MONO, fontSize: 11 }}>
                AI summary not available for this article yet.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
