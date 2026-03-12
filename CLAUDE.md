# NanoClaw — Multi-Agent Personal System

Fork of qwibitai/nanoclaw. Customized for a 24-agent personal system organized by letter-groups.

Upstream remote: `git remote add upstream https://github.com/qwibitai/nanoclaw.git`
Use `/update-nanoclaw` skill to pull upstream fixes.

## Architecture

Single Node.js process. Channels (Telegram/WhatsApp/Slack/Discord/Gmail) self-register at startup. Messages route to Claude Agent SDK running in isolated Docker containers. Each group has its own filesystem, memory, and IPC namespace.

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Orchestrator: state, message loop, agent invocation |
| `src/channels/registry.ts` | Channel registry (self-registration at startup) |
| `src/ipc.ts` | IPC watcher and task processing |
| `src/router.ts` | Message formatting and outbound routing |
| `src/config.ts` | Trigger pattern, paths, intervals |
| `src/container-runner.ts` | Spawns agent containers with mounts |
| `src/task-scheduler.ts` | Runs scheduled tasks |
| `src/types.ts` | TypeScript interfaces (RegisteredGroup, ContainerConfig, etc.) |
| `src/db.ts` | SQLite operations |
| `container/agent-runner/src/index.ts` | Runs inside container, interfaces with Claude Agent SDK |
| `container/agent-runner/src/ipc-mcp-stdio.ts` | MCP tools agents can call (send_message, schedule_task, register_group, etc.) |
| `groups/{name}/CLAUDE.md` | Per-agent personality and memory |
| `groups/global/CLAUDE.md` | Shared roster readable by all agents |
| `container/skills/agent-browser.md` | Browser automation (available to all agents via Bash) |

## Skills

| Skill | When to Use |
|-------|-------------|
| `/setup` | First-time installation, authentication, service configuration |
| `/customize` | Adding channels, integrations, changing behavior |
| `/debug` | Container issues, logs, troubleshooting |
| `/update-nanoclaw` | Bring upstream NanoClaw updates into a customized install |

## Development

Run commands directly — don't tell the user to run them.

```bash
npm run dev          # Run with hot reload
npm run build        # Compile TypeScript
./container/build.sh # Rebuild agent container
```

Service management (Linux):
```bash
systemctl --user start nanoclaw
systemctl --user stop nanoclaw
systemctl --user restart nanoclaw
```

After any source code change: `npm run build && ./container/build.sh`

## Container Build Cache

The container buildkit caches aggressively. `--no-cache` alone does NOT invalidate COPY steps. To force a truly clean rebuild, prune the builder then re-run `./container/build.sh`.

---

# Multi-Agent System Design

## Owner

Graduate student in quantitative finance (UChicago MSFM-style program). Working part-time. Job searching for quant/tech roles. Has not learned TypeScript — Claude Code handles all TS modifications. Research interests: LLM agents for alpha mining, derivatives pricing.

## Agent Roster

### Naming Convention
Agents that cooperate share a starting letter (A–Z). Solo agents have unique letters permanently reserved.

### Solo Agents
| Letter | Name | Role | Folder |
|--------|------|------|--------|
| S | Sophie | Career Consultant — jobs, applications, industry news | `sophie` |
| L | Leo | Daily Planner — orchestrates all agents, builds daily schedule | `leo` |
| J | Jake | Industry Mentor — personal projects, skills, portfolio | `jake` |
| K | Kristina | Work Manager — simulates real boss, tracks work tasks | `kristina` |

### Academic Consultant (permanent, orchestrates all academic agents)
| Letter | Name | Role | Folder |
|--------|------|------|--------|
| A | Alma | Academic Consultant — single entry point for all academic setup | `alma` |

### TA Teams (2 per course, rotate quarterly — created by Alma)
| Letter | Course | Lead TA | Study Partner |
|--------|--------|---------|---------------|
| B | STAT 31511 Monte Carlo Simulation | Ben | Bella |
| C | FINM 34700 Multivariate Statistical Analysis | Carl | Cleo |
| D | FINM 32000 Numerical Methods | Dan | Diana |
| E | FINM 32700 Advanced Computing for Finance | Evan | Emma |

### Research Teams (5 per team — created by Alma)
| Letter | Topic | Lead | Scout | Prereqs | Literature | Experimentalist |
|--------|-------|------|-------|---------|------------|-----------------|
| F | LLM Agent + Alpha Mining | Felix | Fiona | Finn | Faye | Ford |
| G | Derivatives Pricing | Gabe | Grace | Grant | Gina | Glen |

## Alma — Academic Orchestrator

