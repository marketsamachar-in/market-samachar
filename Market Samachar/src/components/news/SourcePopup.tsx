/**
 * SourcePopup — full source article in a scrollable popup (FREE, no coins).
 */

import React, { useState, useEffect } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import DOMPurify from 'dompurify';

const MONO: React.CSSProperties = { fontFamily: "'DM Mono', monospace" };
const SANS: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif" };

interface NewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
}

export function SourcePopup({ item }: { item: NewsItem }) {
  const [html, setHtml]       = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  useEffect(() => {
    fetch(`/api/news/article?url=${encodeURIComponent(item.link)}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => {
        const content = data.content || data.textContent || data.excerpt || '';
        setHtml(content);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [item.link]);

  return (
    <div>
      {/* Badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <span style={{
          background: '#ffdd3b15', border: '1px solid #ffdd3b30',
          color: '#ffdd3b', ...MONO, fontSize: 9, padding: '2px 8px',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ffdd3b', padding: '40px 0' }}>
          <RefreshCw size={14} className="animate-spin" />
          <span style={{ ...MONO, fontSize: 11 }}>Loading article...</span>
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '30px 0' }}>
          <p style={{ color: '#ff6688', ...SANS, fontSize: 13, marginBottom: 12 }}>
            Could not load the full article.
          </p>
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#ffdd3b', ...MONO, fontSize: 11,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            Open Original <ExternalLink size={12} />
          </a>
        </div>
      ) : (
        <>
          <div
            style={{ color: '#b0c4cc', ...SANS, fontSize: 13, lineHeight: 1.8 }}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html || '') }}
          />
          <div style={{ borderTop: '1px solid #1e1e2e', marginTop: 20, paddingTop: 14, textAlign: 'center' }}>
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: '#ffdd3b', ...MONO, fontSize: 10, letterSpacing: '0.06em',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              VIEW ORIGINAL <ExternalLink size={11} />
            </a>
          </div>
        </>
      )}
    </div>
  );
}
