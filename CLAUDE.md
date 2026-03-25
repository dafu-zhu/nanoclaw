# NanoClaw — Multi-Agent Personal System

Fork of qwibitai/nanoclaw. 23-agent system organized by Genshin Impact character relationship groups.
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
| `groups/global/identities/*.md` | Shared identity templates (ta, research-lead, research-member) |
| `container/skills/*/SKILL.md` | Agent skills — synced to `.claude/skills/` at container startup |

## Agent Identities

Shared behavior templates in `groups/global/identities/`. Agents reference an identity via `<!-- identity: type -->` in their CLAUDE.md. The identity file provides common behavior; the agent's CLAUDE.md provides overrides (marked with `<!-- override: section -->`). **Agent CLAUDE.md always wins on conflict.**

| Identity | File | Agents |
|----------|------|--------|
| `ta` | `ta.md` | Diluc, Tighnari, Navia, Xiao |
| `research-lead` | `research-lead.md` | Arlecchino, Keqing |
| `research-member` | `research-member.md` | Columbina, Capitano, Pantalone, Tartaglia, Sandrone, Yanfei, Xingqiu, Ningguang, Hu Tao, Ganyu |

Solo agents (Skirk, Nahida, Zhongli, Raiden, Alhaitham, Lisa, Cyno) have no shared identity — each is unique.

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

UChicago MSFM grad student. Working part-time, job searching quant/tech. Has not learned TypeScript — Claude Code handles all TS. Research: LLM agents for alpha mining, derivatives pricing.

## Weekly Schedule (Spring 2026, starts March 23)

| Day | Time | Course | Room | TA |
|-----|------|--------|------|----|
| Mon | 3:00–5:50 PM | FINM 32000 Numerical Methods | Kersten 106 | Diluc |
| Tue | 11:00 AM–12:20 PM | STAT 31511 Monte Carlo Simulation | Harper 130 | Tighnari |
| Tue | 12:30–1:50 PM | FINM 34700 Multivariate Stats | Eckhart 133 | Navia |
| Thu | 11:00 AM–12:20 PM | STAT 31511 Monte Carlo Simulation | Harper 130 | Tighnari |
| Thu | 12:30–1:50 PM | FINM 34700 Multivariate Stats | Eckhart 133 | Navia |
| Fri | 4:30–7:20 PM | FINM 32700 Advanced Computing | MS112 | Xiao |

## Reference Docs (read only when needed)

| Doc | Contents |
|-----|----------|
| `docs/agent-roster.md` | Full agent roster, research teams, character registry rules |
| `docs/tech-debt.md` | TD-001 through TD-008: implemented features and pending work |
| `docs/setup-checklist.md` | Deployment phases, configuration notes |
| `docs/quarter-transition.md` | Alhaitham's quarter transition procedure |
| `docs/templates-reference.md` | Template placeholders for agent CLAUDE.md creation |
