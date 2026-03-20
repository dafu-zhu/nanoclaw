# NanoClaw — Multi-Agent Personal System

Fork of qwibitai/nanoclaw. Customized for a 24-agent personal system organized by Genshin Impact character relationship groups.

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
| `container/skills/*/SKILL.md` | Agent skills — synced to every agent's `.claude/skills/` at container startup |

## Agent Skills System

Skills live in `container/skills/{skill-name}/SKILL.md` and are automatically synced to every agent's `.claude/skills/{skill-name}/SKILL.md` at container startup (`container-runner.ts` lines 152–166). Agents invoke them with `/{skill-name}`.

**Adding a new skill:** Create `container/skills/{skill-name}/SKILL.md`. No rebuild needed — synced at next container spawn.

**Installing from a `.skill` file** (ZIP archive from local machine):
```bash
# Copy from Mac to server
scp /Users/you/Downloads/my-skill.skill nanoclaw:/home/nanoclaw/nanoclaw/

# Extract into container/skills/
python3 -c "import zipfile; zipfile.ZipFile('my-skill.skill').extractall('container/skills/')"
rm my-skill.skill
```

### Course Skills (TA agents)

Generic templates stored in `container/skills/` — each TA agent customizes their local copy for their specific course. Trigger with the slash command matching the directory name.

| Skill | Purpose |
|-------|---------|
| `/companion-tutor-template` | Companion tutor setup: textbook Q&A, reading guides, PDF tutorials. Fill `«placeholders»` per course. |
| `/topic-tutorial-notes` | Generate targeted tutorial notes on a topic |
| `/course-lecture-notes` | Produce structured lecture notes |
| `/course-practice-materials` | Create practice problems and solutions |
| `/course-homework-solver` | Step-through homework problem solving |

**Per-agent customization:** After a TA runs `/companion-tutor-template`, they fill in the `«placeholders»` (textbook filename, user profile, reference files, focus chapters) and save the result to their workspace as their working system prompt or a course-specific skill file.

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
Agents are named after Genshin Impact characters. Groups are classified by character relationships (friendships, factions, alliances). Folder names are character names in lowercase.

