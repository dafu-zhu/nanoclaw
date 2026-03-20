import fs from 'fs';
import path from 'path';

import {
  ASSISTANT_NAME,
  CREDENTIAL_PROXY_PORT,
  IDLE_TIMEOUT,
  POLL_INTERVAL,
  TELEGRAM_BOT_POOL,
  TIMEZONE,
  TRIGGER_PATTERN,
} from './config.js';
import { initBotPool, sendPoolMessage } from './channels/telegram.js';
import { parseImageReferences } from './image.js';
import { startCredentialProxy } from './credential-proxy.js';
import './channels/index.js';
import {
  getChannelFactory,
  getRegisteredChannelNames,
} from './channels/registry.js';
import {
  ContainerOutput,
  runContainerAgent,
  writeGroupsSnapshot,
  writeTasksSnapshot,
} from './container-runner.js';
import {
  cleanupOrphans,
  ensureContainerRuntimeRunning,
  PROXY_BIND_HOST,
} from './container-runtime.js';
import {
  getAllChats,
  getAllRegisteredGroups,
  getAllSessions,
  getAllTasks,
  getMessagesSince,
  getNewMessages,
  getRegisteredGroup,
  getRouterState,
  initDatabase,
  setRegisteredGroup,
  setRouterState,
  setSession,
  storeChatMetadata,
  storeMessage,
} from './db.js';
import { GroupQueue } from './group-queue.js';
import { resolveGroupFolderPath } from './group-folder.js';
import { startIpcWatcher } from './ipc.js';
import { findChannel, formatMessages, formatOutbound } from './router.js';
import {
  restoreRemoteControl,
  startRemoteControl,
  stopRemoteControl,
} from './remote-control.js';
import {
  isSenderAllowed,
  isTriggerAllowed,
  loadSenderAllowlist,
  shouldDropMessage,
} from './sender-allowlist.js';
import {
  extractSessionCommand,
  handleSessionCommand,
  isSessionCommandAllowed,
} from './session-commands.js';
import { startSchedulerLoop } from './task-scheduler.js';
import { Channel, NewMessage, RegisteredGroup } from './types.js';
import { logger } from './logger.js';

// Re-export for backwards compatibility during refactor
export { escapeXml, formatMessages } from './router.js';

let lastTimestamp = '';
let sessions: Record<string, string> = {};
let registeredGroups: Record<string, RegisteredGroup> = {};
let lastAgentTimestamp: Record<string, string> = {};
let messageLoopRunning = false;

const channels: Channel[] = [];
const queue = new GroupQueue();

function loadState(): void {
  lastTimestamp = getRouterState('last_timestamp') || '';
  const agentTs = getRouterState('last_agent_timestamp');
  try {
    lastAgentTimestamp = agentTs ? JSON.parse(agentTs) : {};
  } catch {
    logger.warn('Corrupted last_agent_timestamp in DB, resetting');
    lastAgentTimestamp = {};
  }
  sessions = getAllSessions();
  registeredGroups = getAllRegisteredGroups();
  logger.info(
    { groupCount: Object.keys(registeredGroups).length },
    'State loaded',
  );
}

function saveState(): void {
  setRouterState('last_timestamp', lastTimestamp);
  setRouterState('last_agent_timestamp', JSON.stringify(lastAgentTimestamp));
}

function registerGroup(jid: string, group: RegisteredGroup): void {
  let groupDir: string;
  try {
    groupDir = resolveGroupFolderPath(group.folder);
  } catch (err) {
    logger.warn(
      { jid, folder: group.folder, err },
      'Rejecting group registration with invalid folder',
    );
    return;
  }

  registeredGroups[jid] = group;
  setRegisteredGroup(jid, group);

  // Create group folder
  fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });

  logger.info(
    { jid, name: group.name, folder: group.folder },
    'Group registered',
  );
}

/**
 * Get available groups list for the agent.
 * Returns groups ordered by most recent activity.
 */
export function getAvailableGroups(): import('./container-runner.js').AvailableGroup[] {
  const chats = getAllChats();
  const registeredJids = new Set(Object.keys(registeredGroups));

  return chats
    .filter((c) => c.jid !== '__group_sync__' && c.is_group)
    .map((c) => ({
      jid: c.jid,
      name: c.name,
      lastActivity: c.last_message_time,
      isRegistered: registeredJids.has(c.jid),
    }));
}

/** @internal - exported for testing */
export function _setRegisteredGroups(
  groups: Record<string, RegisteredGroup>,
): void {
  registeredGroups = groups;
}

