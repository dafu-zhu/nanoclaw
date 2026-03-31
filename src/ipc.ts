import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

import { CronExpressionParser } from 'cron-parser';

import { DATA_DIR, GROUPS_DIR, IPC_POLL_INTERVAL, TIMEZONE } from './config.js';
import { AvailableGroup } from './container-runner.js';
import {
  createTask,
  deleteTask,
  getTaskById,
  patchAgentToken,
  patchContainerConfig,
  updateTask,
} from './db.js';
import { isValidGroupFolder, resolveGroupIpcPath } from './group-folder.js';
import { logger } from './logger.js';
import { RegisteredGroup } from './types.js';

export interface IpcDeps {
  sendMessage: (
    jid: string,
    text: string,
    sender?: string,
    groupFolder?: string,
    poolBotToken?: string,
  ) => Promise<void>;
  sendFile: (
    jid: string,
    hostFilePath: string,
    caption?: string,
    poolBotToken?: string,
  ) => Promise<void>;
  registeredGroups: () => Record<string, RegisteredGroup>;
  registerGroup: (jid: string, group: RegisteredGroup) => void;
  syncGroups: (force: boolean) => Promise<void>;
  getAvailableGroups: () => AvailableGroup[];
  writeGroupsSnapshot: (
    groupFolder: string,
    isMain: boolean,
    availableGroups: AvailableGroup[],
    registeredJids: Set<string>,
  ) => void;
  onTasksChanged: () => void;
  activateAgent: (folder: string) => void;
}

let ipcWatcherRunning = false;

