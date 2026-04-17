/**
 * Certificate Generator — Market Samachar Certified
 * A4 landscape canvas (1754 × 1240 px) rendered to a downloadable PDF.
 * Uses jsPDF for PDF output. QR code is supplied as a data URL from the server.
 */

import { BRAND_HOST } from './config';

export interface CertificateData {
  id:          string;   // MS-2026-XXXXX
  user_name:   string;
  iq_score:    number;
  iq_title:    string;
  iq_emoji:    string;
  streak_days: number;
  issued_at:   string;   // ISO string
  qr_data_url: string;   // PNG data URL (generated server-side)
  verify_url:  string;
}

// ─── Canvas dimensions (A4 landscape @ ~150 DPI) ─────────────────────────────
const W = 1754;
const H = 1240;
const GOLD   = '#ffcc44';
const GOLD_D = '#c8920a';  // darker gold for gradients
const BG     = '#07070e';
const CARD   = '#0d0d1a';
const DIM    = '#1e1e2e';

// ─── Font helpers ─────────────────────────────────────────────────────────────

async function loadFonts() {
  await Promise.allSettled([
    document.fonts.load('700 72px "DM Sans"'),
    document.fonts.load('400 22px "DM Sans"'),
    document.fonts.load('italic 400 20px "DM Sans"'),
    document.fonts.load('700 56px "DM Mono"'),
    document.fonts.load('400 18px "DM Mono"'),
  ]);
}

