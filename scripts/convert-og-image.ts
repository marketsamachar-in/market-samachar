/**
 * Convert OG image from SVG to PNG at 1200x630
 *
 * Usage: npx tsx scripts/convert-og-image.ts
 *
 * Reads:  public/ms-og-1200x630.svg
 * Writes: public/ms-og-1200x630.png
 */

import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const SVG_PATH = join(ROOT, 'public', 'ms-og-1200x630.svg');
const PNG_PATH = join(ROOT, 'public', 'ms-og-1200x630.png');

async function convert() {
  const svgBuffer = readFileSync(SVG_PATH);

  await sharp(svgBuffer, { density: 150 })
    .resize(1200, 630)
    .png({ quality: 90, compressionLevel: 9 })
    .toFile(PNG_PATH);

  console.log(`✔ Converted OG image: ${PNG_PATH}`);
}

convert().catch((err) => {
  console.error('Failed to convert OG image:', err);
  process.exit(1);
});