/**
 * Process all pending messages for a group.
 * Called by the GroupQueue when it's this group's turn.
 */
async function processGroupMessages(chatJid: string): Promise<boolean> {
  // Virtual JIDs represent shared-group agents — dispatch separately
  if (isVirtualJid(chatJid)) {
    return processSharedAgentMessages(chatJid);
  }

  const group = registeredGroups[chatJid];
  if (!group) return true;

  const channel = findChannel(channels, chatJid);
  if (!channel) {
    logger.warn({ chatJid }, 'No channel owns JID, skipping messages');
    return true;
  }

  const isMainGroup = group.isMain === true;

  const sinceTimestamp = lastAgentTimestamp[chatJid] || '';
  const missedMessages = getMessagesSince(
    chatJid,
    sinceTimestamp,
    ASSISTANT_NAME,
  );

  if (missedMessages.length === 0) return true;

  // --- Session command interception (before trigger check) ---
  const cmdResult = await handleSessionCommand({
    missedMessages,
    isMainGroup,
    groupName: group.name,
    triggerPattern: TRIGGER_PATTERN,
    timezone: TIMEZONE,
    deps: {
      sendMessage: (text) => channel.sendMessage(chatJid, text),
      setTyping: (typing) =>
        channel.setTyping?.(chatJid, typing) ?? Promise.resolve(),
      runAgent: (prompt, onOutput) =>
        runAgent(group, prompt, chatJid, onOutput),
      closeStdin: () => queue.closeStdin(chatJid),
      advanceCursor: (ts) => {
        lastAgentTimestamp[chatJid] = ts;
        saveState();
      },
      formatMessages,
      canSenderInteract: (msg) => {
        const hasTrigger = TRIGGER_PATTERN.test(msg.content.trim());
        const reqTrigger = !isMainGroup && group.requiresTrigger !== false;
        return (
          isMainGroup ||
          !reqTrigger ||
          (hasTrigger &&
            (msg.is_from_me ||
              isTriggerAllowed(chatJid, msg.sender, loadSenderAllowlist())))
        );
      },
    },
  });
  if (cmdResult.handled) return cmdResult.success;
  // --- End session command interception ---

  // For non-main groups, check if trigger is required and present
  if (!isMainGroup && group.requiresTrigger !== false) {
    const allowlistCfg = loadSenderAllowlist();
    const hasTrigger = missedMessages.some(
      (m) =>
        TRIGGER_PATTERN.test(m.content.trim()) &&
        (m.is_from_me || isTriggerAllowed(chatJid, m.sender, allowlistCfg)),
    );
    if (!hasTrigger) {
      return true;
    }
  }

  const prompt = formatMessages(missedMessages, TIMEZONE);
  const imageAttachments = parseImageReferences(missedMessages);

  // Advance cursor so the piping path in startMessageLoop won't re-fetch
  // these messages. Save the old cursor so we can roll back on error.
  const previousCursor = lastAgentTimestamp[chatJid] || '';
  lastAgentTimestamp[chatJid] =
    missedMessages[missedMessages.length - 1].timestamp;
  saveState();

  logger.info(
    { group: group.name, messageCount: missedMessages.length },
    'Processing messages',
  );

  // Track idle timer for closing stdin when agent is idle
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      logger.debug(
        { group: group.name },
        'Idle timeout, closing container stdin',
      );
      queue.closeStdin(chatJid);
    }, IDLE_TIMEOUT);
  };

  await channel.setTyping?.(chatJid, true);
  let hadError = false;
  let outputSentToUser = false;

  const output = await runAgent(
    group,
    prompt,
    chatJid,
    async (result) => {
      // Streaming output callback — called for each agent result
      if (result.result) {
        const raw =
          typeof result.result === 'string'
            ? result.result
            : JSON.stringify(result.result);
        // Strip <internal>...</internal> blocks — agent uses these for internal reasoning
        const text = raw.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
        logger.info(
          { group: group.name },
          `Agent output: ${raw.slice(0, 200)}`,
        );
        if (text) {
          await channel.sendMessage(chatJid, text);
          outputSentToUser = true;
        }
        // Only reset idle timer on actual results, not session-update markers (result: null)
        resetIdleTimer();
      }

      if (result.status === 'success') {
        queue.notifyIdle(chatJid);
      }

      if (result.status === 'error') {
        hadError = true;
      }
    },
    undefined,
    imageAttachments,
  );

  await channel.setTyping?.(chatJid, false);
  if (idleTimer) clearTimeout(idleTimer);

  if (output === 'error' || hadError) {
    // If we already sent output to the user, don't roll back the cursor —
    // the user got their response and re-processing would send duplicates.
    if (outputSentToUser) {
      logger.warn(
        { group: group.name },
        'Agent error after output was sent, skipping cursor rollback to prevent duplicates',
      );
      return true;
    }
    // Roll back cursor so retries can re-process these messages
    lastAgentTimestamp[chatJid] = previousCursor;
    saveState();
    logger.warn(
      { group: group.name },
      'Agent error, rolled back message cursor for retry',
    );
    return false;
  }

  return true;
}

