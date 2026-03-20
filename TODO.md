# NanoClaw — Development TODO

## Blocking / High Priority

### TD-001: Admin privilege for Alhaitham
Alhaitham can't register groups himself — blocked by `if (!isMain)` guard in `register_group`.

Files: `src/types.ts`, `src/container-runner.ts`, `container/agent-runner/src/ipc-mcp-stdio.ts`

Steps:
1. Add `isAdmin?: boolean` to `ContainerConfig` in `src/types.ts`
2. In `src/container-runner.ts` → `buildContainerArgs()`, inject `-e NANOCLAW_IS_ADMIN=1` when `group.containerConfig?.isAdmin`
3. In `ipc-mcp-stdio.ts`, read `const isAdmin = process.env.NANOCLAW_IS_ADMIN === '1'`
4. Change `register_group` guard: `if (!isMain && !isAdmin)`
5. Set `containerConfig: { isAdmin: true }` on Alhaitham's DB row

Workaround: Alhaitham creates files/folders, sends user a registration list, user forwards to main.

---

### TD-003: Nahida read-only access to all agent workspaces
Nahida can't read other agents' folders to build daily plans.

File: `src/container-runner.ts` → `buildVolumeMounts()`

Fix: Add `additionalMounts` to Nahida's group config, mounting every `groups/{folder}/` read-only under `/workspace/extra/{folder}/`.

---

## Agent Setup

### Task: Create remaining 19 bot tokens via BotFather
19 agents still need dedicated Telegram bot tokens (currently only 5 solo agents have tokens).
Requires TELEGRAM_API_ID and TELEGRAM_API_HASH for bulk creation via MTProto (BotFather rate-limits manual creation).

### Task: Register remaining 19 agents with virtual JIDs in Teyvat LLC
After tokens are created, insert virtual JID rows in DB for each academic agent:
- 8 TA agents (Tighnari, Collei, Navia, Chevreuse, Diluc, Kaeya, Xiao, Mountain Shaper)
- 6 Fatui Harbingers research agents
- 5 Liyue Qixing research agents

Each row: `jid=virtual:telegram_{folder}`, `sharedGroupJid=tg:-5244478723`, `agentTrigger={Name}`, `containerConfig.poolBotToken={token}`

### Task: TD-006 — Alhaitham bot token
Create `nanoclaw_alhaitham_bot` via BotFather. Add to `.env` TELEGRAM_BOT_POOL (5th entry). Update DB containerConfig for `telegram_alhaitham`. Set bot photo.

### Task: Set up Spring 2026 academic agents via Alhaitham
Message Alhaitham with courses + schedule. He creates TA team CLAUDE.md files and research team CLAUDE.md files using templates in `groups/alhaitham/templates/`. Then register via main (or TD-001 if implemented first).

### Task: Fill academic context files (after March 23 — Spring 2026 start)
Once classes begin, fill in actual syllabus content, problem sets, and research context into each agent's workspace so they have real course material to work from.

---

## Medium Priority

### TD-004: Inter-agent messaging — send_to_agent
Agents can only message the user. Arlecchino can't assign tasks to Columbina.

File: `container/agent-runner/src/ipc-mcp-stdio.ts`

Fix: Add `send_to_agent` MCP tool. Writes message file to target agent's IPC input directory. Target picks it up on next activation.

### TD-005: Alhaitham read access to all TA workspaces
Alhaitham can't check deadlines/progress across courses.

File: `src/container-runner.ts` → `buildVolumeMounts()`

Fix: Same pattern as TD-003 — read-only additionalMounts for Alhaitham covering current quarter's TA + research team folders.

### TD-007: Agent workspace cleanup on archival
When a course ends, archived agents leave dead files in `groups/` and `data/sessions/`.

Design:
- Move `groups/{folder}/CLAUDE.md` → `groups/_archived/{quarter}/{folder}/CLAUDE.md`
- Move `data/sessions/{folder}/` → `data/sessions/_archived/{quarter}/{folder}/`
- Mark `is_archived = 1` in DB, unregister
- Alhaitham handles this as part of quarter transition

---

## Low Priority

### TD-008: Narrator channel (agent activity feed)
A read-only Telegram channel where a narrator bot posts one-line status events (`Arlecchino dispatched research team`, etc.) via a `post_status` MCP tool. Gives unified visibility into what all agents are doing.

---

## Completed

- [x] TD-005: Alhaitham read access to all TA/research workspaces — `mountAllGroups: true` in DB containerConfig; all agent folders visible at `/workspace/extra/{folder}/`
- [x] TD-003: Nahida read-only access to all agent workspaces — `mountAllGroups` flag in ContainerConfig; all `groups/` subdirs auto-mounted at `/workspace/extra/{folder}/` on each container run
- [x] TD-001: Admin privilege for Alhaitham — `isAdmin` flag in ContainerConfig, `NANOCLAW_IS_ADMIN` env var, register_group guard updated in ipc.ts and ipc-mcp-stdio.ts, agentTrigger/sharedGroupJid added to register_group schema
- [x] Telegram channel integration
- [x] Teyvat LLC shared-group dispatch (TD-002)
- [x] Per-agent pool bot tokens (pool bot identity per agent in shared group)
- [x] Image vision (Telegram photo → multimodal content blocks)
- [x] PDF reader (Telegram PDF → `attachments/` + `pdf-reader` CLI in container)
- [x] SSH disconnect fix (`loginctl enable-linger`)
- [x] OAuth token auto-refresh cron (30-min sync from `~/.claude/.credentials.json`)
- [x] IPC authorization for shared-group replies (virtual entry lookup)
- [x] Follow-up messages pipe to active container without re-mentioning `@AgentName`
