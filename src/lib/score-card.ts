/**
 * Score Card Generator — 1080×1080px PNG for social sharing.
 * Renders to an off-screen canvas and returns a base64 data URL.
 * Browser-only (uses document.createElement + Canvas 2D API).
 */

import { BRAND_HOST } from './config';

export interface ScoreCardParams {
  score:       number;
  total:       number;
  streak:      number;
  iq:          number;
  title:       string;
  titleEmoji:  string;
  username?:   string;
  date:        string;   // e.g. "30 March 2026"
}

// ─── Font helpers ─────────────────────────────────────────────────────────────

async function ensureFonts() {
  await Promise.allSettled([
    document.fonts.load('700 220px "DM Mono"'),
    document.fonts.load('700 48px "DM Mono"'),
    document.fonts.load('500 32px "DM Mono"'),
    document.fonts.load('400 24px "DM Mono"'),
    document.fonts.load('700 36px "DM Sans"'),
    document.fonts.load('400 28px "DM Sans"'),
  ]);
}

function mono(size: number, weight = 400): string {
  return `${weight} ${size}px "DM Mono", monospace`;
}
function sans(size: number, weight = 400): string {
  return `${weight} ${size}px "DM Sans", sans-serif`;
}

/** Rounded rectangle path helper. */
function rrect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Draw centred text that glows. */
function glowText(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number,
  color: string, blur: number,
) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur  = blur;
  ctx.fillStyle   = color;
  ctx.fillText(text, x, y);
  // Second pass for extra intensity
  ctx.shadowBlur  = blur * 0.5;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ─── Main generator ───────────────────────────────────────────────────────────