Alma is the single entry point for all academic agent management. The user tells Alma their courses, schedule, and research interests. Alma then:

1. **Creates TA teams** — picks letters from registry, names agents, fills templates, writes CLAUDE.md files, creates group folders
2. **Creates research teams** — same process, 5 roles per team (Lead, Scout, Prereqs, Literature, Experimentalist)
3. **Handles quarter transitions** — archives old TAs (never deletes), spins up new letter-teams
4. **Requests group registration** — currently sends user a list to forward to main (see TD-001 for making this autonomous)
5. **Deactivates agents** — requests unregistration of old teams at quarter end

### Alma's Key Files
| File | Purpose |
|------|---------|
| `groups/alma/CLAUDE.md` | Alma's personality, responsibilities, procedures |
| `groups/alma/letter-registry.md` | Tracks all letter assignments (active + archived) |
| `groups/alma/templates/lead-ta.md` | Template for lead TA CLAUDE.md |
| `groups/alma/templates/study-partner.md` | Template for study partner CLAUDE.md |
| `groups/alma/templates/research-*.md` | Templates for research team roles |
| `groups/alma/quarter-plan.md` | Current quarter's courses, schedule, status |

### Quarter Transition Procedure (Alma follows this)

1. User tells Alma new courses, schedule, topics
2. Alma checks `letter-registry.md` for next available letters
3. Assigns letters, picks names (must start with assigned letter, no reuse)
4. Fills templates with `{{PLACEHOLDERS}}`: LEAD_NAME, PARTNER_NAME, COURSE_CODE, COURSE_TITLE, LETTER, SCHEDULE, QUARTER, TOPICS
5. Creates `groups/{name}/CLAUDE.md` for each new agent
6. Updates `letter-registry.md`, `groups/global/CLAUDE.md` roster, Leo's directory
7. Sends registration request to user (or registers directly if TD-001 is implemented)
8. Archives old quarter's TAs (unregister, mark as archived in registry)

### Template Placeholders
| Variable | Example |
|----------|---------|
| `{{LEAD_NAME}}` | Ben |
| `{{PARTNER_NAME}}` | Bella |
| `{{COURSE_CODE}}` | STAT 31511 |
| `{{COURSE_TITLE}}` | Monte Carlo Simulation |
| `{{LETTER}}` | B |
| `{{SCHEDULE}}` | Tue/Thu 11:00 AM–12:00 PM |
| `{{QUARTER}}` | Spring 2026 |
| `{{TOPICS}}` | - Variance reduction\n- Importance sampling\n- MCMC |

## Letter Registry

Letters J, K, L, S are permanently reserved for solo agents. Letter A is permanently reserved for Alma.

Next available letters for new teams: H, I, M, N, O, P, Q, R, T, U, V, W, X, Y, Z

Check `groups/alma/letter-registry.md` for the live state.

## Directory Structure

```
groups/
├── global/CLAUDE.md           ← Shared roster (all agents read this)
├── main/CLAUDE.md             ← Main control channel
│
├── sophie/                    ← S: Career Consultant
├── leo/                       ← L: Daily Planner
├── jake/                      ← J: Industry Mentor
├── kristina/                  ← K: Work Manager
│
├── alma/                      ← A: Academic Consultant (permanent)
│   ├── CLAUDE.md
│   ├── letter-registry.md
│   ├── templates/
│   │   ├── lead-ta.md
│   │   ├── study-partner.md
│   │   └── research-*.md
│   └── quarter-plan.md
│
├── ben/, bella/               ← B-team (created by Alma)
├── carl/, cleo/               ← C-team (created by Alma)
├── dan/, diana/               ← D-team (created by Alma)
├── evan/, emma/               ← E-team (created by Alma)
│
├── felix/, fiona/, finn/,     ← F-team (created by Alma)
│   faye/, ford/
└── gabe/, grace/, grant/,     ← G-team (created by Alma)
    gina/, glen/
```

## Weekly Class Schedule (Spring 2026, starts March 23)

| Day | Time | Course | TA Team |
|-----|------|--------|---------|
| Mon | 3:00–5:00 PM | FINM 32000 Numerical Methods | D (Dan, Diana) |
| Tue | 11:00 AM–12:00 PM | STAT 31511 Monte Carlo Simulation | B (Ben, Bella) |
| Tue | 12:30–1:30 PM | FINM 34700 Multivariate Statistical Analysis | C (Carl, Cleo) |
| Thu | 11:00 AM–12:00 PM | STAT 31511 Monte Carlo Simulation | B (Ben, Bella) |
| Thu | 12:30–1:30 PM | FINM 34700 Multivariate Statistical Analysis | C (Carl, Cleo) |
| Fri | 5:00–7:00 PM | FINM 32700 Advanced Computing for Finance | E (Evan, Emma) |

