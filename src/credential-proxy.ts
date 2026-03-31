/**
 * Credential proxy for container isolation.
 * Containers connect here instead of directly to the Anthropic API.
 * The proxy injects real credentials so containers never see them.
 *
 * Two auth modes:
 *   API key:  Proxy injects x-api-key on every request.
 *   OAuth:    Container CLI exchanges its placeholder token for a temp
 *             API key via /api/oauth/claude_cli/create_api_key.
 *             Proxy injects real OAuth token on that exchange request;
 *             subsequent requests carry the temp key which is valid as-is.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createServer, Server } from 'http';
import { request as httpsRequest } from 'https';
import { request as httpRequest, RequestOptions } from 'http';

import { readEnvFile } from './env.js';
import { logger } from './logger.js';

const CLAUDE_OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const CLAUDE_OAUTH_TOKEN_URL = 'https://claude.ai/v1/oauth/token';
/** Refresh when token expires within this many ms. */
const REFRESH_BUFFER_MS = 120_000; // 2 minutes

interface ClaudeCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes?: string[];
  subscriptionType?: string;
  rateLimitTier?: string;
}

/** Serialized guard — only one refresh at a time. */
let refreshPromise: Promise<string | undefined> | null = null;

function credentialsFilePath(): string {
  return path.join(os.homedir(), '.claude', '.credentials.json');
}

function readClaudeCredentialsRaw(): ClaudeCredentials | undefined {
  try {
    const raw = fs.readFileSync(credentialsFilePath(), 'utf8');
    const parsed = JSON.parse(raw);
    const oauth = parsed?.claudeAiOauth;
    if (oauth?.accessToken && oauth?.refreshToken && oauth?.expiresAt) {
      return oauth as ClaudeCredentials;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function writeClaudeCredentials(creds: ClaudeCredentials): void {
  const file = credentialsFilePath();
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    parsed.claudeAiOauth = { ...parsed.claudeAiOauth, ...creds };
    fs.writeFileSync(file, JSON.stringify(parsed, null, 2), 'utf8');
  } catch (err) {
    logger.error({ err }, 'Failed to write refreshed credentials');
  }
}

async function refreshOAuthToken(
  refreshToken: string,
): Promise<ClaudeCredentials | undefined> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CLAUDE_OAUTH_CLIENT_ID,
    refresh_token: refreshToken,
  }).toString();

  return new Promise((resolve) => {
    const req = httpsRequest(
      CLAUDE_OAUTH_TOKEN_URL,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'content-length': Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString());
            if (res.statusCode !== 200 || !data.access_token) {
              logger.error(
                { status: res.statusCode, data },
                'OAuth token refresh failed',
              );
              resolve(undefined);
              return;
            }
            const expiresIn = data.expires_in ?? 36000;
            resolve({
              accessToken: data.access_token,
              refreshToken: data.refresh_token || refreshToken,
              expiresAt: Date.now() + expiresIn * 1000,
              scopes: data.scope ? data.scope.split(' ') : undefined,
            });
          } catch (err) {
            logger.error({ err }, 'Failed to parse OAuth refresh response');
            resolve(undefined);
          }
        });
      },
    );
    req.on('error', (err) => {
      logger.error({ err }, 'OAuth refresh request error');
      resolve(undefined);
    });
    req.write(body);
    req.end();
  });
}

/**
 * Read the OAuth access token from ~/.claude/.credentials.json.
 * If the token is expired or about to expire, refresh it first.
 */
async function getValidOAuthToken(): Promise<string | undefined> {
  const creds = readClaudeCredentialsRaw();
  if (!creds) return undefined;

  // Token still fresh — return immediately
  if (Date.now() < creds.expiresAt - REFRESH_BUFFER_MS) {
    return creds.accessToken;
  }

  // Token expired or expiring soon — refresh (serialized)
  if (!refreshPromise) {
    refreshPromise = (async () => {
      logger.info('OAuth token expired or expiring soon, refreshing…');
      const refreshed = await refreshOAuthToken(creds.refreshToken);
      if (refreshed) {
        writeClaudeCredentials(refreshed);
        logger.info(
          { expiresAt: new Date(refreshed.expiresAt).toISOString() },
          'OAuth token refreshed successfully',
        );
        return refreshed.accessToken;
      }
      // Refresh failed — return stale token as last resort
      logger.warn(
        'OAuth refresh failed, using existing (possibly expired) token',
      );
      return creds.accessToken;
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

/** Read the OAuth access token directly from ~/.claude/.credentials.json (sync, no refresh). */
function readClaudeCredentials(): string | undefined {
  return readClaudeCredentialsRaw()?.accessToken;
}

export type AuthMode = 'api-key' | 'oauth';

export interface ProxyConfig {
  authMode: AuthMode;
}

export function startCredentialProxy(
  port: number,
  host = '127.0.0.1',
): Promise<Server> {
  const staticSecrets = readEnvFile([
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_BASE_URL',
  ]);

  const authMode: AuthMode = staticSecrets.ANTHROPIC_API_KEY
    ? 'api-key'
    : 'oauth';

  const upstreamUrl = new URL(
    staticSecrets.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
  );
  const isHttps = upstreamUrl.protocol === 'https:';
  const makeRequest = isHttps ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', async () => {
        const body = Buffer.concat(chunks);
        const headers: Record<string, string | number | string[] | undefined> =
          {
            ...(req.headers as Record<string, string>),
            host: upstreamUrl.host,
            'content-length': body.length,
          };

        // Strip hop-by-hop headers that must not be forwarded by proxies
        delete headers['connection'];
        delete headers['keep-alive'];
        delete headers['transfer-encoding'];

        if (authMode === 'api-key') {
          // API key mode: inject x-api-key on every request
          delete headers['x-api-key'];
          headers['x-api-key'] = staticSecrets.ANTHROPIC_API_KEY;
        } else {
          // OAuth mode: replace placeholder Bearer token with the real one
          // only when the container actually sends an Authorization header
          // (exchange request + auth probes). Post-exchange requests use
          // x-api-key only, so they pass through without token injection.
          if (headers['authorization']) {
            // Get a valid token, refreshing automatically if expired.
            // Falls back to .env values if credentials file is unavailable.
            const oauthToken =
              (await getValidOAuthToken()) ||
              readEnvFile(['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_AUTH_TOKEN'])
                .CLAUDE_CODE_OAUTH_TOKEN;
            delete headers['authorization'];
            if (oauthToken) {
              headers['authorization'] = `Bearer ${oauthToken}`;
            }
          }
        }

        const upstream = makeRequest(
          {
            hostname: upstreamUrl.hostname,
            port: upstreamUrl.port || (isHttps ? 443 : 80),
            path: req.url,
            method: req.method,
            headers,
          } as RequestOptions,
          (upRes) => {
            res.writeHead(upRes.statusCode!, upRes.headers);
            upRes.pipe(res);
          },
        );

        upstream.on('error', (err) => {
          logger.error(
            { err, url: req.url },
            'Credential proxy upstream error',
          );
          if (!res.headersSent) {
            res.writeHead(502);
            res.end('Bad Gateway');
          }
        });

        upstream.write(body);
        upstream.end();
      });
    });

    server.listen(port, host, () => {
      logger.info({ port, host, authMode }, 'Credential proxy started');
      resolve(server);
    });

    server.on('error', reject);
  });
}

/** Detect which auth mode the host is configured for. */
export function detectAuthMode(): AuthMode {
  const secrets = readEnvFile(['ANTHROPIC_API_KEY']);
  return secrets.ANTHROPIC_API_KEY ? 'api-key' : 'oauth';
}
