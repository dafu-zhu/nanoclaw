#!/usr/bin/env node
/**
 * set-pool-env.mjs — Merge bot tokens from one or more JSON files into .env
 *
 * Usage:
 *   node scripts/set-pool-env.mjs bots-a.json bots-b.json
 *
 * Reads all bot token files, builds a combined ordered list (following ALL_BOTS order),
 * then updates TELEGRAM_BOT_POOL in .env and syncs to data/env/env.
 *
 * Token order matches ALL_BOTS order — important for scripts/set-bot-photos.sh
 * which references bots by position (Skirk=0, Nahida=1, etc.)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Must match create-bots.mjs order
// Only agents that need Telegram bots (leads + solos).
// Study partners and sub-team members use send_to_agent only.
const BOT_ORDER = [
  'Skirk', 'Nahida', 'Zhongli', 'Raiden', 'Alhaitham',
  'Tighnari', 'Navia', 'Diluc', 'Xiao',
  'Arlecchino', 'Keqing', 'Neuvillette',
];

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`Could not read ${file}: ${e.message}`);
    return {};
  }
}

function updateEnvFile(filePath, key, value) {
  let content = '';
  try { content = fs.readFileSync(filePath, 'utf8'); } catch {}

  const line = `${key}=${value}`;
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, line);
  } else {
    content = content.trimEnd() + '\n' + line + '\n';
  }
  fs.writeFileSync(filePath, content);
  console.log(`  Updated ${filePath}`);
}

const files = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : [path.join(__dirname, 'bot-tokens.json')];

if (!fs.existsSync(files[0])) {
  console.error(`Token file not found: ${files[0]}`);
  console.error('Run create-bots.mjs first, or pass the file path as an argument.');
  process.exit(1);
}

// Merge all token files
const allTokens = {};
for (const file of files) {
  Object.assign(allTokens, loadJson(file));
}

// Build ordered token list
const ordered = [];
const missing = [];
for (const name of BOT_ORDER) {
  if (allTokens[name]) {
    ordered.push(allTokens[name]);
  } else {
    missing.push(name);
    console.warn(`  ⚠ Missing token for: ${name}`);
  }
}

if (ordered.length === 0) {
  console.error('No tokens found. Nothing to do.');
  process.exit(1);
}

const poolValue = ordered.join(',');
console.log(`\nBuilding TELEGRAM_BOT_POOL with ${ordered.length} tokens (${missing.length} missing):`);
BOT_ORDER.forEach((name, i) => {
  const tok = allTokens[name];
  console.log(`  ${String(i).padStart(2)}  ${name.padEnd(18)} ${tok ? tok.slice(0, 14) + '...' : '(missing)'}`);
});

// Update .env
const envPath = path.join(ROOT, '.env');
updateEnvFile(envPath, 'TELEGRAM_BOT_POOL', poolValue);

// Sync to data/env/env
const dataEnvPath = path.join(ROOT, 'data', 'env', 'env');
if (fs.existsSync(dataEnvPath)) {
  updateEnvFile(dataEnvPath, 'TELEGRAM_BOT_POOL', poolValue);
} else {
  console.log(`  (data/env/env not found — skip)`);
}

console.log(`\nDone. ${ordered.length} tokens set in TELEGRAM_BOT_POOL.`);
console.log('\nNext steps:');
console.log('  1. Add all bots to your Telegram group "Teyvat LLC"');
console.log('  2. systemctl --user restart nanoclaw');
console.log('  3. node scripts/set-bot-photos.sh  # set character photos');
