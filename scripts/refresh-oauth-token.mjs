#!/usr/bin/env node
/**
 * refresh-oauth-token.mjs
 *
 * Exchanges the stored refresh token for a new access token using the
 * Claude Code OAuth endpoint. Updates ~/.claude/.credentials.json,
 * .env, and data/env/env so the running service picks it up immediately
 * (credential proxy re-reads .env on every auth request).
 *
 * Run directly:  node scripts/refresh-oauth-token.mjs
 * Via cron:      0 *\/6 * * *  cd /home/nanoclaw/nanoclaw && node scripts/refresh-oauth-token.mjs >> /tmp/nanoclaw-token-refresh.log 2>&1
 */

import fs from 'fs';
import https from 'https';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const TOKEN_URL = 'https://platform.claude.com/v1/oauth/token';
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const CREDENTIALS_FILE = path.join(os.homedir(), '.claude', '.credentials.json');

// Use script location so this works from any working directory (e.g. cron)
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(PROJECT_ROOT, '.env');
const ENV_COPY = path.join(PROJECT_ROOT, 'data', 'env', 'env');

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function readCredentials() {
  const raw = fs.readFileSync(CREDENTIALS_FILE, 'utf8');
  return JSON.parse(raw);
}

function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${buf}`));
        } else {
          resolve(JSON.parse(buf));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function updateEnvFile(filePath, token) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('CLAUDE_CODE_OAUTH_TOKEN=')) {
    content = content.replace(/^CLAUDE_CODE_OAUTH_TOKEN=.*/m, `CLAUDE_CODE_OAUTH_TOKEN=${token}`);
  } else {
    content += `\nCLAUDE_CODE_OAUTH_TOKEN=${token}\n`;
  }
  fs.writeFileSync(filePath, content);
}

async function main() {
  log('Reading credentials...');
  const creds = readCredentials();
  const oauth = creds.claudeAiOauth;

  if (!oauth?.refreshToken) {
    log('ERROR: No refresh token found in credentials file. Re-authenticate with `claude`.');
    process.exit(1);
  }

  const expiresAt = oauth.expiresAt;
  const hoursLeft = expiresAt ? ((expiresAt - Date.now()) / 3_600_000).toFixed(1) : 'unknown';
  log(`Current token expires in ${hoursLeft} hours. Refreshing...`);

  const result = await post(TOKEN_URL, {
    grant_type: 'refresh_token',
    refresh_token: oauth.refreshToken,
    client_id: CLIENT_ID,
  });

  const newAccessToken = result.access_token;
  const newRefreshToken = result.refresh_token ?? oauth.refreshToken;
  const newExpiresAt = Date.now() + (result.expires_in ?? 3600) * 1000;

  log(`New token obtained. Expires in ${(result.expires_in / 3600).toFixed(1)} hours.`);

  // Update ~/.claude/.credentials.json
  creds.claudeAiOauth = {
    ...oauth,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresAt: newExpiresAt,
  };
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2));
  log(`Updated ${CREDENTIALS_FILE}`);

  // Update .env
  updateEnvFile(ENV_FILE, newAccessToken);
  log(`Updated ${ENV_FILE}`);

  // Update data/env/env (copy used by systemd service)
  if (fs.existsSync(ENV_COPY)) {
    updateEnvFile(ENV_COPY, newAccessToken);
    log(`Updated ${ENV_COPY}`);
  }

  log('Token refresh complete. Service will pick up new token on next auth request.');
}

main().catch(err => {
  console.error(`[${new Date().toISOString()}] FATAL:`, err.message);
  process.exit(1);
});