// --- TD-002: per-agent @mention routing helpers ---

const triggerPatternCache = new Map<string, RegExp>();

/** Build (and cache) a trigger RegExp for a shared-group agent (e.g. 'Skirk' → /@Skirk\b/i). */
function makeTriggerPattern(agentName: string): RegExp {
  let pat = triggerPatternCache.get(agentName);
  if (!pat) {
    pat = new RegExp(
      `@${agentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
      'i',
    );
    triggerPatternCache.set(agentName, pat);
  }
  return pat;
}

/** Virtual JID for shared-group agents: `virtual:{folder}` */
export function virtualJid(folder: string): string {
  return `virtual:${folder}`;
}

export function isVirtualJid(jid: string): boolean {
  return jid.startsWith('virtual:');
}

/**
 * Process messages for a shared-group agent (registered under a virtual JID).
 * Reads messages from the physical group JID, checks for the agent's @trigger,
 * and dispatches the agent's container when triggered.
 */
async function processSharedAgentMessages(vJid: string): Promise<boolean> {
  const agentGroup = registeredGroups[vJid];
  if (!agentGroup?.sharedGroupJid || !agentGroup.agentTrigger) return true;

  const physicalJid = agentGroup.sharedGroupJid;
  const channel = findChannel(channels, physicalJid);
  if (!channel) {
    logger.warn({ vJid }, 'No channel for shared agent physical JID, skipping');
    return true;
  }

  const triggerPattern = makeTriggerPattern(agentGroup.agentTrigger);
  const sinceTimestamp = lastAgentTimestamp[vJid] || '';
  const missedMessages = getMessagesSince(
    physicalJid,
    sinceTimestamp,
    ASSISTANT_NAME,
  );

  logger.debug(
    { vJid, sinceTimestamp, missedCount: missedMessages.length },
    'processSharedAgentMessages: checking messages',
  );
  if (missedMessages.length === 0) return true;

  const allowlistCfg = loadSenderAllowlist();
  const hasTrigger = missedMessages.some(
    (m) =>
      triggerPattern.test(m.content.trim()) &&
      (m.is_from_me || isTriggerAllowed(physicalJid, m.sender, allowlistCfg)),
  );
  logger.debug(
    { vJid, hasTrigger, sample: missedMessages[0]?.content },
    'processSharedAgentMessages: trigger check',
  );
  if (!hasTrigger) return true;

  const prompt = formatMessages(missedMessages, TIMEZONE);
  const imageAttachments = parseImageReferences(missedMessages);
  const previousCursor = lastAgentTimestamp[vJid] || '';
  lastAgentTimestamp[vJid] =
    missedMessages[missedMessages.length - 1].timestamp;
  saveState();

  logger.info(
    { agent: agentGroup.name, messageCount: missedMessages.length },
    'Dispatching shared agent',
  );

  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => queue.closeStdin(vJid), IDLE_TIMEOUT);
  };

  await channel.setTyping?.(physicalJid, true);
  let hadError = false;
  let outputSentToUser = false;

  await runAgent(
    agentGroup,
    prompt,
    physicalJid,
    async (result) => {
      if (result.result) {
        const raw =
          typeof result.result === 'string'
            ? result.result
            : JSON.stringify(result.result);
        const text = raw.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
        if (text) {
          const poolBotToken = agentGroup.containerConfig?.poolBotToken;
          if (poolBotToken) {
            const fallback = (j: string, t: string) =>
              channel.sendMessage(j, t);
            await sendPoolMessage(
              physicalJid,
              text,
              agentGroup.name,
              agentGroup.folder,
              fallback,
              poolBotToken,
            );
          } else if (!vJid.startsWith('virtual:')) {
            // Non-virtual agent (direct JID) — send via main bot
            await channel.sendMessage(physicalJid, text);
          }
          // Virtual agent with no pool token: skip send — agent is internal only
          outputSentToUser = true;
        }
        resetIdleTimer();
      }
      if (result.status === 'success') queue.notifyIdle(vJid);
      if (result.status === 'error') hadError = true;
    },
    vJid,
    imageAttachments,
  );

  await channel.setTyping?.(physicalJid, false);
  if (idleTimer) clearTimeout(idleTimer);

  if (hadError) {
    if (outputSentToUser) return true;
    lastAgentTimestamp[vJid] = previousCursor;
    saveState();
    logger.warn(
      { agent: agentGroup.name },
      'Shared agent error, rolled back cursor',
    );
    return false;
  }

  return true;
}

async function runAgent(
  group: RegisteredGroup,
  prompt: string,
  chatJid: string,
  onOutput?: (output: ContainerOutput) => Promise<void>,
  queueKey?: string, // queue/state key when different from chatJid (shared group agents)
  imageAttachments?: Array<{ relativePath: string; mediaType: string }>,
): Promise<'success' | 'error'> {
  const isMain = group.isMain === true;
  const sessionId = sessions[group.folder];

  // Update tasks snapshot for container to read (filtered by group)
  const tasks = getAllTasks();
  writeTasksSnapshot(
    group.folder,
    isMain,
    tasks.map((t) => ({
      id: t.id,
      groupFolder: t.group_folder,
      prompt: t.prompt,
      schedule_type: t.schedule_type,
      schedule_value: t.schedule_value,
      status: t.status,
      next_run: t.next_run,
    })),
  );

  // Update available groups snapshot (main group only can see all groups)
  const availableGroups = getAvailableGroups();
  writeGroupsSnapshot(
    group.folder,
    isMain,
    availableGroups,
    new Set(Object.keys(registeredGroups)),
  );

  // Wrap onOutput to track session ID from streamed results
  const wrappedOnOutput = onOutput
    ? async (output: ContainerOutput) => {
        if (output.newSessionId) {
          sessions[group.folder] = output.newSessionId;
          setSession(group.folder, output.newSessionId);
        }
        await onOutput(output);
      }
    : undefined;

  try {
    const output = await runContainerAgent(
      group,
      {
        prompt,
        sessionId,
        groupFolder: group.folder,
        chatJid,
        isMain,
        assistantName: ASSISTANT_NAME,
        ...(imageAttachments?.length && { imageAttachments }),
      },
      (proc, containerName) =>
        queue.registerProcess(
          queueKey ?? chatJid,
          proc,
          containerName,
          group.folder,
        ),
      wrappedOnOutput,
    );

    if (output.newSessionId) {
      sessions[group.folder] = output.newSessionId;
      setSession(group.folder, output.newSessionId);
    }

    if (output.status === 'error') {
      logger.error(
        { group: group.name, error: output.error },
        'Container agent error',
      );
      return 'error';
    }

    return 'success';
  } catch (err) {
    logger.error({ group: group.name, err }, 'Agent error');
    return 'error';
  }
}

async function startMessageLoop(): Promise<void> {
  if (messageLoopRunning) {
    logger.debug('Message loop already running, skipping duplicate start');
    return;
  }
  messageLoopRunning = true;

  logger.info(`NanoClaw running (trigger: @${ASSISTANT_NAME})`);

  while (true) {
    try {
      // Poll physical JIDs + any sharedGroupJids (e.g. Teyvat LLC) that virtual agents listen on
      const physicalJids = Object.keys(registeredGroups).filter(
        (j) => !isVirtualJid(j),
      );
      const sharedPhysicalJids = [
        ...new Set(
          Object.values(registeredGroups)
            .map((g) => g.sharedGroupJid)
            .filter((jid): jid is string => !!jid),
        ),
      ];
      const jids = [...new Set([...physicalJids, ...sharedPhysicalJids])];
      const { messages, newTimestamp } = getNewMessages(
        jids,
        lastTimestamp,
        ASSISTANT_NAME,
      );

      if (messages.length > 0) {
        logger.info({ count: messages.length }, 'New messages');

        // Advance the "seen" cursor for all messages immediately
        lastTimestamp = newTimestamp;
        saveState();

        // Deduplicate by group
        const messagesByGroup = new Map<string, NewMessage[]>();
        for (const msg of messages) {
          const existing = messagesByGroup.get(msg.chat_jid);
          if (existing) {
            existing.push(msg);
          } else {
            messagesByGroup.set(msg.chat_jid, [msg]);
          }
        }

        for (const [chatJid, groupMessages] of messagesByGroup) {
          const group = registeredGroups[chatJid];
          if (!group) {
            // chatJid is an unregistered sharedGroupJid (e.g. Teyvat LLC) —
            // pipe to active containers directly; trigger-gate new ones with @AgentName
            const allowlist = loadSenderAllowlist();
            const sharedChannel = findChannel(channels, chatJid);
            for (const [vJid, agentGroup] of Object.entries(registeredGroups)) {
              if (
                agentGroup.sharedGroupJid !== chatJid ||
                !agentGroup.agentTrigger
              )
                continue;
              const pat = makeTriggerPattern(agentGroup.agentTrigger);
              const thisTriggered = groupMessages.some(
                (m) =>
                  pat.test(m.content.trim()) &&
                  (m.is_from_me ||
                    isTriggerAllowed(chatJid, m.sender, allowlist)),
              );
              // Skip if message explicitly targets a different agent (not this one)
              const otherAgentTriggered =
                !thisTriggered &&
                Object.entries(registeredGroups).some(
                  ([otherVJid, g]) =>
                    otherVJid !== vJid &&
                    g.sharedGroupJid === chatJid &&
                    g.agentTrigger &&
                    groupMessages.some(
                      (m) =>
                        makeTriggerPattern(g.agentTrigger!).test(
                          m.content.trim(),
                        ) &&
                        (m.is_from_me ||
                          isTriggerAllowed(chatJid, m.sender, allowlist)),
                    ),
                );
              if (otherAgentTriggered) continue;
              const agentPending = getMessagesSince(
                chatJid,
                lastAgentTimestamp[vJid] || '',
                ASSISTANT_NAME,
              );
              const agentMessages =
                agentPending.length > 0 ? agentPending : groupMessages;
              const agentFormatted = formatMessages(agentMessages, TIMEZONE);
              if (queue.sendMessage(vJid, agentFormatted)) {
                // Active container — pipe follow-up directly (no @ needed)
                lastAgentTimestamp[vJid] =
                  agentMessages[agentMessages.length - 1].timestamp;
                saveState();
                sharedChannel
                  ?.setTyping?.(chatJid, true)
                  ?.catch((err) =>
                    logger.warn(
                      { chatJid, vJid, err },
                      'Failed to set typing for shared agent',
                    ),
                  );
              } else {
                // No active container — only start if @AgentName present
                if (thisTriggered) queue.enqueueMessageCheck(vJid);
              }
            }
            continue;
          }

          const channel = findChannel(channels, chatJid);
          if (!channel) {
            logger.warn({ chatJid }, 'No channel owns JID, skipping messages');
            continue;
          }

          const isMainGroup = group.isMain === true;

          // --- Session command interception (message loop) ---
          // Scan ALL messages in the batch for a session command.
          const loopCmdMsg = groupMessages.find(
            (m) => extractSessionCommand(m.content, TRIGGER_PATTERN) !== null,
          );

          if (loopCmdMsg) {
            // Only close active container if the sender is authorized — otherwise an
            // untrusted user could kill in-flight work by sending /compact (DoS).
            // closeStdin no-ops internally when no container is active.
            if (
              isSessionCommandAllowed(
                isMainGroup,
                loopCmdMsg.is_from_me === true,
              )
            ) {
              queue.closeStdin(chatJid);
            }
            // Enqueue so processGroupMessages handles auth + cursor advancement.
            // Don't pipe via IPC — slash commands need a fresh container with
            // string prompt (not MessageStream) for SDK recognition.
            queue.enqueueMessageCheck(chatJid);
            continue;
          }
          // --- End session command interception ---

          const needsTrigger = !isMainGroup && group.requiresTrigger !== false;

          // For non-main groups, only act on trigger messages.
          // Non-trigger messages accumulate in DB and get pulled as
          // context when a trigger eventually arrives.
          if (needsTrigger) {
            const allowlistCfg = loadSenderAllowlist();
            const hasTrigger = groupMessages.some(
              (m) =>
                TRIGGER_PATTERN.test(m.content.trim()) &&
                (m.is_from_me ||
                  isTriggerAllowed(chatJid, m.sender, allowlistCfg)),
            );
            if (!hasTrigger) continue;
          }

          // Pull all messages since lastAgentTimestamp so non-trigger
          // context that accumulated between triggers is included.
          const allPending = getMessagesSince(
            chatJid,
            lastAgentTimestamp[chatJid] || '',
            ASSISTANT_NAME,
          );
          const messagesToSend =
            allPending.length > 0 ? allPending : groupMessages;
          const formatted = formatMessages(messagesToSend, TIMEZONE);

          if (queue.sendMessage(chatJid, formatted)) {
            logger.debug(
              { chatJid, count: messagesToSend.length },
              'Piped messages to active container',
            );
            lastAgentTimestamp[chatJid] =
              messagesToSend[messagesToSend.length - 1].timestamp;
            saveState();
            // Show typing indicator while the container processes the piped message
            channel
              .setTyping?.(chatJid, true)
              ?.catch((err) =>
                logger.warn({ chatJid, err }, 'Failed to set typing indicator'),
              );
          } else {
            // No active container — enqueue for a new one
            queue.enqueueMessageCheck(chatJid);
          }

          // --- TD-002: dispatch shared-group agents (@AgentName routing) ---
          // For each agent registered to this physical JID, check if their
          // trigger appears in the incoming messages and enqueue them.
          const allowlistCfg = loadSenderAllowlist();
          for (const [vJid, agentGroup] of Object.entries(registeredGroups)) {
            if (
              agentGroup.sharedGroupJid !== chatJid ||
              !agentGroup.agentTrigger
            )
              continue;
            const agentTriggerPattern = makeTriggerPattern(
              agentGroup.agentTrigger,
            );
            const agentTriggered = groupMessages.some(
              (m) =>
                agentTriggerPattern.test(m.content.trim()) &&
                (m.is_from_me ||
                  isTriggerAllowed(chatJid, m.sender, allowlistCfg)),
            );
            if (!agentTriggered) continue;

            // Try to pipe to an active container for this agent
            const agentPending = getMessagesSince(
              chatJid,
              lastAgentTimestamp[vJid] || '',
              ASSISTANT_NAME,
            );
            const agentMessages =
              agentPending.length > 0 ? agentPending : groupMessages;
            const agentFormatted = formatMessages(agentMessages, TIMEZONE);

            if (queue.sendMessage(vJid, agentFormatted)) {
              lastAgentTimestamp[vJid] =
                agentMessages[agentMessages.length - 1].timestamp;
              saveState();
              channel
                .setTyping?.(chatJid, true)
                ?.catch((err) =>
                  logger.warn(
                    { chatJid, vJid, err },
                    'Failed to set typing indicator for shared agent',
                  ),
                );
            } else {
              queue.enqueueMessageCheck(vJid);
            }
          }
          // --- End TD-002 dispatch ---
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error in message loop');
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

/**
 * Startup recovery: check for unprocessed messages in registered groups.
 * Handles crash between advancing lastTimestamp and processing messages.
 */
function recoverPendingMessages(): void {
  for (const [jid, group] of Object.entries(registeredGroups)) {
    // For shared-group agents, read from the physical JID but track cursor by virtual JID
    const physicalJid = group.sharedGroupJid ?? jid;
    const sinceTimestamp = lastAgentTimestamp[jid] || '';
    const pending = getMessagesSince(
      physicalJid,
      sinceTimestamp,
      ASSISTANT_NAME,
    );
    if (pending.length > 0) {
      // For shared agents, only recover if the agent's trigger is still present
      if (group.sharedGroupJid && group.agentTrigger) {
        const tp = makeTriggerPattern(group.agentTrigger);
        if (!pending.some((m) => tp.test(m.content.trim()))) continue;
      }
      logger.info(
        { group: group.name, pendingCount: pending.length },
        'Recovery: found unprocessed messages',
      );
      queue.enqueueMessageCheck(jid);
    }
  }
}

/**
 * Activate an agent by folder name from an inter-agent IPC message.
 * If already running, pollIpcDuringQuery picks up the message automatically.
 * If idle, spawn a container with a synthetic prompt — the agent runner
 * drains /workspace/ipc/input/ at startup and gets the real content.
 */
function activateAgentByFolder(folder: string): void {
  const entry = Object.entries(registeredGroups).find(
    ([_, g]) => g.folder === folder,
  );
  if (!entry) {
    logger.warn(
      { folder },
      'activateAgent: folder not found in registered groups',
    );
    return;
  }
  const [jid, group] = entry;

  // If active, pollIpcDuringQuery (500ms poll) handles it automatically
  if (queue.isActive(jid)) {
    logger.debug(
      { folder, jid },
      'Agent active, inter-agent message will be polled',
    );
    return;
  }

  const chatJid = group.sharedGroupJid ?? jid;
  const queueKey = jid;
  const taskId = `ipc-activate-${folder}-${Date.now()}`;

  queue.enqueueTask(queueKey, taskId, async () => {
    const channel = findChannel(channels, chatJid);
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => queue.closeStdin(queueKey), IDLE_TIMEOUT);
    };

    await runAgent(
      group,
      '[SYSTEM: Inter-agent message waiting in your input queue. Read it now. You MUST reply using mcp__nanoclaw__send_to_agent — that is the only way your reply reaches the other agent. Plain text output and send_message do NOT reach them. Check /workspace/group/pending-collab.md for context if available.]',
      chatJid,
      async (result) => {
        // Send text output to Telegram so the user can observe the exchange.
        // Agents should also use send_to_agent to route replies back to each other.
        if (result.result) {
          const raw =
            typeof result.result === 'string'
              ? result.result
              : JSON.stringify(result.result);
          const text = raw
            .replace(/<internal>[\s\S]*?<\/internal>/g, '')
            .trim();
          if (text && channel) {
            const poolBotToken = group.containerConfig?.poolBotToken;
            if (poolBotToken && jid.startsWith('virtual:')) {
              const fallback = (j: string, t: string) =>
                channel.sendMessage(j, t);
              await sendPoolMessage(
                chatJid,
                text,
                group.name,
                group.folder,
                fallback,
                poolBotToken,
              );
            } else if (!jid.startsWith('virtual:')) {
              // Non-virtual agent — send via main bot
              await channel.sendMessage(chatJid, text);
            }
            // Virtual agent with no pool token: skip — internal only
          }
          resetIdleTimer();
        }
        if (result.status === 'success') queue.notifyIdle(queueKey);
      },
      jid.startsWith('virtual:') ? jid : undefined,
    );

    if (idleTimer) clearTimeout(idleTimer);
  });
}

function ensureContainerSystemRunning(): void {
  ensureContainerRuntimeRunning();
  cleanupOrphans();
}

async function main(): Promise<void> {
  ensureContainerSystemRunning();
  initDatabase();
  logger.info('Database initialized');
  loadState();
  restoreRemoteControl();

  // Start credential proxy (containers route API calls through this)
  const proxyServer = await startCredentialProxy(
    CREDENTIAL_PROXY_PORT,
    PROXY_BIND_HOST,
  );

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    proxyServer.close();
    await queue.shutdown(10000);
    for (const ch of channels) await ch.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle /remote-control and /remote-control-end commands
  async function handleRemoteControl(
    command: string,
    chatJid: string,
    msg: NewMessage,
  ): Promise<void> {
    const group = registeredGroups[chatJid];
    if (!group?.isMain) {
      logger.warn(
        { chatJid, sender: msg.sender },
        'Remote control rejected: not main group',
      );
      return;
    }

    const channel = findChannel(channels, chatJid);
    if (!channel) return;

    if (command === '/remote-control') {
      const result = await startRemoteControl(
        msg.sender,
        chatJid,
        process.cwd(),
      );
      if (result.ok) {
        await channel.sendMessage(chatJid, result.url);
      } else {
        await channel.sendMessage(
          chatJid,
          `Remote Control failed: ${result.error}`,
        );
      }
    } else {
      const result = stopRemoteControl();
      if (result.ok) {
        await channel.sendMessage(chatJid, 'Remote Control session ended.');
      } else {
        await channel.sendMessage(chatJid, result.error);
      }
    }
  }

  // Channel callbacks (shared by all channels)
  const channelOpts = {
    onMessage: (chatJid: string, msg: NewMessage) => {
      // Remote control commands — intercept before storage
      const trimmed = msg.content.trim();
      if (trimmed === '/remote-control' || trimmed === '/remote-control-end') {
        handleRemoteControl(trimmed, chatJid, msg).catch((err) =>
          logger.error({ err, chatJid }, 'Remote control command error'),
        );
        return;
      }

      // Sender allowlist drop mode: discard messages from denied senders before storing
      if (!msg.is_from_me && !msg.is_bot_message && registeredGroups[chatJid]) {
        const cfg = loadSenderAllowlist();
        if (
          shouldDropMessage(chatJid, cfg) &&
          !isSenderAllowed(chatJid, msg.sender, cfg)
        ) {
          if (cfg.logDenied) {
            logger.debug(
              { chatJid, sender: msg.sender },
              'sender-allowlist: dropping message (drop mode)',
            );
          }
          return;
        }
      }
      storeMessage(msg);
    },
    onChatMetadata: (
      chatJid: string,
      timestamp: string,
      name?: string,
      channel?: string,
      isGroup?: boolean,
    ) => storeChatMetadata(chatJid, timestamp, name, channel, isGroup),
    registeredGroups: () => registeredGroups,
  };

  // Create and connect all registered channels.
  // Each channel self-registers via the barrel import above.
  // Factories return null when credentials are missing, so unconfigured channels are skipped.
  for (const channelName of getRegisteredChannelNames()) {
    const factory = getChannelFactory(channelName)!;
    const channel = factory(channelOpts);
    if (!channel) {
      logger.warn(
        { channel: channelName },
        'Channel installed but credentials missing — skipping. Check .env or re-run the channel skill.',
      );
      continue;
    }
    channels.push(channel);
    await channel.connect();
  }
  if (channels.length === 0) {
    logger.fatal('No channels connected');
    process.exit(1);
  }

  // Start subsystems (independently of connection handler)
  startSchedulerLoop({
    registeredGroups: () => registeredGroups,
    getSessions: () => sessions,
    queue,
    onProcess: (groupJid, proc, containerName, groupFolder) =>
      queue.registerProcess(groupJid, proc, containerName, groupFolder),
    sendMessage: async (jid, rawText, groupFolder) => {
      const channel = findChannel(channels, jid);
      if (!channel) {
        logger.warn({ jid }, 'No channel owns JID, cannot send message');
        return;
      }
      const text = formatOutbound(rawText);
      if (!text) return;
      // Use pool bot for virtual/shared-group agents so the message
      // appears under the agent's name rather than the main bot.
      if (groupFolder) {
        const group = Object.values(registeredGroups).find(
          (g) => g.folder === groupFolder,
        );
        const poolBotToken = group?.containerConfig?.poolBotToken;
        if (poolBotToken && group?.sharedGroupJid) {
          const fallback = (j: string, t: string) => channel.sendMessage(j, t);
          await sendPoolMessage(
            jid,
            text,
            group.name,
            group.folder,
            fallback,
            poolBotToken,
          );
          return;
        }
      }
      await channel.sendMessage(jid, text);
    },
  });
  if (TELEGRAM_BOT_POOL.length > 0) {
    await initBotPool(TELEGRAM_BOT_POOL);
  }

  startIpcWatcher({
    sendMessage: async (jid, text, sender, groupFolder, poolBotToken) => {
      const channel = findChannel(channels, jid);
      if (!channel) throw new Error(`No channel for JID: ${jid}`);
      if (sender && groupFolder && jid.startsWith('tg:')) {
        const fallback = (j: string, t: string) => channel.sendMessage(j, t);
        return sendPoolMessage(
          jid,
          text,
          sender,
          groupFolder,
          fallback,
          poolBotToken,
        );
      }
      return channel.sendMessage(jid, text);
    },
    registeredGroups: () => registeredGroups,
    registerGroup,
    syncGroups: async (force: boolean) => {
      await Promise.all(
        channels
          .filter((ch) => ch.syncGroups)
          .map((ch) => ch.syncGroups!(force)),
      );
    },
    getAvailableGroups,
    writeGroupsSnapshot: (gf, im, ag, rj) =>
      writeGroupsSnapshot(gf, im, ag, rj),
    activateAgent: activateAgentByFolder,
    onTasksChanged: () => {
      const tasks = getAllTasks();
      const taskRows = tasks.map((t) => ({
        id: t.id,
        groupFolder: t.group_folder,
        prompt: t.prompt,
        schedule_type: t.schedule_type,
        schedule_value: t.schedule_value,
        status: t.status,
        next_run: t.next_run,
      }));
      for (const group of Object.values(registeredGroups)) {
        writeTasksSnapshot(group.folder, group.isMain === true, taskRows);
      }
    },
  });
  queue.setProcessMessagesFn(processGroupMessages);
  recoverPendingMessages();
  startMessageLoop().catch((err) => {
    logger.fatal({ err }, 'Message loop crashed unexpectedly');
    process.exit(1);
  });
}

// Guard: only run when executed directly, not when imported by tests
const isDirectRun =
  process.argv[1] &&
  new URL(import.meta.url).pathname ===
    new URL(`file://${process.argv[1]}`).pathname;

if (isDirectRun) {
  main().catch((err) => {
    logger.error({ err }, 'Failed to start NanoClaw');
    process.exit(1);
  });
}
