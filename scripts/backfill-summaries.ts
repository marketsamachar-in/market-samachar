/**
 * One-time backfill script — processes all articles missing AI summaries.
 * Run with: npm run backfill
 *
 * - Processes CONCURRENCY articles in parallel
 * - Full processing: summary + translations (all 6 languages)
 * - Round-robin across all GEMINI_API_KEYS
 * - Shows live progress + ETA
 * - Safe to run alongside the server (SQLite WAL mode handles concurrent writes)
 * - Safe to re-run: already-processed articles are skipped automatically
 */

import Database from 'better-sqlite3';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// ── Config ───────────────────────────────────────────────────────────────────
const DB_PATH     = path.join(__dirname, '..', 'pipeline.db');
const CONCURRENCY = 3;   // articles processed in parallel
const BATCH_DELAY = 2000; // ms pause between batches (avoid Gemini rate limits)
const MODEL       = 'gemini-2.5-flash';

// ── Gemini round-robin ────────────────────────────────────────────────────────
const KEYS = (process.env.GEMINI_API_KEYS ?? process.env.GEMINI_API_KEY ?? '')
  .split(',').map(k => k.trim()).filter(Boolean);

if (!KEYS.length) {
  console.error('❌  No Gemini API keys found. Set GEMINI_API_KEYS in .env.local');
  process.exit(1);
}

let keyIdx = 0;
async function geminiCall(prompt: string): Promise<string> {
  const key = KEYS[keyIdx++ % KEYS.length];
  const ai = new GoogleGenAI({ apiKey: key });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  return response.text ?? '';
}

// ── DB ────────────────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

function getPending() {
  return db.prepare(`
    SELECT id, title, content_snippet
    FROM news_items
    WHERE ai_processed_at IS NULL
    ORDER BY fetched_at DESC
  `).all() as Array<{ id: string; title: string; content_snippet: string | null }>;
}

const saveStmt = db.prepare(`
  UPDATE news_items SET
    ai_summary      = ?,
    summary_bullets = ?,
    sentiment       = ?,
    impact_sectors  = ?,
    key_numbers     = ?,
    translations    = ?,
    ai_processed_at = ?
  WHERE id = ?
`);

function saveAiData(id: string, data: ReturnType<typeof parseGeminiResponse>): void {
  saveStmt.run(
    data.ai_summary,
    JSON.stringify(data.summary_bullets),
    data.sentiment,
    JSON.stringify(data.impact_sectors),
    JSON.stringify(data.key_numbers),
    JSON.stringify(data.translations),
    Date.now(),
    id,
  );
}

// ── Prompt ────────────────────────────────────────────────────────────────────
function buildPrompt(title: string, snippet: string): string {
  return `You are an expert Indian financial news analyst. Analyze this news article and return a JSON object.

IMPORTANT: The top-level "ai_summary", "summary_bullets", "sentiment", "impact_sectors", and "key_numbers" fields MUST ALL be in ENGLISH only. Only the "translations" object contains non-English text.

Title: ${title}
Content: ${snippet || title}

Return ONLY valid JSON with this exact structure, no markdown, no extra text:
{
  "ai_summary": "2-3 sentence summary in ENGLISH for Indian retail investors. Simple language, no jargon. Use ₹ for Indian currency amounts.",
  "summary_bullets": ["English key point 1", "English key point 2", "English key point 3"],
  "sentiment": "bullish",
  "impact_sectors": ["Banking", "IT"],
  "key_numbers": [{"value": "₹500 Cr", "context": "deal size"}],
  "translations": {
    "te": {"title": "Telugu title", "summary": "Telugu summary", "bullets": ["Telugu bullet 1", "Telugu bullet 2", "Telugu bullet 3"]},
    "hi": {"title": "Hindi title", "summary": "Hindi summary", "bullets": ["Hindi bullet 1", "Hindi bullet 2", "Hindi bullet 3"]},
    "ta": {"title": "Tamil title", "summary": "Tamil summary", "bullets": ["Tamil bullet 1", "Tamil bullet 2", "Tamil bullet 3"]},
    "mr": {"title": "Marathi title", "summary": "Marathi summary", "bullets": ["Marathi bullet 1", "Marathi bullet 2", "Marathi bullet 3"]},
    "bn": {"title": "Bengali title", "summary": "Bengali summary", "bullets": ["Bengali bullet 1", "Bengali bullet 2", "Bengali bullet 3"]},
    "kn": {"title": "Kannada title", "summary": "Kannada summary", "bullets": ["Kannada bullet 1", "Kannada bullet 2", "Kannada bullet 3"]}
  }
}

Rules:
- sentiment must be exactly "bullish", "bearish", or "neutral"
- key_numbers: extract important numbers from the article (prices, percentages, amounts). If none, use empty array.
- ai_summary, summary_bullets, impact_sectors, key_numbers MUST be in English. NEVER use Hindi, Telugu, or any other language for these fields.`;
}

