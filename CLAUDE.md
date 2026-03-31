# NanoClaw — Multi-Agent Personal System

Fork of qwibitai/nanoclaw. 3-agent system: Andy (main), Raiden (work), Arlecchino (life manager).
Upstream: `git remote add upstream https://github.com/qwibitai/nanoclaw.git` — use `/update-nanoclaw` to pull fixes.

## Architecture

Single Node.js process. Channels (Telegram/WhatsApp/Slack/Discord/Gmail) self-register at startup. Messages route to Claude Agent SDK in isolated Docker containers. Each group has its own filesystem, memory, and IPC namespace.

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Orchestrator: state, message loop, agent invocation |
| `src/container-runner.ts` | Spawns agent containers with mounts |
| `src/ipc.ts` | IPC watcher and task processing |
| `src/router.ts` | Message formatting and outbound routing |
| `src/config.ts` | Trigger pattern, paths, intervals |
| `src/types.ts` | TypeScript interfaces |
| `src/db.ts` | SQLite operations |
| `container/agent-runner/src/index.ts` | Runs inside container, Claude Agent SDK interface |
| `container/agent-runner/src/ipc-mcp-stdio.ts` | MCP tools (send_message, schedule_task, register_group, etc.) |
| `groups/{name}/CLAUDE.md` | Per-agent personality and memory |
| `container/skills/*/SKILL.md` | Agent skills — synced to `.claude/skills/` at container startup |

## Skills

Four types of skills exist in NanoClaw. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full taxonomy and guidelines.

- **Feature skills** — merge a `skill/*` branch to add capabilities (e.g. `/add-telegram`, `/add-slack`)
- **Utility skills** — ship code files alongside SKILL.md (e.g. `/claw`)
- **Operational skills** — instruction-only workflows, always on `main` (e.g. `/setup`, `/debug`)
- **Container skills** — loaded inside agent containers at runtime (`container/skills/`)

| Skill | When to Use |
|-------|-------------|
| `/setup` | First-time installation, authentication, service configuration |
| `/customize` | Adding channels, integrations, changing behavior |
| `/debug` | Container issues, logs, troubleshooting |
| `/update-nanoclaw` | Pull upstream fixes into customized install |

## Contributing

Before creating a PR, adding a skill, or preparing any contribution, you MUST read [CONTRIBUTING.md](CONTRIBUTING.md). It covers accepted change types, the four skill types and their guidelines, SKILL.md format rules, PR requirements, and the pre-submission checklist (searching for existing PRs/issues, testing, description format).

## Development

Run commands directly — don't tell the user to run them.

```bash
npm run dev          # Hot reload
npm run build        # Compile TypeScript
./container/build.sh # Rebuild agent container
systemctl --user restart nanoclaw  # Restart service
```

After source changes: `npm run build && ./container/build.sh`

Container buildkit caches aggressively. `--no-cache` alone won't invalidate COPY steps — prune builder first.

## Owner

UChicago MSFM grad student. Working part-time at 7Chord (quant research & dev). Has not learned TypeScript — Claude Code handles all TS. Research: LLM agents for alpha mining, derivatives pricing.

## Reference Docs (read only when needed)

| Doc | Contents |
|-----|----------|
| `docs/tech-debt.md` | TD-001 through TD-008: implemented features and pending work |
| `docs/setup-checklist.md` | Deployment phases, configuration notes |
