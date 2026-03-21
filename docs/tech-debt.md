# Tech Debt

Reference by TD-XXX when working on them.

## TD-001: Admin privilege for Alhaitham [DONE]

`isAdmin?: boolean` in `ContainerConfig`. Injects `NANOCLAW_IS_ADMIN=1`; `register_group` guard changed to `if (!isMain && !isAdmin)`. Schema expanded with `agentTrigger`, `sharedGroupJid`, `containerConfig` fields. Alhaitham's DB row has `isAdmin: true`.

## TD-002: Per-agent triggers (@AgentName routing) [DONE]

**Files:** `src/types.ts`, `src/db.ts`, `src/index.ts`

Shared-group dispatch. Agents in "Teyvat LLC" registered with virtual JIDs (`virtual:{folder}`) and:
- `agentTrigger`: character name the agent responds to
- `sharedGroupJid`: physical Telegram JID of the shared group

Registration example (send from main):
```
register_group({
  jid: "virtual:telegram_skirk",
  name: "Skirk",
  folder: "telegram_skirk",
  trigger: "@Skirk",
  agentTrigger: "Skirk",
  sharedGroupJid: "tg:-1234567890"
})
```

## TD-003: Nahida read-only access to all agent workspaces [DONE]

`mountAllGroups?: boolean` in `ContainerConfig`. Mounts every group folder read-only at `/workspace/extra/{folder}/`. Nahida's DB row has `mountAllGroups: true`.

## TD-004: Inter-agent messaging — send_to_agent [DONE]

MCP tool `send_to_agent(target_folder, text, sender?)`. Writes to target's `data/ipc/{folder}/input/`. Delivered immediately if target running, otherwise on next activation.

## TD-005: Alhaitham read access to all TA workspaces [DONE]

Same as TD-003. Alhaitham's DB row has `"mountAllGroups":true`.

## TD-006: Alhaitham bot token [DONE]

Bot `nanoclaw_alhaitham_bot` created. 5th entry in `.env` `TELEGRAM_BOT_POOL`.

**Remaining:** Set profile photo — `bash scripts/set-bot-photos.sh alhaitham` (enka key: `Alhatham`)

## TD-007: Agent workspace cleanup on archival [MEDIUM]

Move archived agents to `groups/_archived/{quarter}/` and `data/sessions/_archived/{quarter}/`. DB: mark `is_archived = 1`. Alhaitham handles as part of quarter transition.

## TD-008: Agent collaboration visualization [LOW]

Read-only Telegram channel with narrator bot posting status events via `post_status` MCP tool. TD-002 already provides layer-1 visibility.
