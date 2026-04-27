/**
 * StoryTimelinePopup — vertical chronological timeline of related coverage
 * for a given article. Fetches GET /api/news/timeline/:currentId and
 * renders each article as a card on a teal vertical line, with the
 * current article pinned at the bottom as "YOU ARE HERE".
 */

import { useEffect, useState } from 'react';

const MONO = "'DM Mono', monospace";
const SANS = "'DM Sans', sans-serif";
const TEAL = '#3bffee';

interface TimelineArticle {
  id:        string;
  title:     string;
  link:      string;
  source:    string;
  pub_date:  string;
  category:  string;
}

interface Props {
  currentId:    string;
  currentTitle: string;
  category:     string;
}

function formatPubDate(raw: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleString('en-IN', {
    day:    '2-digit',
    month:  'short',
    hour:   '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function StoryTimelinePopup({ currentId, currentTitle, category }: Props) {
  const [articles, setArticles] = useState<TimelineArticle[] | null>(null);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setArticles(null);
    setError(null);

    fetch(`/api/news/timeline/${encodeURIComponent(currentId)}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data?.ok && Array.isArray(data.articles)) {
          setArticles(data.articles);
        } else {
          setError(data?.error || 'Failed to load timeline');
        }
      })
      .catch(err => {
        if (!cancelled) setError(err?.message || 'Network error');
      });

    return () => { cancelled = true; };
  }, [currentId]);

  // Loading
  if (articles === null && !error) {
    return (
      <div style={{
        padding:    '40px 0',
        textAlign:  'center',
        fontFamily: MONO,
        color:      TEAL,
        fontSize:   12,
        letterSpacing: '0.08em',
      }}>
        LOADING TIMELINE…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontFamily: SANS, color: '#ff4466', fontSize: 13, padding: 12 }}>
        {error}
      </div>
    );
  }

  const list = articles ?? [];

  // Empty
  if (list.length === 0) {
    return (
      <div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: TEAL, letterSpacing: '0.08em', marginBottom: 12 }}>
          1 ARTICLE IN THIS STORY
        </div>
        <div style={{ fontFamily: SANS, color: '#888899', fontSize: 13, padding: '20px 0' }}>
          No earlier coverage found for this story.
        </div>
        {/* Still show "you are here" anchor */}
        <YouAreHereCard title={currentTitle} category={category} />
      </div>
    );
  }

  const totalCount = list.length + 1; // +1 for current article

  return (
    <div>
      <div style={{
        fontFamily:    MONO,
        fontSize:      10,
        color:         TEAL,
        letterSpacing: '0.08em',
        marginBottom:  12,
        textTransform: 'uppercase',
      }}>
        {totalCount} articles in this story
      </div>

      <div style={{ position: 'relative', paddingLeft: 20 }}>
        {/* Vertical teal line */}
        <div style={{
          position:   'absolute',
          left:       6,
          top:        4,
          bottom:     4,
          width:      1,
          background: `${TEAL}55`,
        }} />

        {list.map(a => (
          <TimelineCard key={a.id} article={a} />
        ))}

        <YouAreHereCard title={currentTitle} category={category} />
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Dot({ bright = false }: { bright?: boolean }) {
  return (
    <div style={{
      position:    'absolute',
      left:        -17,
      top:         10,
      width:       9,
      height:      9,
      borderRadius:'50%',
      background:  bright ? TEAL : `${TEAL}99`,
      boxShadow:   bright ? `0 0 8px ${TEAL}` : 'none',
      border:      `1px solid #07070e`,
    }} />
  );
}

function TimelineCard({ article }: { article: TimelineArticle }) {
  return (
    <a
      href={article.link}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display:        'block',
        position:       'relative',
        background:     '#0a0a18',
        border:         '1px solid #1e1e2e',
        borderRadius:   6,
        padding:        '10px 12px',
        marginBottom:   12,
        textDecoration: 'none',
      }}
    >
      <Dot />
      <div style={{
        fontFamily:    MONO,
        fontSize:      10,
        color:         '#556677',
        letterSpacing: '0.06em',
        marginBottom:  4,
      }}>
        {formatPubDate(article.pub_date)}
      </div>
      <div style={{
        fontFamily: SANS,
        fontSize:   13,
        color:      '#e8eaf0',
        lineHeight: 1.4,
        marginBottom: 6,
      }}>
        {article.title}
      </div>
      <div style={{
        fontFamily:    MONO,
        fontSize:      10,
        color:         '#556677',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}>
        {article.source}
      </div>
    </a>
  );
}

function YouAreHereCard({ title, category }: { title: string; category: string }) {
  return (
    <div style={{
      position:     'relative',
      background:   `${TEAL}10`,
      border:       `1px solid ${TEAL}55`,
      borderLeft:   `3px solid ${TEAL}`,
      borderRadius: 6,
      padding:      '10px 12px',
      marginBottom: 4,
    }}>
      <Dot bright />
      <div style={{
        fontFamily:    MONO,
        fontSize:      10,
        color:         TEAL,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        marginBottom:  4,
        fontWeight:    500,
      }}>
        ▸ You are here
      </div>
      <div style={{
        fontFamily:   SANS,
        fontSize:     13,
        color:        '#e8eaf0',
        lineHeight:   1.4,
        marginBottom: 6,
      }}>
        {title}
      </div>
      <div style={{
        fontFamily:    MONO,
        fontSize:      10,
        color:         `${TEAL}aa`,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}>
        {category}
      </div>
    </div>
  );
}