### Solo Agents (no group — unique characters)
| Name | Role | Folder | Character Background |
|------|------|--------|----------------------|
| Skirk | Career Consultant — jobs, applications, industry news | `skirk` | Tartaglia's master; wanderer of the Abyss; cold, surgical precision; she sharpens what has potential |
| Nahida | Daily Planner — orchestrates all agents, builds daily schedule | `nahida` | Dendro Archon; her consciousness connects directly to the Irminsul (Teyvat's world knowledge tree); gentle yet masterful coordinator |
| Zhongli | Industry Mentor — personal projects, skills, portfolio | `zhongli` | Former Geo Archon; 6000-year-old consultant at Wangsheng Funeral Parlor; the ultimate mentor — knows everyone and everything |
| Raiden | Work Manager — simulates real boss, tracks work tasks | `raiden` | Raiden Shogun (Ei); enforces strict discipline and ensures everyone fulfills their duties without exception |

### Academic Orchestrator (permanent — orchestrates all academic agents)
| Name | Role | Folder | Character Background |
|------|------|--------|----------------------|
| Alhaitham | Academic Consultant — single entry point for all academic setup | `alhaitham` | Scribe of the Sumeru Akademiya and former Acting Grand Sage; academic genius who masters and organizes all knowledge |

### TA Agents (1 per course, rotate quarterly — created by Alhaitham)

#### STAT 31511 Monte Carlo Simulation
| Name | Folder | Character Background |
|------|--------|----------------------|
| Tighnari | `tighnari` | Chief Officer of the Avidya Forest Rangers; rigorous, patient, and an exceptional teacher |

#### FINM 34700 Multivariate Statistical Analysis
| Name | Folder | Character Background |
|------|--------|----------------------|
| Navia | `navia` | Lady of House Navia, head of Spina di Rosula; natural leader, resourceful and decisive |

#### FINM 32000 Numerical Methods
| Name | Folder | Character Background |
|------|--------|----------------------|
| Diluc | `diluc` | Owner of Dawn Winery; rigorous, high standards, no-nonsense approach to everything |

#### FINM 32700 Advanced Computing for Finance
| Name | Folder | Character Background |
|------|--------|----------------------|
| Xiao | `xiao` | Vigilant Yaksha; ancient, precise, demands nothing less than perfection |

### Research Teams (6 per team — created by Alhaitham)

#### Fatui Harbingers — LLM Agent + Alpha Mining
| Name | Role | Folder | Character Background |
|------|------|--------|----------------------|
| Arlecchino | Lead | `arlecchino` | The Knave (4th Harbinger); strategic mastermind; directs the House of the Hearth with iron discipline |
| Columbina | Scout | `columbina` | Damselette (3rd Harbinger); mysterious observer who sees everything and reveals nothing |
| Il Capitano | Prereqs | `capitano` | Seventh Harbinger; legendary warrior; always masked; assesses the field before committing — surveys what knowledge is required before the team can advance |
| Pantalone | Literature | `pantalone` | Regrator (9th Harbinger); manages vast financial and intelligence networks across the world |
| Tartaglia | Experimentalist | `tartaglia` | Childe (11th Harbinger); youngest Harbinger; always eager to test theories through direct action |
| Sandrone | Coder | `sandrone` | Eighth Harbinger (Marionette); mechanical genius; reclusive; builds complex, precise systems — never sloppy |

**Relationship:** All Fatui Harbingers serving under the Tsaritsa. Colleagues bound by shared allegiance, with deep mutual awareness of each other's abilities and ambitions.

#### Liyue Qixing & Associates — Derivatives Pricing
| Name | Role | Folder | Character Background |
|------|------|--------|----------------------|
| Keqing | Lead | `keqing` | Yuheng of the Liyue Qixing; manages Liyue's economic infrastructure; meticulous and detail-oriented |
| Yanfei | Scout | `yanfei` | Liyue legal advisor; sharp analyst who navigates complex systems with precision |
| Xingqiu | Prereqs | `xingqiu` | Young scholar from the Feiyun Commerce Guild; deep theoretical knowledge across disciplines |
| Ningguang | Literature | `ningguang` | Tianquan of the Liyue Qixing; master information broker with unparalleled knowledge of Liyue affairs |
| Hu Tao | Experimentalist | `hutao` | 77th Director of Wangsheng Funeral Parlor; unconventional, creative, never afraid to try something unexpected |
| Ganyu | Coder | `ganyu` | Secretary-General; half-Qilin adeptus; conscientious, overworked, meticulous to a fault — crosses every t and dots every i |

**Relationship:** All prominent Liyue figures operating in business, law, and governance. Interconnected through the Liyue Qixing and the major institutions that shape Liyue's economy.

---

## Alhaitham — Academic Orchestrator

Alhaitham is the single entry point for all academic agent management. The user tells Alhaitham their courses, schedule, and research interests. Alhaitham then:

1. **Creates TA teams** — picks characters from appropriate relationship groups, names agents, fills templates, writes CLAUDE.md files, creates group folders
2. **Creates research teams** — same process, 5 roles per team (Lead, Scout, Prereqs, Literature, Experimentalist)
3. **Handles quarter transitions** — archives old TAs (never deletes), spins up new character-teams from new relationship groups
4. **Registers groups directly** — calls `register_group` MCP tool with admin privilege (TD-001 implemented)
5. **Deactivates agents** — requests unregistration of old teams at quarter end

### Alhaitham's Key Files
| File | Purpose |
|------|---------|
| `groups/alhaitham/CLAUDE.md` | Alhaitham's personality, responsibilities, procedures |
| `groups/alhaitham/character-database.md` | All Genshin characters organized by relationship group — the source of truth for picking new names |
| `groups/alhaitham/character-registry.md` | Tracks which characters are active, archived, or permanently reserved — check before assigning |
| `groups/alhaitham/templates/lead-ta.md` | Template for lead TA CLAUDE.md |
| `groups/alhaitham/templates/study-partner.md` | Template for study partner CLAUDE.md |
| `groups/alhaitham/templates/research-*.md` | Templates for research team roles |
| `groups/alhaitham/quarter-plan.md` | Current quarter's courses, schedule, status |

### Quarter Transition Procedure (Alhaitham follows this)

1. User tells Alhaitham new courses, schedule, topics
2. Alhaitham checks `character-registry.md` for available relationship groups and characters
3. Assigns relationship groups to courses, picks characters from those groups
4. Fills templates with `{{PLACEHOLDERS}}`: LEAD_NAME, PARTNER_NAME, COURSE_CODE, COURSE_TITLE, RELATIONSHIP_GROUP, SCHEDULE, QUARTER, TOPICS
5. Creates `groups/{character_name}/CLAUDE.md` for each new agent
6. Updates `character-registry.md`, `groups/global/CLAUDE.md` roster, Nahida's directory
7. Registers each new group directly via `register_group` MCP tool (admin privilege)
8. Archives old quarter's TAs (unregister, mark as archived in registry)

### Template Placeholders
| Variable | Example |
|----------|---------|
| `{{LEAD_NAME}}` | Tighnari |
| `{{PARTNER_NAME}}` | Collei |
| `{{COURSE_CODE}}` | STAT 31511 |
| `{{COURSE_TITLE}}` | Monte Carlo Simulation |
| `{{RELATIONSHIP_GROUP}}` | Forest Rangers |
| `{{SCHEDULE}}` | Tue/Thu 11:00 AM–12:00 PM |
| `{{QUARTER}}` | Spring 2026 |
| `{{TOPICS}}` | - Variance reduction\n- Importance sampling\n- MCMC |

## Character Registry

Characters are **never recycled** — once a name is used (active or archived), it is permanently retired.

For the full character pool and relationship groups, see:
- **`groups/alhaitham/character-database.md`** — all Genshin characters organized by faction/relationship, including NPCs and historical figures. Update this file when new Genshin versions release new characters.
- **`groups/alhaitham/character-registry.md`** — live state: who is active, archived, or permanently reserved.

## Directory Structure

```
groups/
├── global/CLAUDE.md           ← Shared roster (all agents read this)
├── main/CLAUDE.md             ← Main control channel
│
├── skirk/                     ← Career Consultant (solo)
├── nahida/                    ← Daily Planner (solo)
├── zhongli/                   ← Industry Mentor (solo)
├── raiden/                    ← Work Manager (solo)
│
├── alhaitham/                 ← Academic Orchestrator (permanent)
│   ├── CLAUDE.md
│   ├── character-registry.md
│   ├── templates/
│   │   ├── lead-ta.md
│   │   ├── study-partner.md
│   │   └── research-*.md
│   └── quarter-plan.md
│
├── tighnari/                  ← TA: STAT 31511 Monte Carlo
├── navia/                     ← TA: FINM 34700 Multivariate Stats
├── diluc/                     ← TA: FINM 32000 Numerical Methods
├── xiao/                      ← TA: FINM 32700 Advanced Computing
│
├── arlecchino/, columbina/,   ← Fatui Harbingers (LLM + Alpha Mining)
│   capitano/, pantalone/,
│   tartaglia/, sandrone/
└── keqing/, yanfei/, xingqiu/ ← Liyue Qixing & Associates (Derivatives Pricing)
    ningguang/, hutao/, ganyu/
```

## Weekly Class Schedule (Spring 2026, starts March 23)

| Day | Time | Course | TA Team |
|-----|------|--------|---------|
| Mon | 3:00–5:00 PM | FINM 32000 Numerical Methods | Mondstadt Brothers (Diluc, Kaeya) |
| Tue | 11:00 AM–12:00 PM | STAT 31511 Monte Carlo Simulation | Tighnari |
| Tue | 12:30–1:30 PM | FINM 34700 Multivariate Statistical Analysis | Navia |
| Thu | 11:00 AM–12:00 PM | STAT 31511 Monte Carlo Simulation | Tighnari |
| Thu | 12:30–1:30 PM | FINM 34700 Multivariate Statistical Analysis | Navia |
| Fri | 5:00–7:00 PM | FINM 32700 Advanced Computing for Finance | Xiao |

---

# Tech Debt

Source code changes needed. Reference these by TD-XXX when working on them.

## TD-001: Admin privilege for Alhaitham [DONE]

`isAdmin?: boolean` in `ContainerConfig`. When set, injects `NANOCLAW_IS_ADMIN=1` into the container; `register_group` guard changed to `if (!isMain && !isAdmin)`. `register_group` schema expanded with `agentTrigger`, `sharedGroupJid`, `containerConfig` fields so Alhaitham can register full virtual JID agents in one call. Alhaitham's DB row has `isAdmin: true`.

## TD-002: Per-agent triggers (@AgentName routing) [DONE]

**Files:** `src/types.ts`, `src/db.ts`, `src/index.ts`

**Implemented:** Shared-group dispatch. Agents in "Teyvat LLC" (one Telegram group, all agents) are registered with virtual JIDs (`virtual:{folder}`) and two new fields:
- `agentTrigger`: character name the agent responds to (e.g. `'Skirk'`)
- `sharedGroupJid`: physical Telegram JID of the shared group

**How to register an agent to the shared group** (send from main):
```
register_group({
  jid: "virtual:telegram_skirk",
  name: "Skirk",
  folder: "telegram_skirk",
  trigger: "@Skirk",
  agentTrigger: "Skirk",
  sharedGroupJid: "tg:-1234567890"   ← Teyvat LLC JID
})
```
When `@Skirk ...` appears in Teyvat LLC, the orchestrator dispatches Skirk's container. She replies via her dedicated pool bot token (`containerConfig.poolBotToken`). Each agent has its own cursor and queue slot.

## TD-003: Nahida read-only access to all agent workspaces [DONE]

`mountAllGroups?: boolean` in `ContainerConfig`. When set, `buildVolumeMounts()` iterates `GROUPS_DIR` at spawn time and mounts every subfolder read-only at `/workspace/extra/{folder}/`. Auto-discovers new agents — no manual updates needed. Nahida's DB row has `mountAllGroups: true`.

## TD-004: Inter-agent messaging — send_to_agent [DONE]

MCP tool `send_to_agent(target_folder, text, sender?)` added. Writes to target's `data/ipc/{folder}/input/`. Delivered immediately if target is running (via `pollIpcDuringQuery`), otherwise picked up on next activation. Host handler in `src/ipc.ts` validates folder and verifies target is registered.

## TD-005: Alhaitham read access to all TA workspaces [DONE]

Alhaitham's DB row already has `"mountAllGroups":true` in `containerConfig`, same as Nahida (TD-003). All agent workspaces available read-only at `/workspace/extra/{folder}/`.

## TD-006: Alhaitham bot token [DONE]

Bot `nanoclaw_alhaitham_bot` created. Token is 5th entry in `.env` `TELEGRAM_BOT_POOL` and in `scripts/bot-tokens.json`. Display name set to "Alhaitham" via `setMyName`.

**Remaining:** Set profile photo — `bash scripts/set-bot-photos.sh alhaitham` (enka key: `Alhatham`)

## TD-007: Agent workspace cleanup on archival [MEDIUM]

**Problem:** When a course ends and a TA team is archived, their character names are retired permanently but their files persist indefinitely: `groups/{folder}/CLAUDE.md`, `data/sessions/{folder}/` (conversation history, Claude settings). Over time this accumulates dead weight.

**Design:**
- `groups/{folder}/CLAUDE.md` → move to `groups/_archived/{quarter}/{folder}/CLAUDE.md` (preserves history, out of active path)
- `data/sessions/{folder}/` → move to `data/sessions/_archived/{quarter}/{folder}/` (keeps conversation history accessible but not loaded)
- DB: mark `is_archived = 1`, unregister (already planned in quarter transition)
- Alhaitham handles this as part of the quarter transition procedure — archives old teams, creates new ones

**Note:** The `groups/` folder mount only sees the active folder, so archived CLAUDE.md files are invisible to running containers automatically once moved.

## TD-008: Agent collaboration visualization [LOW]

**Problem:** No way to see agent activity across teams — who's active, what they're doing, what messages are flowing between team members.

**Design (two-layer):**
- Layer 1 (user ↔ team heads): already visible in each agent's Telegram group
- Layer 2 (internal team): visible in the team's Telegram group via pool bots posting with `sender` names
- Unified view option: a read-only Telegram channel where a "narrator" bot posts one-line status events (`Arlecchino dispatched research team`, `Sandrone: code complete`, etc.) — written by agents via a `post_status` MCP tool

**Simpler alternative:** TD-002 (per-agent triggers in one group) gives layer 1 visibility in one place. Layer 2 is already handled by pool bots in team groups.

---

# Setup Checklist (Initial Deployment)

Phase 1: Base NanoClaw
- [ ] Prerequisites: Node.js 20+, Docker, Claude Code CLI
- [ ] Run `claude` then `/setup` — dependencies, container image, API auth, channel setup
- [ ] Add messaging channel (Telegram recommended: `/add-telegram`)

Phase 2: Core agents (manual setup)
- [ ] Create folders: `groups/{global,charlotte,nahida,zhongli,raiden,alhaitham}`
- [ ] Write CLAUDE.md for each (global roster, solo agent personalities, Alhaitham's full orchestrator config)
- [ ] Put Alhaitham's templates in `groups/alhaitham/templates/`
- [ ] Put character-registry in `groups/alhaitham/character-registry.md`
- [ ] Register these 6 agents via main

Phase 3: Academic agents (Alhaitham creates these)
- [ ] Message Alhaitham with Spring 2026 courses, schedule, research interests
- [ ] Alhaitham creates Forest Rangers/Spina di Rosula/Mondstadt Brothers/Liyue Adepti TA teams and Fatui Harbingers/Liyue Qixing research teams
- [ ] Alhaitham sends registration list → user/main registers them
- [ ] Verify all agents respond

Phase 4: Source code customizations
- [ ] TD-001: Admin privilege for Alhaitham (unblocks autonomous orchestration)
- [ ] TD-003: Nahida read access (unblocks daily planning)
- [ ] TD-005: Alhaitham read access to TA folders
- [ ] TD-002: Per-agent triggers (convenience)
- [ ] TD-004: Inter-agent messaging (research team coordination)

## Configuration Notes

- `MAX_CONCURRENT_CONTAINERS` defaults to 5 — fine for 24 agents since most aren't active simultaneously
- Mount allowlist at `~/.config/nanoclaw/mount-allowlist.json` — add course materials, research data folders
- `CONTAINER_TIMEOUT` defaults to 30min — may need tuning for research agents doing long tasks
