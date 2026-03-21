# NanoClaw — Multi-Agent Personal System

Fork of qwibitai/nanoclaw. 24-agent system organized by Genshin Impact character relationship groups.
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

Skills in `container/skills/{name}/SKILL.md` auto-sync at container spawn. Add new: create the directory + SKILL.md, no rebuild needed.

| Skill | When to Use |
|-------|-------------|
| `/setup` | First-time installation, authentication, service configuration |
| `/customize` | Adding channels, integrations, changing behavior |
| `/debug` | Container issues, logs, troubleshooting |
| `/update-nanoclaw` | Pull upstream fixes into customized install |

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
| Mon | 3:00–5:50 PM | FINM 32000 Numerical Methods | Kersten 106 | Diluc (+ Kaeya) |
| Tue | 11:00 AM–12:20 PM | STAT 31511 Monte Carlo Simulation | Harper 130 | Tighnari |
| Tue | 12:30–1:50 PM | FINM 34700 Multivariate Stats | Eckhart 133 | Navia (+ Chevreuse) |
| Thu | 11:00 AM–12:20 PM | STAT 31511 Monte Carlo Simulation | Harper 130 | Tighnari |
| Thu | 12:30–1:50 PM | FINM 34700 Multivariate Stats | Eckhart 133 | Navia (+ Chevreuse) |
| Fri | 4:30–7:20 PM | FINM 32700 Advanced Computing | MS112 | Xiao (+ Mountain Shaper) |

## Reference Docs (read only when needed)

| Doc | Contents |
|-----|----------|
| `docs/agent-roster.md` | Full agent roster, research teams, character registry rules |
| `docs/tech-debt.md` | TD-001 through TD-008: implemented features and pending work |
| `docs/setup-checklist.md` | Deployment phases, configuration notes |
| `docs/quarter-transition.md` | Alhaitham's quarter transition procedure |
| `docs/templates-reference.md` | Template placeholders for agent CLAUDE.md creation |
| `docs/continuity-protocol.md` | Multi-step task persistence between activations |