export async function generateScoreCard(p: ScoreCardParams): Promise<string> {
  await ensureFonts();

  const W = 1080, H = 1080;
  const PAD = 72;
  const GREEN  = '#00ff88';
  const BG     = '#07070e';
  const CARD   = '#0d0d1e';
  const MUTED  = '#334466';
  const TEXT   = '#e8eaf0';

  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // ── 1. Background ─────────────────────────────────────────────────────────
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // ── 2. Green grid lines ────────────────────────────────────────────────────
  const GRID_STEP = 72;
  ctx.strokeStyle = '#00ff8808';
  ctx.lineWidth   = 1;
  for (let gx = 0; gx <= W; gx += GRID_STEP) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, H);
    ctx.stroke();
  }
  for (let gy = 0; gy <= H; gy += GRID_STEP) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(W, gy);
    ctx.stroke();
  }

  // ── 3. Corner particle clusters ────────────────────────────────────────────
  const particles: [number, number, number, number][] = [
    // [x, y, radius, alpha]
    // Top-left
    [40,  40,  3, 0.8], [68,  32,  2, 0.5], [28,  68,  2, 0.4],
    [80,  60,  1.5, 0.3], [52, 80,  1.5, 0.3], [96, 44, 1, 0.2],
    // Top-right
    [W-40,  40,  3, 0.8], [W-68, 32,  2, 0.5], [W-28,  68,  2, 0.4],
    [W-80,  60,  1.5, 0.3], [W-52,  80, 1.5, 0.3], [W-96, 44, 1, 0.2],
    // Bottom-left
    [40,  H-40, 3, 0.8], [68,  H-32, 2, 0.5], [28,  H-68, 2, 0.4],
    [80,  H-60, 1.5, 0.3], [52, H-80, 1.5, 0.3], [96, H-44, 1, 0.2],
    // Bottom-right
    [W-40, H-40, 3, 0.8], [W-68, H-32, 2, 0.5], [W-28, H-68, 2, 0.4],
    [W-80, H-60, 1.5, 0.3], [W-52, H-80, 1.5, 0.3], [W-96, H-44, 1, 0.2],
  ];
  for (const [px, py, pr, pa] of particles) {
    ctx.save();
    ctx.globalAlpha = pa;
    ctx.shadowColor = GREEN;
    ctx.shadowBlur  = 6;
    ctx.fillStyle   = GREEN;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── 4. Radial glow behind score (centre) ──────────────────────────────────
  const cGlow = ctx.createRadialGradient(W / 2, H * 0.44, 0, W / 2, H * 0.44, 340);
  cGlow.addColorStop(0, '#00ff8812');
  cGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = cGlow;
  ctx.fillRect(0, 0, W, H);

  // ── 5. Top accent bar ─────────────────────────────────────────────────────
  const topBar = ctx.createLinearGradient(0, 0, W, 0);
  topBar.addColorStop(0,   'transparent');
  topBar.addColorStop(0.15, GREEN);
  topBar.addColorStop(0.85, GREEN);
  topBar.addColorStop(1,   'transparent');
  ctx.fillStyle = topBar;
  ctx.fillRect(0, 0, W, 4);

  // ── 6. Logo row ────────────────────────────────────────────────────────────
  const LOGO_Y = 100;

  // Live dot
  ctx.save();
  ctx.shadowColor = GREEN;
  ctx.shadowBlur  = 14;
  ctx.fillStyle   = GREEN;
  ctx.beginPath();
  ctx.arc(PAD + 10, LOGO_Y - 8, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Brand name
  ctx.font      = sans(32, 700);
  ctx.fillStyle = TEXT;
  ctx.textAlign = 'left';
  ctx.fillText('MARKET SAMACHAR', PAD + 28, LOGO_Y);

  // Domain
  ctx.font      = mono(18);
  ctx.fillStyle = MUTED;
  ctx.fillText(BRAND_HOST, PAD + 28, LOGO_Y + 30);

  // Date — top right
  ctx.font      = mono(18);
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'right';
  ctx.fillText(p.date, W - PAD, LOGO_Y);

  // ── 7. Horizontal rule ────────────────────────────────────────────────────
  const HR_Y1 = LOGO_Y + 58;
  ctx.strokeStyle = '#1e1e2e';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, HR_Y1);
  ctx.lineTo(W - PAD, HR_Y1);
  ctx.stroke();

  // ── 8. Score colour ────────────────────────────────────────────────────────
  const scoreColor =
    p.score === p.total ? GREEN :
    p.score >= p.total * 0.8 ? GREEN :
    p.score >= p.total * 0.6 ? '#ffdd3b' : '#ff4466';

  // ── 9. Giant score ────────────────────────────────────────────────────────
  const SCORE_Y = 430;
  ctx.font      = mono(200, 700);
  ctx.textAlign = 'center';
  glowText(ctx, `${p.score}/${p.total}`, W / 2, SCORE_Y, scoreColor, 80);

  // ── 10. Score label ───────────────────────────────────────────────────────
  const label = [
    'Keep Going! 📈', 'Keep Going! 📈', 'Good Work! ✅',
    'Great Score! ✅', 'Excellent! ⚡', 'Perfect! 🎯',
  ][p.score] ?? '✅';
  ctx.font      = mono(28, 500);
  ctx.fillStyle = scoreColor + 'cc';
  ctx.textAlign = 'center';
  ctx.fillText(label, W / 2, SCORE_Y + 52);

  // ── 11. Streak line ────────────────────────────────────────────────────────
  ctx.font      = sans(36, 400);
  ctx.fillStyle = '#ff9f3b';
  ctx.textAlign = 'center';
  ctx.fillText(`🔥 ${p.streak}-day streak`, W / 2, SCORE_Y + 130);

  // ── 12. IQ + title line ───────────────────────────────────────────────────
  const iqText = `Investor IQ: ${p.iq}  —  ${p.titleEmoji} ${p.title}`;
  ctx.font      = mono(26, 400);
  ctx.fillStyle = '#3b9eff';
  ctx.textAlign = 'center';
  ctx.fillText(iqText, W / 2, SCORE_Y + 186);

  // ── 13. Horizontal rule ───────────────────────────────────────────────────
  const HR_Y2 = SCORE_Y + 230;
  ctx.strokeStyle = '#1e1e2e';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, HR_Y2);
  ctx.lineTo(W - PAD, HR_Y2);
  ctx.stroke();

  // ── 14. CTA block ─────────────────────────────────────────────────────────
  const CTA_Y = HR_Y2 + 80;
  ctx.font      = sans(30, 400);
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'center';
  ctx.fillText('Can you beat me? Play free →', W / 2, CTA_Y);

  glowText(ctx, BRAND_HOST, W / 2, CTA_Y + 52, GREEN, 28);
  ctx.font      = mono(30, 700);
  ctx.textAlign = 'center';

  // Arrow accent under domain
  ctx.font      = mono(18);
  ctx.fillStyle = GREEN + '50';
  ctx.fillText('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', W / 2, CTA_Y + 86);

  // ── 15. Footer ────────────────────────────────────────────────────────────
  const FOOTER_Y = H - 56;

  if (p.username) {
    ctx.font      = mono(20);
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'left';
    ctx.fillText(`@${p.username}`, PAD, FOOTER_Y);
  }

  ctx.font      = mono(20);
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'right';
  ctx.fillText('Market Quiz · Daily Challenge', W - PAD, FOOTER_Y);

  // ── 16. Bottom accent bar ─────────────────────────────────────────────────
  const bottomBar = ctx.createLinearGradient(0, 0, W, 0);
  bottomBar.addColorStop(0,    'transparent');
  bottomBar.addColorStop(0.15, GREEN);
  bottomBar.addColorStop(0.85, GREEN);
  bottomBar.addColorStop(1,    'transparent');
  ctx.fillStyle = bottomBar;
  ctx.fillRect(0, H - 4, W, 4);

  return canvas.toDataURL('image/png');
}

// ─── Share helpers ────────────────────────────────────────────────────────────

export function buildShareText(
  p: Pick<ScoreCardParams, 'score' | 'total' | 'streak' | 'iq' | 'title'>,
): string {
  return (
    `I scored ${p.score}/${p.total} on Market Quiz! 🧠📈\n` +
    `🔥 ${p.streak}-day streak  ⚡ IQ: ${p.iq} — ${p.title}\n` +
    `Can you beat me? Play free at ${BRAND_HOST}`
  );
}

export function shareWhatsApp(text: string) {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

export function shareTwitter(text: string) {
  window.open(
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
    '_blank', 'noopener',
  );
}

export function downloadCard(dataUrl: string, filename = 'market-quiz-score.png') {
  const a = document.createElement('a');
  a.href     = dataUrl;
  a.download = filename;
  a.click();
}
