# NanoClaw Development Log

Chronological record of significant changes, fixes, and decisions made during development.

---

## 2026-03-18

### OAuth token authentication — permanent fix

**Problem:** Agents returned `401 authentication_error` intermittently. Root cause was a three-layer sync problem:
1. `~/.claude/.credentials.json` — updated by `claude /login` and the CLI's own refresh logic
2. `.env` / `data/env/env` — separate copy used by the credential proxy
3. Any divergence between the two caused 401s until manually synced

Previous partial fix (live `.env` re-read on each auth request) still broke whenever `/login` was run, because it only updated `~/.claude/.credentials.json`, not `.env`.

**Fix:** `src/credential-proxy.ts` now reads the OAuth token directly from `~/.claude/.credentials.json` on every auth injection, with `.env` as fallback. The files never need to be in sync — the credentials file is the single source of truth.

**Proactive refresh:** `scripts/refresh-oauth-token.mjs` uses the stored refresh token to obtain a new access token before expiry (~8h). Calls `POST https://platform.claude.com/v1/oauth/token` with client ID `9d1c250a-e61b-44d9-88ed-5944d1962f5e`. Writes updated token back to `~/.claude/.credentials.json`. Cron runs every 6 hours so the token is always fresh even when no terminal is open.

**Result:** Service runs unattended indefinitely. `/login` is only needed if the refresh token itself is revoked (password change, security event — rare).

---

## 2026-03-17 — 2026-03-18

### Initial deployment and core feature work

#### Linux host networking (`fix: d9f6dc0`)
Docker on bare-metal Linux blocks container→host traffic via iptables. Switched to `--network=host` so containers reach the credential proxy at `localhost:3001`. Proxy bind address simplified to `127.0.0.1` unconditionally.

#### Teyvat LLC shared-group dispatch — TD-002 (`feat: 7527678`)
All agents share one Telegram group ("Teyvat LLC"). Each agent registered with a virtual JID (`virtual:telegram_{folder}`), `agentTrigger` (character name), and `sharedGroupJid` (physical group JID). Orchestrator dispatches the right container when `@AgentName` appears. Each agent replies via its own pool bot token so messages appear from the correct identity.

Added `agent_trigger` and `shared_group_jid` columns to `registered_groups`. Added `TELEGRAM_BOT_POOL` config export. Follow-up messages (no `@` mention) pipe directly to an active container's stdin queue — no re-trigger needed.

IPC authorization extended: shared-group agents (virtual JIDs) can send to their `sharedGroupJid` via `virtualEntry` lookup.

#### Image vision and PDF reader (`feat: 2609fbd`)
- **Image vision:** `src/image.ts` — channel-agnostic image processing (resize to 1024px, JPEG). Telegram photo handler downloads via Bot API, saves to `groups/{folder}/attachments/`. `parseImageReferences` extracts `[Image: attachments/x.jpg]` tags; images forwarded as multimodal content blocks to Claude.
- **PDF reader:** `poppler-utils` added to Dockerfile (`pdftotext`, `pdfinfo`). `container/skills/pdf-reader/pdf-reader` CLI script at `/usr/local/bin/`. Telegram document handler downloads PDFs to `attachments/`, stores `[PDF: attachments/x.pdf]` in message. Agent calls `pdf-reader` to extract text.

#### TD-001: Admin privilege for Alhaitham (`feat: ce221fc`)
`isAdmin?: boolean` in `ContainerConfig`. Injects `NANOCLAW_IS_ADMIN=1` env var. `register_group` guard updated to `!isMain && !isAdmin` in both `src/ipc.ts` and `container/agent-runner/src/ipc-mcp-stdio.ts`. `register_group` MCP tool schema expanded with `agentTrigger`, `sharedGroupJid`, `containerConfig` so Alhaitham can register full virtual JID agents autonomously. Alhaitham's DB row: `{"isAdmin": true, "mountAllGroups": true, "poolBotToken": "..."}`.

#### TD-003/TD-005: Cross-agent read-only workspace mounts (`feat: ce221fc`)
`mountAllGroups?: boolean` in `ContainerConfig`. When set, `buildVolumeMounts()` iterates `GROUPS_DIR` at spawn time and mounts every subfolder read-only at `/workspace/extra/{folder}/`. Auto-discovers new agents. Nahida and Alhaitham both have `mountAllGroups: true` — Nahida reads all agents' workspaces for daily planning; Alhaitham reads TA/research folders for quarter management.

#### `loginctl enable-linger`
Keeps systemd user services alive after SSH disconnect. Without this, `nanoclaw.service` stopped when the terminal closed.

---

## Architecture Notes

### OAuth token flow
```
~/.claude/.credentials.json
  ├── accessToken   (expires ~8h, refreshed by cron every 6h)
  └── refreshToken  (long-lived, used by refresh-oauth-token.mjs)

credential-proxy.ts
  └── on every auth injection: reads accessToken directly from credentials file
      → no sync required, /login takes effect immediately
```

### Shared-group dispatch flow
```
Teyvat LLC (tg:-5244478723)
  └── message "@Raiden ..."
      → telegram.ts stores message with chatJid=tg:-5244478723
      → index.ts polls sharedPhysicalJids, finds @Raiden trigger
      → dispatches virtual:telegram_raiden container
      → container replies via Raiden's poolBotToken
      → user sees message from @nanoclaw_raiden_bot
```

### Container privilege levels
| Flag | Effect |
|------|--------|
| `isMain: true` | Full access — can register groups, see all available groups |
| `isAdmin: true` | Can register groups (like main), used for Alhaitham |
| `mountAllGroups: true` | All agent folders mounted read-only at `/workspace/extra/` |
| _(none)_ | Own folder + global only |
