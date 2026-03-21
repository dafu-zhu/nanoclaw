# Setup Checklist (Initial Deployment)

## Phase 1: Base NanoClaw
- [ ] Prerequisites: Node.js 20+, Docker, Claude Code CLI
- [ ] Run `claude` then `/setup` — dependencies, container image, API auth, channel setup
- [ ] Add messaging channel (Telegram recommended: `/add-telegram`)

## Phase 2: Core agents (manual setup)
- [ ] Create folders: `groups/{global,charlotte,nahida,zhongli,raiden,alhaitham}`
- [ ] Write CLAUDE.md for each (global roster, solo agent personalities, Alhaitham's full orchestrator config)
- [ ] Put Alhaitham's templates in `groups/alhaitham/templates/`
- [ ] Put character-registry in `groups/alhaitham/character-registry.md`
- [ ] Register these 6 agents via main

## Phase 3: Academic agents (Alhaitham creates these)
- [ ] Message Alhaitham with Spring 2026 courses, schedule, research interests
- [ ] Alhaitham creates TA teams and research teams
- [ ] Alhaitham sends registration list → user/main registers them
- [ ] Verify all agents respond

## Phase 4: Source code customizations
- [ ] TD-001: Admin privilege for Alhaitham
- [ ] TD-003: Nahida read access
- [ ] TD-005: Alhaitham read access to TA folders
- [ ] TD-002: Per-agent triggers
- [ ] TD-004: Inter-agent messaging

## Configuration Notes
- `MAX_CONCURRENT_CONTAINERS` defaults to 5
- Mount allowlist at `~/.config/nanoclaw/mount-allowlist.json`
- `CONTAINER_TIMEOUT` defaults to 30min — may need tuning for research agents
