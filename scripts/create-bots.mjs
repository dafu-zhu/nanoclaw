#!/usr/bin/env node
/**
 * create-bots.mjs — Automate Telegram bot creation via BotFather (GramJS/MTProto)
 *
 * Usage:
 *   node scripts/create-bots.mjs --phone +1xxxxxxxx
 *
 * Tokens are saved to scripts/bot-tokens.json as { botName: "token", ... }.
 * Session is saved to scripts/session.json and reused (no re-login needed).
 *
 * Rate limit: BotFather throttles after ~10 bots per account per hour.
 * Run the script, let it create 10 bots, then stop (Ctrl+C). Wait ~1 hour.
 * Re-run the same command — it skips already-created bots and picks up where it left off.
 * 3 runs × 8-9 bots = all 24 bots across ~3 hours of waiting.
 *
 * Credentials: Set TELEGRAM_API_ID and TELEGRAM_API_HASH in env (or .env file).
 * Get them from https://my.telegram.org/apps
 */

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DELAY_BETWEEN_BOTS = 120_000; // ms between bot creation requests (2min — safe buffer)
const BOTFATHER = 'BotFather';

// All 24 agent bots — split into two halves for two accounts.
// Account A (main): bots-a.json  — indices 0..11
// Account B (+86):  bots-b.json  — indices 12..23
// Username format: nanoclaw_{name}_bot (must be unique globally — adjust if taken)
// Rule: solo agents get bots, lead TAs get bots, research leads get bots.
// Study partners and non-lead research members communicate via send_to_agent only — no bot needed.
const ALL_BOTS = [
  // Solo agents (5)
  { name: 'Skirk',      username: 'nanoclaw_skirk_bot' },
  { name: 'Nahida',     username: 'nanoclaw_nahida_bot' },
  { name: 'Zhongli',    username: 'nanoclaw_zhongli_bot' },
  { name: 'Raiden',     username: 'nanoclaw_raiden_bot' },
  { name: 'Alhaitham',  username: 'nanoclaw_alhaitham_bot' },

  // Lead TAs only (4)
  { name: 'Tighnari',   username: 'nanoclaw_tighnari_bot' },   // STAT 31511
  { name: 'Navia',      username: 'nanoclaw_navia_bot' },      // FINM 34700
  { name: 'Diluc',      username: 'nanoclaw_diluc_bot' },      // FINM 32000
  { name: 'Xiao',       username: 'nanoclaw_xiao_uc_bot' },    // FINM 32700 (nanoclaw_xiao_bot taken)

  // Research leads only (3)
  { name: 'Arlecchino', username: 'nanoclaw_arlecchino_bot' }, // Fatui — LLM + Alpha
  { name: 'Keqing',     username: 'nanoclaw_keqing_bot' },     // Liyue Qixing — Derivatives
  { name: 'Neuvillette', username: 'nanoclaw_neuvillette_bot' },// Court of Fontaine — Alpha-lab infra

  // Solo agents (additional)
  { name: 'Lisa',       username: 'nanoclaw_lisa_bot' },       // Learning Tracker
  { name: 'Cyno',       username: 'nanoclaw_cyno_bot' },       // Statistics & Inference Companion
];

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : null;
  };
  return {
    phone:       get('--phone')   || process.env.PHONE,
    sessionFile: get('--session') || path.join(__dirname, 'session.json'),
    botsFile:    get('--bots')    || path.join(__dirname, 'bot-tokens.json'),
    startIdx:    parseInt(get('--start') || '0', 10),
    endIdx:      parseInt(get('--end')   || String(ALL_BOTS.length - 1), 10),
    listOnly:    args.includes('--list'),
  };
}

// ---------------------------------------------------------------------------
// Session persistence (StringSession ↔ JSON file)
// ---------------------------------------------------------------------------

function loadSession(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return new StringSession(data.session || '');
  } catch {
    return new StringSession('');
  }
}

function saveSession(file, client) {
  const session = client.session.save();
  fs.writeFileSync(file, JSON.stringify({ session }, null, 2));
  console.log(`  ✓ Session saved to ${file}`);
}

