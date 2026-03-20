#!/usr/bin/env node
/**
 * rename-bots.mjs — Set display name for all bots via Telegram Bot API setMyName
 *
 * Reads name→token pairs from bot-tokens.json and calls setMyName for each.
 * No user authentication needed — works directly with bot tokens.
 *
 * Usage:
 *   node scripts/rename-bots.mjs
 *   node scripts/rename-bots.mjs --dry-run   # preview only, no API calls
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKENS_FILE = path.join(__dirname, 'bot-tokens.json');
const DRY_RUN = process.argv.includes('--dry-run');

async function setName(token, name) {
  const url = `https://api.telegram.org/bot${token}/setMyName`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return res.json();
}

async function main() {
  if (!fs.existsSync(TOKENS_FILE)) {
    console.error(`Not found: ${TOKENS_FILE}`);
    process.exit(1);
  }

  const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
  const entries = Object.entries(tokens);

  if (entries.length === 0) {
    console.log('No bots in bot-tokens.json.');
    process.exit(0);
  }

  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Renaming ${entries.length} bots...\n`);

  for (const [name, token] of entries) {
    if (DRY_RUN) {
      console.log(`  would rename ${token.slice(0, 12)}... → "${name}"`);
      continue;
    }

    process.stdout.write(`  ${name.padEnd(18)}`);
    try {
      const result = await setName(token, name);
      if (result.ok) {
        console.log('✓');
      } else {
        console.log(`✗  ${result.description}`);
      }
    } catch (err) {
      console.log(`✗  ${err.message}`);
    }

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\nDone. Display names will appear in Telegram @ autocomplete.');
  console.log('Note: Telegram may take a few minutes to propagate the changes.');
}

main();
