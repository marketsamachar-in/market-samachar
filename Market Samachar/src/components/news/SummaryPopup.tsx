/**
 * SummaryPopup — plain text summary of a news article (FREE, no coins).
 */

import React, { useState, useEffect } from 'react';
import { FileText, RefreshCw } from 'lucide-react';

const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif" };

interface NewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  category: string;
  contentSnippet?: string;
}

export function SummaryPopup({ item }: { item: NewsItem }) {
  const [content, setContent] = useState<string | null>(item.contentSnippet || null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (content) return;
    setLoading(true);
    fetch(`/api/news/article?url=${encodeURIComponent(item.link)}`)
      .then(r => r.json())
      .then(data => setContent(data.excerpt || data.textContent?.slice(0, 1500) || 'Summary not available.'))
      .catch(() => setContent('Could not load summary.'))
      .finally(() => setLoading(false));
  }, [item.link, content]);

  return (
    <div>
      {/* Badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <span style={{
          background: '#3b9eff15', border: '1px solid #3b9eff30',
          color: '#3b9eff', ...MONO, fontSize: 9, padding: '2px 8px',
          borderRadius: 4, letterSpacing: '0.06em',
        }}>
          FREE
        </span>
        <span style={{ color: '#556677', ...MONO, fontSize: 9 }}>{item.source}</span>
      </div>

      {/* Title */}
      <h3 style={{ color: '#e8eaf0', ...SANS, fontSize: 15, fontWeight: 600, lineHeight: 1.4, marginBottom: 14 }}>
        {item.title}
      </h3>

      {/* Content */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#3b9eff', padding: '20px 0' }}>
          <RefreshCw size={14} className="animate-spin" />
          <span style={{ ...MONO, fontSize: 11 }}>Loading summary...</span>
        </div>
      ) : (
        <p style={{ color: '#b0c4cc', ...SANS, fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
          {content}
        </p>
      )}
    </div>
  );
}