export function startIpcWatcher(deps: IpcDeps): void {
  if (ipcWatcherRunning) {
    logger.debug('IPC watcher already running, skipping duplicate start');
    return;
  }
  ipcWatcherRunning = true;

  const ipcBaseDir = path.join(DATA_DIR, 'ipc');
  fs.mkdirSync(ipcBaseDir, { recursive: true });

  const processIpcFiles = async () => {
    // Scan all group IPC directories (identity determined by directory)
    let groupFolders: string[];
    try {
      groupFolders = fs.readdirSync(ipcBaseDir).filter((f) => {
        const stat = fs.statSync(path.join(ipcBaseDir, f));
        return stat.isDirectory() && f !== 'errors';
      });
    } catch (err) {
      logger.error({ err }, 'Error reading IPC base directory');
      setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
      return;
    }

    const registeredGroups = deps.registeredGroups();

    // Build folder→isMain and folder→isAdmin lookups from registered groups
    const folderIsMain = new Map<string, boolean>();
    const folderIsAdmin = new Map<string, boolean>();
    for (const group of Object.values(registeredGroups)) {
      if (group.isMain) folderIsMain.set(group.folder, true);
      if (group.containerConfig?.isAdmin) folderIsAdmin.set(group.folder, true);
    }

    for (const sourceGroup of groupFolders) {
      const isMain = folderIsMain.get(sourceGroup) === true;
      const isAdmin = folderIsAdmin.get(sourceGroup) === true;
      const messagesDir = path.join(ipcBaseDir, sourceGroup, 'messages');
      const tasksDir = path.join(ipcBaseDir, sourceGroup, 'tasks');

      // Process messages from this group's IPC directory
      try {
        if (fs.existsSync(messagesDir)) {
          const messageFiles = fs
            .readdirSync(messagesDir)
            .filter((f) => f.endsWith('.json'));
          for (const file of messageFiles) {
            const filePath = path.join(messagesDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              if (data.type === 'message' && data.chatJid && data.text) {
                // Authorization: verify this group can send to this chatJid.
                // Also allow shared-group agents (virtual JIDs) to send to their sharedGroupJid.
                const targetGroup = registeredGroups[data.chatJid];
                const virtualEntry = Object.values(registeredGroups).find(
                  (g) =>
                    g.folder === sourceGroup &&
                    g.sharedGroupJid === data.chatJid,
                );
                if (
                  isMain ||
                  (targetGroup && targetGroup.folder === sourceGroup) ||
                  virtualEntry
                ) {
                  const poolBotToken =
                    virtualEntry?.containerConfig?.poolBotToken ??
                    targetGroup?.containerConfig?.poolBotToken;
                  await deps.sendMessage(
                    data.chatJid,
                    data.text,
                    data.sender,
                    data.groupFolder,
                    poolBotToken,
                  );
                  logger.info(
                    { chatJid: data.chatJid, sourceGroup },
                    'IPC message sent',
                  );
                } else {
                  logger.warn(
                    { chatJid: data.chatJid, sourceGroup },
                    'Unauthorized IPC message attempt blocked',
                  );
                }
              } else if (
                data.type === 'send_file' &&
                data.chatJid &&
                data.filePath
              ) {
                // Resolve container path to host path:
                // /workspace/group/outputs/file.tex → groups/{folder}/outputs/file.tex
                let hostPath = data.filePath as string;
                if (hostPath.startsWith('/workspace/group/')) {
                  hostPath = path.join(
                    GROUPS_DIR,
                    sourceGroup,
                    hostPath.replace('/workspace/group/', ''),
                  );
                }
                if (!fs.existsSync(hostPath)) {
                  logger.warn(
                    { hostPath, containerPath: data.filePath, sourceGroup },
                    'IPC send_file: file not found on host',
                  );
                } else {
                  const targetGroup = registeredGroups[data.chatJid];
                  const virtualEntry = Object.values(registeredGroups).find(
                    (g) =>
                      g.folder === sourceGroup &&
                      g.sharedGroupJid === data.chatJid,
                  );
                  if (
                    isMain ||
                    (targetGroup && targetGroup.folder === sourceGroup) ||
                    virtualEntry
                  ) {
                    const poolBotToken =
                      virtualEntry?.containerConfig?.poolBotToken ??
                      targetGroup?.containerConfig?.poolBotToken;
                    await deps.sendFile(
                      data.chatJid,
                      hostPath,
                      data.caption,
                      poolBotToken,
                    );
                    logger.info(
                      {
                        chatJid: data.chatJid,
                        file: path.basename(hostPath),
                        sourceGroup,
                      },
                      'IPC file sent',
                    );
                  } else {
                    logger.warn(
                      { chatJid: data.chatJid, sourceGroup },
                      'Unauthorized IPC send_file attempt blocked',
                    );
                  }
                }
              }
              fs.unlinkSync(filePath);
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                'Error processing IPC message',
              );
              const errorDir = path.join(ipcBaseDir, 'errors');
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceGroup}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error(
          { err, sourceGroup },
          'Error reading IPC messages directory',
        );
      }

      // Process tasks from this group's IPC directory
      try {
        if (fs.existsSync(tasksDir)) {
          const taskFiles = fs
            .readdirSync(tasksDir)
            .filter((f) => f.endsWith('.json'));
          for (const file of taskFiles) {
            const filePath = path.join(tasksDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              // Pass source group identity to processTaskIpc for authorization
              await processTaskIpc(data, sourceGroup, isMain, isAdmin, deps);
              fs.unlinkSync(filePath);
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                'Error processing IPC task',
              );
              const errorDir = path.join(ipcBaseDir, 'errors');
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceGroup}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error({ err, sourceGroup }, 'Error reading IPC tasks directory');
      }
    }

    setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
  };

  processIpcFiles();
  logger.info('IPC watcher started (per-group namespaces)');
}

export async function processTaskIpc(
  data: {
    type: string;
    taskId?: string;
    prompt?: string;
    schedule_type?: string;
    schedule_value?: string;
    context_mode?: string;
    script?: string;
    groupFolder?: string;
    chatJid?: string;
    targetJid?: string;
    sender?: string;
    // For register_group
    jid?: string;
    name?: string;
    folder?: string;
    trigger?: string;
    requiresTrigger?: boolean;
    agentTrigger?: string;
    sharedGroupJid?: string;
    containerConfig?: RegisteredGroup['containerConfig'];
    // For send_to_agent
    targetFolder?: string;
    text?: string;
    sourceFolder?: string;
  },
  sourceGroup: string, // Verified identity from IPC directory
  isMain: boolean, // Verified from directory path
  isAdmin: boolean, // Grants register_group privilege
  deps: IpcDeps,
): Promise<void> {
  const registeredGroups = deps.registeredGroups();

  switch (data.type) {
    case 'schedule_task':
      logger.info(
        {
          sourceGroup,
          hasPrompt: !!data.prompt,
          hasType: !!data.schedule_type,
          hasValue: !!data.schedule_value,
          hasJid: !!data.targetJid,
          targetJid: data.targetJid,
        },
        'schedule_task IPC received',
      );
      if (
        data.prompt &&
        data.schedule_type &&
        data.schedule_value &&
        data.targetJid
      ) {
        // Resolve the target group from JID
        const targetJid = data.targetJid as string;
        let targetGroupEntry = registeredGroups[targetJid];

        // Fallback: virtual agents get the sharedGroupJid as their chatJid,
        // which isn't a key in registeredGroups. Find the group whose
        // sharedGroupJid matches and whose folder matches the source group.
        if (!targetGroupEntry) {
          const byShared = Object.values(registeredGroups).find(
            (g) => g.sharedGroupJid === targetJid && g.folder === sourceGroup,
          );
          if (byShared) targetGroupEntry = byShared;
        }

        if (!targetGroupEntry) {
          logger.warn(
            { targetJid, sourceGroup },
            'Cannot schedule task: target group not registered (direct lookup and sharedGroupJid fallback both failed)',
          );
          break;
        }
        logger.info(
          { targetJid, resolvedFolder: targetGroupEntry.folder, sourceGroup },
          'schedule_task target resolved',
        );

        const targetFolder = targetGroupEntry.folder;

        // Authorization: non-main groups can only schedule for themselves
        if (!isMain && targetFolder !== sourceGroup) {
          logger.warn(
            { sourceGroup, targetFolder },
            'Unauthorized schedule_task attempt blocked',
          );
          break;
        }

        const scheduleType = data.schedule_type as 'cron' | 'interval' | 'once';

        let nextRun: string | null = null;
        if (scheduleType === 'cron') {
          try {
            const interval = CronExpressionParser.parse(data.schedule_value, {
              tz: TIMEZONE,
            });
            nextRun = interval.next().toISOString();
          } catch {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid cron expression',
            );
            break;
          }
        } else if (scheduleType === 'interval') {
          const ms = parseInt(data.schedule_value, 10);
          if (isNaN(ms) || ms <= 0) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid interval',
            );
            break;
          }
          nextRun = new Date(Date.now() + ms).toISOString();
        } else if (scheduleType === 'once') {
          const date = new Date(data.schedule_value);
          if (isNaN(date.getTime())) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid timestamp',
            );
            break;
          }
          nextRun = date.toISOString();
        }

        const taskId =
          data.taskId ||
          `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const contextMode =
          data.context_mode === 'group' || data.context_mode === 'isolated'
            ? data.context_mode
            : 'isolated';
        createTask({
          id: taskId,
          group_folder: targetFolder,
          chat_jid: targetJid,
          prompt: data.prompt,
          script: data.script || null,
          schedule_type: scheduleType,
          schedule_value: data.schedule_value,
          context_mode: contextMode,
          next_run: nextRun,
          status: 'active',
          created_at: new Date().toISOString(),
        });
        logger.info(
          { taskId, sourceGroup, targetFolder, contextMode },
          'Task created via IPC',
        );
        deps.onTasksChanged();
      }
      break;

    case 'pause_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          updateTask(data.taskId, { status: 'paused' });
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task paused via IPC',
          );
          deps.onTasksChanged();
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task pause attempt',
          );
        }
      }
      break;

    case 'resume_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          updateTask(data.taskId, { status: 'active' });
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task resumed via IPC',
          );
          deps.onTasksChanged();
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task resume attempt',
          );
        }
      }
      break;

    case 'cancel_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          deleteTask(data.taskId);
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task cancelled via IPC',
          );
          deps.onTasksChanged();
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task cancel attempt',
          );
        }
      }
      break;

    case 'update_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (!task) {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Task not found for update',
          );
          break;
        }
        if (!isMain && task.group_folder !== sourceGroup) {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task update attempt',
          );
          break;
        }

        const updates: Parameters<typeof updateTask>[1] = {};
        if (data.prompt !== undefined) updates.prompt = data.prompt;
        if (data.script !== undefined) updates.script = data.script || null;
        if (data.schedule_type !== undefined)
          updates.schedule_type = data.schedule_type as
            | 'cron'
            | 'interval'
            | 'once';
        if (data.schedule_value !== undefined)
          updates.schedule_value = data.schedule_value;

        // Recompute next_run if schedule changed
        if (data.schedule_type || data.schedule_value) {
          const updatedTask = {
            ...task,
            ...updates,
          };
          if (updatedTask.schedule_type === 'cron') {
            try {
              const interval = CronExpressionParser.parse(
                updatedTask.schedule_value,
                { tz: TIMEZONE },
              );
              updates.next_run = interval.next().toISOString();
            } catch {
              logger.warn(
                { taskId: data.taskId, value: updatedTask.schedule_value },
                'Invalid cron in task update',
              );
              break;
            }
          } else if (updatedTask.schedule_type === 'interval') {
            const ms = parseInt(updatedTask.schedule_value, 10);
            if (!isNaN(ms) && ms > 0) {
              updates.next_run = new Date(Date.now() + ms).toISOString();
            }
          }
        }

        updateTask(data.taskId, updates);
        logger.info(
          { taskId: data.taskId, sourceGroup, updates },
          'Task updated via IPC',
        );
        deps.onTasksChanged();
      }
      break;

    case 'refresh_groups':
      // Only main group can request a refresh
      if (isMain) {
        logger.info(
          { sourceGroup },
          'Group metadata refresh requested via IPC',
        );
        await deps.syncGroups(true);
        // Write updated snapshot immediately
        const availableGroups = deps.getAvailableGroups();
        deps.writeGroupsSnapshot(
          sourceGroup,
          true,
          availableGroups,
          new Set(Object.keys(registeredGroups)),
        );
      } else {
        logger.warn(
          { sourceGroup },
          'Unauthorized refresh_groups attempt blocked',
        );
      }
      break;

    case 'register_group':
      // Only main group or admin agents can register new groups
      if (!isMain && !isAdmin) {
        logger.warn(
          { sourceGroup },
          'Unauthorized register_group attempt blocked',
        );
        break;
      }
      if (data.jid && data.name && data.folder && data.trigger) {
        if (!isValidGroupFolder(data.folder)) {
          logger.warn(
            { sourceGroup, folder: data.folder },
            'Invalid register_group request - unsafe folder name',
          );
          break;
        }
        // Defense in depth: agent cannot set isMain via IPC.
        // Preserve isMain from the existing registration so IPC config
        // updates (e.g. adding additionalMounts) don't strip the flag.
        const existingGroup = registeredGroups[data.jid];
        deps.registerGroup(data.jid, {
          name: data.name,
          folder: data.folder,
          trigger: data.trigger,
          added_at: new Date().toISOString(),
          containerConfig: data.containerConfig,
          requiresTrigger: data.requiresTrigger,
          agentTrigger: data.agentTrigger,
          sharedGroupJid: data.sharedGroupJid,
          isMain: existingGroup?.isMain,
        });
      } else {
        logger.warn(
          { data },
          'Invalid register_group request - missing required fields',
        );
      }
      break;

    case 'send_to_agent': {
      const targetFolder = data.targetFolder;
      const text = data.text;
      if (!targetFolder || !text) {
        logger.warn({ data }, 'send_to_agent: missing required fields');
        break;
      }
      if (!isValidGroupFolder(targetFolder)) {
        logger.warn(
          { sourceGroup, targetFolder },
          'send_to_agent: invalid target folder',
        );
        break;
      }
      const targetRegistered = Object.values(registeredGroups).find(
        (g) => g.folder === targetFolder,
      );
      if (!targetRegistered) {
        logger.warn(
          { sourceGroup, targetFolder },
          'send_to_agent: target not registered',
        );
        break;
      }
      const targetInputDir = path.join(
        resolveGroupIpcPath(targetFolder),
        'input',
      );
      fs.mkdirSync(targetInputDir, { recursive: true });
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
      const filepath = path.join(targetInputDir, filename);
      const fromLabel = data.sender
        ? `${data.sender} (${sourceGroup})`
        : sourceGroup;
      const tempPath = `${filepath}.tmp`;
      fs.writeFileSync(
        tempPath,
        JSON.stringify(
          { type: 'message', text: `[From ${fromLabel}]\n${text}` },
          null,
          2,
        ),
      );
      fs.renameSync(tempPath, filepath);
      logger.info(
        { sourceGroup, targetFolder, filename },
        'Agent-to-agent message delivered',
      );

      // Mirror to source agent's Telegram chat only when the target is a visible
      // (non-background) agent — i.e. the target has a sharedGroupJid or own jid.
      // Background sub-agents (no sharedGroupJid, virtual jid) work silently.
      const targetJid =
        Object.keys(registeredGroups).find(
          (jid) => registeredGroups[jid].folder === targetFolder,
        ) ?? '';
      const targetIsVisible =
        !!targetRegistered.sharedGroupJid || !targetJid.startsWith('virtual:');
      if (targetIsVisible) {
        const sourceRegistered = Object.values(registeredGroups).find(
          (g) => g.folder === sourceGroup,
        );
        if (sourceRegistered) {
          const sourceChatJid =
            sourceRegistered.sharedGroupJid ??
            Object.keys(registeredGroups).find(
              (jid) => registeredGroups[jid].folder === sourceGroup,
            );
          if (sourceChatJid) {
            const senderLabel = data.sender || sourceGroup;
            const targetName = targetRegistered.name;
            const mirrorText = `[${senderLabel} → ${targetName}]\n${text}`;
            deps
              .sendMessage(
                sourceChatJid,
                mirrorText,
                senderLabel,
                sourceGroup,
                sourceRegistered.containerConfig?.poolBotToken,
              )
              .catch((err) =>
                logger.warn(
                  { sourceGroup, err },
                  'Failed to mirror inter-agent message',
                ),
              );
          }
        }
      }

      // Wake up the target agent if it's not already running
      deps.activateAgent(targetFolder);
      break;
    }

    case 'update_agent_token': {
      const {
        folder,
        token,
        enka_key: enkaKey,
        rarity = '5',
      } = data as {
        folder?: string;
        token?: string;
        enka_key?: string;
        rarity?: string;
      };
      if (!folder || !token) {
        logger.warn({ data }, 'update_agent_token: missing folder or token');
        break;
      }
      if (!isValidGroupFolder(folder)) {
        logger.warn({ folder }, 'update_agent_token: invalid folder');
        break;
      }
      // Detect shared group JID from any working virtual agent
      const sharedGroupJid = Object.entries(registeredGroups).find(
        ([jid, g]) => jid.startsWith('virtual:') && g.sharedGroupJid,
      )?.[1].sharedGroupJid;
      if (!sharedGroupJid) {
        logger.warn('update_agent_token: could not detect sharedGroupJid');
        break;
      }
      const patched = patchAgentToken(folder, token, sharedGroupJid);
      if (patched) {
        logger.info({ folder }, 'update_agent_token: token patched');

        const characterName = folder.startsWith('telegram_')
          ? folder.slice('telegram_'.length)
          : folder;

        // Auto-set bot profile photo if enka_key provided
        if (enkaKey) {
          const scriptPath = path.join(
            process.cwd(),
            'scripts',
            'set-bot-photos.sh',
          );
          logger.info(
            { folder, enkaKey },
            'update_agent_token: setting profile photo',
          );
          const photoProc = spawn(
            'bash',
            [scriptPath, '--direct', token, characterName, enkaKey, rarity],
            {
              detached: true,
              stdio: ['ignore', 'pipe', 'pipe'],
            },
          );
          photoProc.stdout?.on('data', (d: Buffer) =>
            logger.debug({ folder }, `set-bot-photos: ${d.toString().trim()}`),
          );
          photoProc.stderr?.on('data', (d: Buffer) =>
            logger.warn({ folder }, `set-bot-photos: ${d.toString().trim()}`),
          );
          photoProc.unref();
        }

        // Notify Alhaitham
        const sourceRegistered = Object.values(registeredGroups).find(
          (g) => g.folder === sourceGroup,
        );
        if (sourceRegistered) {
          const chatJid =
            sourceRegistered.sharedGroupJid ??
            Object.keys(registeredGroups).find(
              (jid) => registeredGroups[jid].folder === sourceGroup,
            );
          if (chatJid) {
            const photoNote = enkaKey
              ? ' Avatar set automatically.'
              : ' Run `bash scripts/set-bot-photos.sh` to set the avatar.';
            deps
              .sendMessage(
                chatJid,
                `✓ Token registered for ${folder}.${photoNote} Add @nanoclaw_${characterName}_bot to Teyvat LLC, then restart nanoclaw.`,
                undefined,
                sourceGroup,
                sourceRegistered.containerConfig?.poolBotToken,
              )
              .catch(() => {});
          }
        }
      } else {
        logger.warn({ folder }, 'update_agent_token: folder not found in DB');
      }
      break;
    }

    case 'set_agent_model': {
      if (!isMain && !isAdmin) {
        logger.warn(
          { sourceGroup },
          'Unauthorized set_agent_model attempt blocked',
        );
        break;
      }
      const { folder: modelFolder, model } = data as {
        folder?: string;
        model?: string;
      };
      if (!modelFolder || !model) {
        logger.warn({ data }, 'set_agent_model: missing folder or model');
        break;
      }
      if (!isValidGroupFolder(modelFolder)) {
        logger.warn({ modelFolder }, 'set_agent_model: invalid folder name');
        break;
      }
      const patched = patchContainerConfig(modelFolder, { model });
      if (patched) {
        logger.info(
          { folder: modelFolder, model },
          'set_agent_model: model updated',
        );
        // Update in-memory registeredGroups so the next container spawn uses the new model
        const targetJid = Object.keys(registeredGroups).find(
          (jid) => registeredGroups[jid].folder === modelFolder,
        );
        if (targetJid && registeredGroups[targetJid].containerConfig) {
          registeredGroups[targetJid].containerConfig!.model = model;
        } else if (targetJid) {
          registeredGroups[targetJid].containerConfig = { model };
        }
        // Notify the source chat
        const sourceChatJid = Object.keys(registeredGroups).find(
          (jid) => registeredGroups[jid].folder === sourceGroup,
        );
        if (sourceChatJid) {
          deps
            .sendMessage(
              sourceChatJid,
              `Model for ${modelFolder} set to ${model}. Takes effect on next container start.`,
            )
            .catch((err) =>
              logger.warn({ err }, 'set_agent_model: notify failed'),
            );
        }
      } else {
        logger.warn({ modelFolder }, 'set_agent_model: folder not found in DB');
      }
      break;
    }

    default:
      logger.warn({ type: data.type }, 'Unknown IPC task type');
  }
}