// ---------------------------------------------------------------------------
// Bot token output file
// ---------------------------------------------------------------------------

function loadTokens(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function saveTokens(file, tokens) {
  fs.writeFileSync(file, JSON.stringify(tokens, null, 2));
}

// ---------------------------------------------------------------------------
// Readline helper for auth prompts
// ---------------------------------------------------------------------------

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

// ---------------------------------------------------------------------------
// BotFather conversation
// ---------------------------------------------------------------------------

/**
 * Create one bot via BotFather. Returns the token string or null on failure.
 *
 * Conversation flow:
 *   We → /newbot
 *   BF → "Alright, a new bot. How are you going to call it?"
 *   We → {display name}
 *   BF → "Good. Now let's choose a username..."
 *   We → {username}
 *   BF → "Done! ... token: xxxxxxxx:yyyy..." (or an error)
 */
// Sentinel returned when BotFather is rate-limiting — signals the main loop to stop
const RATE_LIMITED = Symbol('RATE_LIMITED');

/**
 * Parse BotFather "try again in X seconds" message.
 * Returns seconds to wait, or null if not a rate-limit message.
 */
function parseRateLimit(text) {
  const m = text.match(/try again in (\d+) second/i);
  return m ? parseInt(m[1], 10) : null;
}

async function createBot(client, displayName, username) {
  return new Promise(async (resolve) => {
    let step = 0;

    const handler = async (event) => {
      const msg = event.message;
      if (!msg || !msg.peerId) return;

      // Only listen to messages from BotFather
      const entity = await client.getEntity(msg.peerId).catch(() => null);
      if (!entity || entity.username?.toLowerCase() !== 'botfather') return;

      const text = msg.message || '';
      console.log(`  BotFather [step ${step}]: ${text.split('\n')[0].slice(0, 80)}`);

      // Rate limit detection — check at any step
      const waitSecs = parseRateLimit(text);
      if (waitSecs !== null) {
        const waitMins = Math.ceil(waitSecs / 60);
        const resumeTime = new Date(Date.now() + waitSecs * 1000).toLocaleTimeString();
        console.log(`\n  ⛔ BotFather rate limit: wait ${waitSecs}s (~${waitMins} min). Resume after ${resumeTime}.`);
        console.log(`  Stopping. Re-run this command after the wait.\n`);
        client.removeEventHandler(handler, new NewMessage({}));
        resolve(RATE_LIMITED);
        return;
      }

      if (step === 0) {
        // Received initial /newbot acknowledgement — send display name
        if (text.toLowerCase().includes('call it') || text.toLowerCase().includes('name')) {
          step = 1;
          await sleep(1500);
          await client.sendMessage(BOTFATHER, { message: displayName });
        }
      } else if (step === 1) {
        // Received prompt for username
        if (text.toLowerCase().includes('username')) {
          step = 2;
          await sleep(1500);
          await client.sendMessage(BOTFATHER, { message: username });
        } else if (text.toLowerCase().includes('sorry') || text.toLowerCase().includes('invalid')) {
          console.log(`  ✗ Error at name step: ${text.slice(0, 120)}`);
          client.removeEventHandler(handler, new NewMessage({}));
          resolve(null);
        }
      } else if (step === 2) {
        // Received token confirmation (or error)
        const tokenMatch = text.match(/(\d+:[A-Za-z0-9_-]{35,})/);
        if (tokenMatch) {
          client.removeEventHandler(handler, new NewMessage({}));
          resolve(tokenMatch[1]);
        } else if (
          text.toLowerCase().includes('sorry') ||
          text.toLowerCase().includes('username') ||
          text.toLowerCase().includes('taken') ||
          text.toLowerCase().includes('invalid')
        ) {
          console.log(`  ✗ Error at username step: ${text.slice(0, 120)}`);
          client.removeEventHandler(handler, new NewMessage({}));
          resolve(null);
        }
      }
    };

    client.addEventHandler(handler, new NewMessage({}));

    // Kick off conversation
    await sleep(500);
    await client.sendMessage(BOTFATHER, { message: '/newbot' });

    // Timeout after 60s
    setTimeout(() => {
      console.log(`  ✗ Timeout waiting for BotFather response`);
      client.removeEventHandler(handler, new NewMessage({}));
      resolve(null);
    }, 60_000);
  });
}

// ---------------------------------------------------------------------------
// Disable group privacy for a bot (so it can read messages in groups)
// ---------------------------------------------------------------------------

async function disableGroupPrivacy(client, username) {
  return new Promise(async (resolve) => {
    let step = 0;

    const handler = async (event) => {
      const msg = event.message;
      if (!msg || !msg.peerId) return;
      const entity = await client.getEntity(msg.peerId).catch(() => null);
      if (!entity || entity.username?.toLowerCase() !== 'botfather') return;

      const text = msg.message || '';

      if (step === 0 && (text.includes('Choose a bot') || text.includes('choose a bot') || text.includes('Alright'))) {
        step = 1;
        await sleep(1000);
        await client.sendMessage(BOTFATHER, { message: `@${username}` });
      } else if (step === 1 && text.includes('Bot Settings')) {
        // Look for inline keyboard — we need to click "Bot Settings"
        // GramJS doesn't easily click inline buttons via text API.
        // Instead, use the direct /setprivacy command which is simpler.
        client.removeEventHandler(handler, new NewMessage({}));
        resolve('use_setprivacy');
      } else if (step >= 1) {
        client.removeEventHandler(handler, new NewMessage({}));
        resolve('done');
      }
    };

    client.addEventHandler(handler, new NewMessage({}));
    await client.sendMessage(BOTFATHER, { message: `/mybots` });

    setTimeout(() => {
      client.removeEventHandler(handler, new NewMessage({}));
      resolve('timeout');
    }, 30_000);
  });
}

/**
 * Disable group privacy via /setprivacy command (simpler than inline buttons).
 * This allows the bot to read all messages in groups, not just commands.
 */
async function setPrivacyDisabled(client, username) {
  return new Promise(async (resolve) => {
    let step = 0;

    const handler = async (event) => {
      const msg = event.message;
      if (!msg || !msg.peerId) return;
      const entity = await client.getEntity(msg.peerId).catch(() => null);
      if (!entity || entity.username?.toLowerCase() !== 'botfather') return;

      const text = msg.message || '';

      if (step === 0 && (text.toLowerCase().includes('choose a bot') || text.toLowerCase().includes('which bot'))) {
        step = 1;
        await sleep(1000);
        await client.sendMessage(BOTFATHER, { message: `@${username}` });
      } else if (step === 1 && (text.toLowerCase().includes('enable') || text.toLowerCase().includes('disable') || text.toLowerCase().includes('privacy'))) {
        step = 2;
        await sleep(1000);
        await client.sendMessage(BOTFATHER, { message: 'Disable' });
      } else if (step === 2) {
        console.log(`  ✓ Group privacy disabled for @${username}`);
        client.removeEventHandler(handler, new NewMessage({}));
        resolve(true);
      }
    };

    client.addEventHandler(handler, new NewMessage({}));
    await sleep(500);
    await client.sendMessage(BOTFATHER, { message: '/setprivacy' });

    setTimeout(() => {
      client.removeEventHandler(handler, new NewMessage({}));
      console.log(`  ⚠ Privacy timeout for @${username} — set manually if needed`);
      resolve(false);
    }, 45_000);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatDelay(ms) {
  return ms >= 60_000 ? `${Math.round(ms / 1000 / 60)}m` : `${Math.round(ms / 1000)}s`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs();

  if (args.listOnly) {
    console.log('\nAll bots (index — name — username):');
    ALL_BOTS.forEach((b, i) => console.log(`  ${String(i).padStart(2)}  ${b.name.padEnd(18)} @${b.username}`));
    console.log(`\nTotal: ${ALL_BOTS.length}`);
    console.log('\nRate limit: BotFather allows ~10 bots/hour. Script runs all 24 across 3 sessions:');
    console.log('  Session 1: bots 0-8  (~18 min) → stop → wait 1hr');
    console.log('  Session 2: bots 9-17 (~18 min) → stop → wait 1hr');
    console.log('  Session 3: bots 18-23 (~12 min) → done');
    console.log('\nJust re-run the same command each session — script skips already-created bots.');
    process.exit(0);
  }

  const API_ID   = parseInt(process.env.TELEGRAM_API_ID   || '', 10);
  const API_HASH = process.env.TELEGRAM_API_HASH || '';

  if (!API_ID || !API_HASH) {
    console.error('\nError: TELEGRAM_API_ID and TELEGRAM_API_HASH must be set.');
    console.error('Get them from https://my.telegram.org/apps\n');
    process.exit(1);
  }

  if (!args.phone) {
    console.error('\nError: --phone is required (e.g. --phone +1xxxxxxxxxx)\n');
    process.exit(1);
  }

  // Determine which bots to create
  const subset = ALL_BOTS.slice(args.startIdx, args.endIdx + 1);
  console.log(`\nWill process bots [${args.startIdx}..${args.endIdx}]: ${subset.map(b => b.name).join(', ')}`);

  // Load existing tokens (skip already done)
  const tokens = loadTokens(args.botsFile);
  const remaining = subset.filter(b => !tokens[b.name]);
  if (remaining.length < subset.length) {
    const done = subset.length - remaining.length;
    console.log(`  (${done} already in ${args.botsFile}, skipping)`);
  }
  if (remaining.length === 0) {
    console.log('\nAll bots in range already created. Done.');
    process.exit(0);
  }
  console.log(`  Creating ${remaining.length} bots. Estimated time: ~${formatDelay(remaining.length * DELAY_BETWEEN_BOTS)}\n`);

  // Connect
  const session = loadSession(args.sessionFile);
  const client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => args.phone,
    password:    async () => await ask('2FA password (if enabled): '),
    phoneCode:   async () => await ask('SMS code sent to your phone: '),
    onError:     (err) => console.error('Auth error:', err),
  });

  console.log('\nConnected to Telegram.\n');
  saveSession(args.sessionFile, client);

  // Create bots one by one
  for (let i = 0; i < remaining.length; i++) {
    const bot = remaining[i];
    console.log(`[${i + 1}/${remaining.length}] Creating @${bot.username} (${bot.name})...`);

    const token = await createBot(client, bot.name, bot.username);

    if (token === RATE_LIMITED) {
      console.log(`  Tokens saved so far: ${Object.keys(tokens).length}`);
      await client.disconnect();
      rl.close();
      process.exit(0);
    }

    if (token) {
      console.log(`  ✓ Token: ${token.slice(0, 12)}...`);
      tokens[bot.name] = token;
      saveTokens(args.botsFile, tokens);

      // Disable group privacy
      console.log(`  Disabling group privacy for @${bot.username}...`);
      await sleep(3000);
      await setPrivacyDisabled(client, bot.username);
    } else {
      console.log(`  ✗ Failed to create @${bot.username} — skipping. Check manually.`);
    }

    // Delay before next bot (skip delay after last one)
    if (i < remaining.length - 1) {
      console.log(`  Waiting ${formatDelay(DELAY_BETWEEN_BOTS)} before next bot...`);
      await sleep(DELAY_BETWEEN_BOTS);
    }
  }

  await client.disconnect();
  rl.close();

  // Summary
  console.log('\n=== Done ===');
  console.log(`Tokens saved to ${args.botsFile}:`);
  Object.entries(tokens).forEach(([name, tok]) => {
    console.log(`  ${name.padEnd(18)} ${tok.slice(0, 14)}...`);
  });
  console.log('\nNext: add pool tokens to .env as TELEGRAM_BOT_POOL=TOKEN1,TOKEN2,...');
  console.log('Run: node scripts/set-pool-env.mjs to merge tokens from both accounts.');
}

main().catch((err) => {
  console.error('\nFatal:', err);
  process.exit(1);
});
