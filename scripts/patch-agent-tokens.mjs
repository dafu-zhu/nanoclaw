#!/usr/bin/env node
/**
 * patch-agent-tokens.mjs — Inject bot tokens + shared_group_jid into registered_groups
 *
 * Run this after create-bots.mjs has created tokens for new agents.
 * Reads bot-tokens.json, finds matching agents in the DB (by name), and patches:
 *   - container_config.poolBotToken
 *   - shared_group_jid (auto-detected from working agents, or --group to override)
 *
 * Usage:
 *   node scripts/patch-agent-tokens.mjs
 *   node scripts/patch-agent-tokens.mjs --group tg:-1234567890   # override group JID
 *   node scripts/patch-agent-tokens.mjs --dry-run                # preview only
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const groupOverride = (() => { const i = args.indexOf('--group'); return i !== -1 ? args[i + 1] : null; })();

const DB_PATH = path.join(ROOT, 'store', 'messages.db');
const TOKENS_FILE = path.join(__dirname, 'bot-tokens.json');

if (!fs.existsSync(TOKENS_FILE)) {
  console.error(`Token file not found: ${TOKENS_FILE}`);
  console.error('Run create-bots.mjs first.');
  process.exit(1);
}

const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
const db = new Database(DB_PATH);

// Auto-detect shared group JID from an existing working agent
const sharedGroupJid = groupOverride ?? (() => {
  const row = db.prepare(
    "SELECT shared_group_jid FROM registered_groups WHERE shared_group_jid IS NOT NULL AND jid LIKE 'virtual:%' LIMIT 1"
  ).get();
  return row?.shared_group_jid ?? null;
})();

if (!sharedGroupJid) {
  console.error('Could not detect shared_group_jid. Pass --group tg:-XXXXXXXXXX explicitly.');
  process.exit(1);
}
console.log(`Using shared_group_jid: ${sharedGroupJid}`);
if (dryRun) console.log('(dry-run mode — no changes will be written)\n');

const agents = db.prepare('SELECT jid, name, folder, container_config FROM registered_groups').all();

let patched = 0;
let skipped = 0;

for (const agent of agents) {
  const token = tokens[agent.name];
  if (!token) {
    // No token for this agent in the JSON file — skip silently
    continue;
  }

  const cc = agent.container_config ? JSON.parse(agent.container_config) : {};
  if (cc.poolBotToken === token) {
    console.log(`  = ${agent.name.padEnd(18)} already up to date`);
    skipped++;
    continue;
  }

  cc.poolBotToken = token;
  const newCc = JSON.stringify(cc);

  console.log(`  + ${agent.name.padEnd(18)} token: ${token.slice(0, 12)}...  group: ${sharedGroupJid}`);

  if (!dryRun) {
    db.prepare(
      'UPDATE registered_groups SET container_config = ?, shared_group_jid = ? WHERE jid = ?'
    ).run(newCc, sharedGroupJid, agent.jid);
  }
  patched++;
}

console.log(`\nDone. Patched: ${patched}, Already current: ${skipped}.`);
if (patched > 0 && !dryRun) {
  console.log('\nNext steps:');
  console.log('  1. Add new bots to Teyvat LLC Telegram group');
  console.log('  2. systemctl --user restart nanoclaw');
}
