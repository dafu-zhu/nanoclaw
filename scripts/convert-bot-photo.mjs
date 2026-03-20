#!/usr/bin/env node
// Converts a character icon to a 512x512 JPEG with a rarity background color.
// Usage: node scripts/convert-bot-photo.mjs <input> <output> [rarity]
//   rarity: "5" (gold) | "4" (purple) | "3" (blue) — default: "5"
import { createRequire } from 'module';
import { statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const sharp = require(join(__dirname, '..', 'node_modules', 'sharp'));

const [input, output, rarityStr] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node convert-bot-photo.mjs <input> <output> [rarity]');
  process.exit(1);
}

// Genshin rarity background colors
const RARITY_BG = {
  '5': { r: 0xA6, g: 0x76, b: 0x41 },  // 5-star gold   #A67641
  '4': { r: 0x7B, g: 0x61, b: 0xA3 },  // 4-star purple #7B61A3
  '3': { r: 58,   g: 105,  b: 186  },  // 3-star blue
};
const rarity = rarityStr || '5';
const bg = RARITY_BG[rarity] ?? RARITY_BG['5'];

const SIZE = 512;
const meta = await sharp(input).metadata();

await sharp(input)
  .resize(SIZE, SIZE, { fit: 'contain', background: { ...bg, alpha: 0 } })
  .flatten({ background: bg })
  .jpeg({ quality: 92 })
  .toFile(output);

const bytes = statSync(output).size;
process.stdout.write(`${meta.width}x${meta.height} → ${SIZE}x${SIZE} JPEG (${bytes} bytes, ${rarity}★ bg)`);