const VALID_SENTIMENTS = ['bullish', 'bearish', 'neutral'] as const;

function parseGeminiResponse(raw: string) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const p = JSON.parse(cleaned);
  return {
    ai_summary:     typeof p.ai_summary === 'string' && p.ai_summary.length > 10 ? p.ai_summary : '',
    summary_bullets: Array.isArray(p.summary_bullets) ? p.summary_bullets : [],
    sentiment:      VALID_SENTIMENTS.includes(p.sentiment) ? p.sentiment : 'neutral',
    impact_sectors: Array.isArray(p.impact_sectors) ? p.impact_sectors : [],
    key_numbers:    Array.isArray(p.key_numbers) ? p.key_numbers : [],
    translations:   p.translations && typeof p.translations === 'object' ? p.translations : {},
  };
}

// ── Process one article ───────────────────────────────────────────────────────
async function processOne(
  article: { id: string; title: string; content_snippet: string | null },
  idx: number,
  total: number,
): Promise<boolean> {
  try {
    const raw  = await geminiCall(buildPrompt(article.title, article.content_snippet ?? ''));
    const data = parseGeminiResponse(raw);
    saveAiData(article.id, data);
    console.log(`  [${idx}/${total}] ✓  ${article.title.slice(0, 65)}`);
    return true;
  } catch (err: any) {
    console.error(`  [${idx}/${total}] ✗  ${article.title.slice(0, 55)} — ${err.message?.slice(0, 80)}`);
    return false;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const articles = getPending();
  const total    = articles.length;

  if (total === 0) {
    console.log('✅  All articles already processed — nothing to do.');
    db.close();
    return;
  }

  console.log(`\n📋  ${total} articles need AI processing`);
  console.log(`⚡  Concurrency: ${CONCURRENCY} parallel  |  ${BATCH_DELAY}ms pause between batches`);
  console.log(`🔑  ${KEYS.length} Gemini key(s) in rotation\n`);

  let done = 0, succeeded = 0, failed = 0;
  const t0 = Date.now();

  for (let i = 0; i < articles.length; i += CONCURRENCY) {
    const batch = articles.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map((a, j) => processOne(a, i + j + 1, total)),
    );

    for (const r of results) {
      done++;
      if (r.status === 'fulfilled' && r.value) succeeded++; else failed++;
    }

    // ETA
    const elapsedSec = (Date.now() - t0) / 1000;
    const rate       = done / elapsedSec;
    const etaSec     = Math.round((total - done) / rate);
    const etaStr     = `${Math.floor(etaSec / 60)}m ${etaSec % 60}s`;
    console.log(`     → ${done}/${total} | ✓ ${succeeded}  ✗ ${failed} | ETA ${etaStr}\n`);

    // Milestone banner every 30 articles
    const prevMilestone = Math.floor((done - batch.length) / 30);
    const currMilestone = Math.floor(done / 30);
    if (currMilestone > prevMilestone) {
      const pct = Math.round((done / total) * 100);
      console.log('━'.repeat(60));
      console.log(`🔔  MILESTONE: ${done} / ${total} articles done (${pct}%)`);
      console.log(`    ✓ ${succeeded} succeeded  ✗ ${failed} failed  ⏱ ${Math.floor(elapsedSec/60)}m elapsed`);
      console.log('━'.repeat(60) + '\n');
    }

    if (i + CONCURRENCY < articles.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY));
    }
  }

  const totalSec = Math.round((Date.now() - t0) / 1000);
  console.log(`\n✅  Finished — ${succeeded} succeeded, ${failed} failed`);
  console.log(`⏱   Total time: ${Math.floor(totalSec / 60)}m ${totalSec % 60}s`);
  db.close();
}

main().catch(err => {
  console.error('Fatal:', err);
  db.close();
  process.exit(1);
});