---

# Tech Debt

Source code changes needed. Reference these by TD-XXX when working on them.

## TD-001: Admin privilege for Alma [HIGH — blocks autonomous orchestration]

**File:** `container/agent-runner/src/ipc-mcp-stdio.ts`, `src/container-runner.ts`, `src/types.ts`

**Problem:** `register_group` has `if (!isMain)` guard. Alma can't register groups herself.

**Fix:**
1. Add `isAdmin?: boolean` to `ContainerConfig` in `src/types.ts`
2. In `src/container-runner.ts` → `buildContainerArgs()`, after auth mode block:
   ```typescript
   if (group.containerConfig?.isAdmin) {
     args.push('-e', 'NANOCLAW_IS_ADMIN=1');
   }
   ```
3. In `container/agent-runner/src/ipc-mcp-stdio.ts`, add near the top:
   ```typescript
   const isAdmin = process.env.NANOCLAW_IS_ADMIN === '1';
   ```
4. Change `register_group` guard from `if (!isMain)` to `if (!isMain && !isAdmin)`
5. Set `containerConfig: { isAdmin: true }` on Alma's group registration

**Workaround (current):** Alma creates files/folders, sends user a list. User forwards to main for registration.

## TD-002: Per-agent triggers (@Sophie, @Ben, etc.) [MEDIUM]

**Files:** `src/config.ts`, `src/index.ts`

**Problem:** One global trigger (`@Andy`). Want `@Sophie`, `@Ben`, etc. to route to specific agents.

**Fix:** Allow `RegisteredGroup` to have a custom trigger pattern. Main routes `@AgentName ...` to that agent's group.

## TD-003: Leo read-only access to all agent workspaces [HIGH]

**File:** `src/container-runner.ts` → `buildVolumeMounts()`

**Problem:** Non-main agents only see their own folder + global. Leo needs all folders to build daily plans.

**Fix:** Add `additionalMounts` to Leo's group config mounting every group folder read-only under `/workspace/extra/`.

## TD-004: Inter-agent messaging — send_to_agent [MEDIUM]

**File:** `container/agent-runner/src/ipc-mcp-stdio.ts`

**Problem:** Agents can only message the user. Felix can't assign tasks to Fiona.

**Fix:** Add `send_to_agent` MCP tool. Writes message file to target agent's IPC input directory. Target picks up on next activation.

## TD-005: Alma read access to all TA workspaces [MEDIUM]

**File:** `src/container-runner.ts` → `buildVolumeMounts()`

**Problem:** Alma can't read TA folders to check deadlines/progress across courses.

**Fix:** Same pattern as TD-003 — add read-only additionalMounts for Alma covering current quarter's TA + research team folders.

---

# Setup Checklist (Initial Deployment)

Phase 1: Base NanoClaw
- [ ] Prerequisites: Node.js 20+, Docker, Claude Code CLI
- [ ] Run `claude` then `/setup` — dependencies, container image, API auth, channel setup
- [ ] Add messaging channel (Telegram recommended: `/add-telegram`)

Phase 2: Core agents (manual setup)
- [ ] Create folders: `groups/{global,sophie,leo,jake,kristina,alma}`
- [ ] Write CLAUDE.md for each (global roster, solo agent personalities, Alma's full orchestrator config)
- [ ] Put Alma's templates in `groups/alma/templates/`
- [ ] Put letter-registry in `groups/alma/letter-registry.md`
- [ ] Register these 6 agents via main

Phase 3: Academic agents (Alma creates these)
- [ ] Message Alma with Spring 2026 courses, schedule, research interests
- [ ] Alma creates B/C/D/E TA teams and F/G research teams
- [ ] Alma sends registration list → user/main registers them
- [ ] Verify all agents respond

Phase 4: Source code customizations
- [ ] TD-001: Admin privilege for Alma (unblocks autonomous orchestration)
- [ ] TD-003: Leo read access (unblocks daily planning)
- [ ] TD-005: Alma read access to TA folders
- [ ] TD-002: Per-agent triggers (convenience)
- [ ] TD-004: Inter-agent messaging (research team coordination)

## Configuration Notes

- `MAX_CONCURRENT_CONTAINERS` defaults to 5 — fine for 24 agents since most aren't active simultaneously
- Mount allowlist at `~/.config/nanoclaw/mount-allowlist.json` — add course materials, research data folders
- `CONTAINER_TIMEOUT` defaults to 30min — may need tuning for research agents doing long tasks