function mono(size: number, weight = 400) {
  return `${weight} ${size}px "DM Mono", monospace`;
}
function sans(size: number, weight = 400, style = 'normal') {
  return `${style} ${weight} ${size}px "DM Sans", sans-serif`;
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────

/** Subtle circuit-board trace pattern as background texture. */
function drawCircuitPattern(ctx: CanvasRenderingContext2D) {
  const STEP = 72;
  ctx.lineWidth   = 1;
  ctx.strokeStyle = '#0d0d20';
  ctx.fillStyle   = '#0d0d20';

  for (let gx = STEP; gx < W; gx += STEP) {
    for (let gy = STEP; gy < H; gy += STEP) {
      // Deterministic L-trace direction based on grid position
      const dir = ((gx / STEP) + (gy / STEP)) % 4;
      ctx.beginPath();
      if (dir === 0) {
        ctx.moveTo(gx, gy); ctx.lineTo(gx + STEP / 2, gy); ctx.lineTo(gx + STEP / 2, gy + STEP / 2);
      } else if (dir === 1) {
        ctx.moveTo(gx, gy); ctx.lineTo(gx, gy + STEP / 2); ctx.lineTo(gx - STEP / 2, gy + STEP / 2);
      } else if (dir === 2) {
        ctx.moveTo(gx, gy); ctx.lineTo(gx - STEP / 2, gy); ctx.lineTo(gx - STEP / 2, gy - STEP / 2);
      } else {
        ctx.moveTo(gx, gy); ctx.lineTo(gx + STEP / 2, gy); ctx.lineTo(gx + STEP / 2, gy - STEP / 2);
      }
      ctx.stroke();
      // Junction dot
      ctx.beginPath();
      ctx.arc(gx, gy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Gold corner ornament — L-bracket + diamond at each corner. */
function drawCorner(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  dirX: 1 | -1, dirY: 1 | -1,
  armLen = 80,
) {
  const grad = ctx.createLinearGradient(x, y, x + dirX * armLen, y + dirY * armLen);
  grad.addColorStop(0, GOLD);
  grad.addColorStop(1, GOLD_D);
  ctx.strokeStyle = grad;
  ctx.lineWidth   = 3;
  ctx.lineCap     = 'round';

  // L-bracket
  ctx.beginPath();
  ctx.moveTo(x + dirX * armLen, y);
  ctx.lineTo(x, y);
  ctx.lineTo(x, y + dirY * armLen);
  ctx.stroke();

  // Diamond ornament at corner tip
  const d = 10;
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.moveTo(x,     y - d * dirY);
  ctx.lineTo(x + d * dirX, y);
  ctx.lineTo(x,     y + d * dirY);
  ctx.lineTo(x - d * dirX, y);
  ctx.closePath();
  ctx.fill();

  // Small square mid-arm markers
  const sq = 5;
  const mid = armLen * 0.55;
  ctx.fillStyle = GOLD + '80';
  [[x + dirX * mid, y], [x, y + dirY * mid]].forEach(([px, py]) => {
    ctx.fillRect(px - sq / 2, py - sq / 2, sq, sq);
  });
}

/** Thin horizontal rule with optional gold glow. */
function drawRule(ctx: CanvasRenderingContext2D, y: number, PAD: number, gold = false) {
  const grad = ctx.createLinearGradient(PAD, 0, W - PAD, 0);
  if (gold) {
    grad.addColorStop(0,   'transparent');
    grad.addColorStop(0.3, GOLD + '80');
    grad.addColorStop(0.7, GOLD + '80');
    grad.addColorStop(1,   'transparent');
  } else {
    grad.addColorStop(0,   'transparent');
    grad.addColorStop(0.3, DIM);
    grad.addColorStop(0.7, DIM);
    grad.addColorStop(1,   'transparent');
  }
  ctx.strokeStyle = grad;
  ctx.lineWidth   = gold ? 2 : 1;
  ctx.beginPath();
  ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y);
  ctx.stroke();
}

/** Centered text with optional glow. */
function centeredText(
  ctx: CanvasRenderingContext2D,
  text: string, y: number,
  color: string, font: string,
  glow?: string,
) {
  ctx.font      = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  if (glow) {
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur  = 30;
    ctx.fillText(text, W / 2, y);
    ctx.restore();
  } else {
    ctx.fillText(text, W / 2, y);
  }
}

// ─── Main generator ───────────────────────────────────────────────────────────

export async function generateCertificateCanvas(data: CertificateData): Promise<HTMLCanvasElement> {
  await loadFonts();

  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const PAD    = 72;    // content horizontal padding
  const BORDER = 28;    // border inset from edge

  // ── Background ──────────────────────────────────────────────────────────────
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // Radial center glow (warm amber, very subtle)
  const radGlow = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 700);
  radGlow.addColorStop(0, '#ffcc4408');
  radGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = radGlow;
  ctx.fillRect(0, 0, W, H);

  // Circuit pattern
  drawCircuitPattern(ctx);

  // ── Gold border ─────────────────────────────────────────────────────────────
  // Outer border
  const borderGrad = ctx.createLinearGradient(0, 0, W, H);
  borderGrad.addColorStop(0,   GOLD_D);
  borderGrad.addColorStop(0.5, GOLD);
  borderGrad.addColorStop(1,   GOLD_D);
  ctx.strokeStyle = borderGrad;
  ctx.lineWidth   = 4;
  ctx.strokeRect(BORDER, BORDER, W - BORDER * 2, H - BORDER * 2);

  // Inner hairline border
  ctx.strokeStyle = GOLD + '30';
  ctx.lineWidth   = 1;
  ctx.strokeRect(BORDER + 10, BORDER + 10, W - (BORDER + 10) * 2, H - (BORDER + 10) * 2);

  // ── Corner ornaments ────────────────────────────────────────────────────────
  const CO = BORDER;
  drawCorner(ctx, CO, CO,       +1, +1);
  drawCorner(ctx, W - CO, CO,   -1, +1);
  drawCorner(ctx, CO, H - CO,   +1, -1);
  drawCorner(ctx, W - CO, H - CO, -1, -1);

  // ── Logo / header ────────────────────────────────────────────────────────────
  const LOGO_Y = 108;

  // Green pulse dot
  ctx.save();
  ctx.shadowColor = '#00ff88';
  ctx.shadowBlur  = 16;
  ctx.fillStyle = '#00ff88';
  ctx.beginPath();
  ctx.arc(W / 2 - 128, LOGO_Y - 8, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  centeredText(ctx, 'MARKET SAMACHAR', LOGO_Y, '#e8eaf0', mono(28, 700));
  centeredText(ctx, BRAND_HOST, LOGO_Y + 28, '#334466', mono(15));

  drawRule(ctx, LOGO_Y + 52, PAD, true);

  // ── Certificate title ────────────────────────────────────────────────────────
  centeredText(ctx, 'MARKET SAMACHAR CERTIFIED', LOGO_Y + 112,
    GOLD, mono(52, 700), GOLD + '60');

  centeredText(ctx, 'Market Quiz — 30 Day Challenge', LOGO_Y + 164,
    '#8899aa', sans(22));

  drawRule(ctx, LOGO_Y + 192, PAD + 120);

  // ── "This certifies that" ────────────────────────────────────────────────────
  centeredText(ctx, 'This certifies that', LOGO_Y + 244, '#556688', sans(20, 400, 'italic'));

  // ── User name ────────────────────────────────────────────────────────────────
  // Gold glow behind name
  const nameGlow = ctx.createRadialGradient(W / 2, LOGO_Y + 340, 0, W / 2, LOGO_Y + 340, 300);
  nameGlow.addColorStop(0, '#ffcc4415');
  nameGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = nameGlow;
  ctx.fillRect(0, LOGO_Y + 260, W, 120);

  // Measure name to scale down if too long
  const nameFont = sans(72, 700);
  ctx.font       = nameFont;
  const nameMetrics = ctx.measureText(data.user_name);
  const maxNameW = W - PAD * 3;
  if (nameMetrics.width > maxNameW) {
    const scale = maxNameW / nameMetrics.width;
    ctx.save();
    ctx.translate(W / 2, LOGO_Y + 340);
    ctx.scale(scale, 1);
    ctx.font      = nameFont;
    ctx.fillStyle = GOLD;
    ctx.textAlign = 'center';
    ctx.shadowColor = GOLD;
    ctx.shadowBlur  = 24;
    ctx.fillText(data.user_name, 0, 0);
    ctx.restore();
  } else {
    centeredText(ctx, data.user_name, LOGO_Y + 340, GOLD, nameFont, GOLD + '50');
  }

  // ── Descriptive lines ────────────────────────────────────────────────────────
  centeredText(ctx, 'has demonstrated consistent market knowledge',
    LOGO_Y + 400, '#8899aa', sans(20));
  centeredText(ctx,
    `with an Investor IQ of ${data.iq_score} — ${data.iq_title} ${data.iq_emoji}`,
    LOGO_Y + 438, '#e8eaf0', mono(22));

  // ── 30-day streak badge ───────────────────────────────────────────────────────
  const BADGE_W = 220, BADGE_H = 36, BADGE_X = W / 2 - BADGE_W / 2, BADGE_Y = LOGO_Y + 460;
  ctx.beginPath();
  ctx.roundRect(BADGE_X, BADGE_Y, BADGE_W, BADGE_H, 18);
  ctx.fillStyle = '#ff9f3b18';
  ctx.fill();
  ctx.strokeStyle = '#ff9f3b40';
  ctx.lineWidth   = 1;
  ctx.stroke();
  ctx.font        = mono(17);
  ctx.fillStyle   = '#ff9f3b';
  ctx.textAlign   = 'center';
  ctx.fillText(`🔥 ${data.streak_days}-day consecutive streak`, W / 2, BADGE_Y + 24);

  drawRule(ctx, LOGO_Y + 524, PAD + 60, true);

  // ── Footer: date / cert ID / QR ──────────────────────────────────────────────
  const FOOTER_Y = LOGO_Y + 564;
  const issueDate = new Date(data.issued_at).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  // Left block: date
  ctx.font      = mono(13);
  ctx.fillStyle = '#334466';
  ctx.textAlign = 'left';
  ctx.fillText('ISSUED ON', PAD + 10, FOOTER_Y);
  ctx.font      = mono(18, 500);
  ctx.fillStyle = '#8899aa';
  ctx.fillText(issueDate, PAD + 10, FOOTER_Y + 24);

  // Center block: cert ID
  ctx.font      = mono(13);
  ctx.fillStyle = '#334466';
  ctx.textAlign = 'center';
  ctx.fillText('CERTIFICATE ID', W / 2, FOOTER_Y);
  ctx.font      = mono(20, 700);
  ctx.fillStyle = GOLD;
  ctx.textAlign = 'center';
  ctx.shadowColor = GOLD;
  ctx.shadowBlur  = 12;
  ctx.fillText(data.id, W / 2, FOOTER_Y + 26);
  ctx.shadowBlur  = 0;

  // Right block: QR code
  const QR_SIZE = 110;
  const QR_X    = W - PAD - QR_SIZE - 10;
  const QR_Y    = FOOTER_Y - 26;

  ctx.font      = mono(11);
  ctx.fillStyle = '#334466';
  ctx.textAlign = 'right';
  ctx.fillText('SCAN TO VERIFY', W - PAD - 10, FOOTER_Y);

  // Load QR code image
  await new Promise<void>(resolve => {
    const qrImg = new Image();
    qrImg.onload  = () => {
      // Gold border behind QR
      ctx.strokeStyle = GOLD + '40';
      ctx.lineWidth   = 1;
      ctx.strokeRect(QR_X - 4, QR_Y + 8, QR_SIZE + 8, QR_SIZE + 8);
      ctx.drawImage(qrImg, QR_X, QR_Y + 12, QR_SIZE, QR_SIZE);
      resolve();
    };
    qrImg.onerror = () => resolve();
    qrImg.src = data.qr_data_url;
  });

  // ── Bottom watermark ──────────────────────────────────────────────────────────
  ctx.font      = mono(13);
  ctx.fillStyle = '#1e1e2e';
  ctx.textAlign = 'center';
  ctx.fillText(`Verify at ${BRAND_HOST}/certificate/verify/${data.id}`, W / 2, H - 38);

  return canvas;
}

// ─── PDF export ───────────────────────────────────────────────────────────────

export async function downloadCertificatePDF(data: CertificateData): Promise<void> {
  const canvas  = await generateCertificateCanvas(data);
  const imgData = canvas.toDataURL('image/jpeg', 0.95);

  // Dynamic import to lazy-load jsPDF (~300 KB)
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  // A4 landscape: 297 × 210 mm
  pdf.addImage(imgData, 'JPEG', 0, 0, 297, 210);
  pdf.save(`Market-Samachar-Certificate-${data.id}.pdf`);
}

/** Returns a PNG data URL of the certificate (for preview img tag). */
export async function getCertificatePreviewUrl(data: CertificateData): Promise<string> {
  const canvas = await generateCertificateCanvas(data);
  return canvas.toDataURL('image/png');
}
