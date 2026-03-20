import fs from 'fs';
import https from 'https';
import path from 'path';
import { Api, Bot } from 'grammy';

import { ASSISTANT_NAME, TRIGGER_PATTERN } from '../config.js';
import { readEnvFile } from '../env.js';
import { processImage } from '../image.js';
import { resolveGroupFolderPath } from '../group-folder.js';
import { logger } from '../logger.js';

// --- Bot pool for per-agent identities ---

const poolApis: Api[] = [];
// Maps "{groupFolder}:{senderName}" → pool index for stable assignment
const senderBotMap = new Map<string, number>();
let nextPoolIndex = 0;

export async function initBotPool(tokens: string[]): Promise<void> {
  for (const token of tokens) {
    try {
      const api = new Api(token, {
        baseFetchConfig: { agent: https.globalAgent, compress: true },
      } as any);
      const me = await api.getMe();
      poolApis.push(api);
      logger.info(
        { username: me.username, id: me.id, poolSize: poolApis.length },
        'Pool bot initialized',
      );
    } catch (err) {
      logger.error({ err }, 'Failed to initialize pool bot');
    }
  }
  if (poolApis.length > 0) {
    logger.info({ count: poolApis.length }, 'Telegram bot pool ready');
  }
}

// Cache of dedicated bot Api instances keyed by token
const dedicatedBotCache = new Map<string, Api>();

function getDedicatedApi(token: string): Api {
  let api = dedicatedBotCache.get(token);
  if (!api) {
    api = new Api(token);
    dedicatedBotCache.set(token, api);
  }
  return api;
}

export async function sendPoolMessage(
  chatId: string,
  text: string,
  sender: string,
  groupFolder: string,
  fallback: (jid: string, text: string) => Promise<void>,
  dedicatedToken?: string,
): Promise<void> {
  // Preferred: use the group's dedicated bot token directly
  if (dedicatedToken) {
    const api = getDedicatedApi(dedicatedToken);
    const numericId = parseInt(chatId.replace(/^tg:/, ''), 10);
    const MAX_LENGTH = 4096;
    try {
      if (text.length <= MAX_LENGTH) {
        await sendTelegramMessage(api, numericId, text);
      } else {
        for (let i = 0; i < text.length; i += MAX_LENGTH) {
          await sendTelegramMessage(
            api,
            numericId,
            text.slice(i, i + MAX_LENGTH),
          );
        }
      }
      logger.info(
        { chatId, sender, length: text.length },
        'Pool message sent (dedicated bot)',
      );
    } catch (err) {
      logger.error(
        { chatId, sender, err },
        'Failed to send pool message (dedicated bot)',
      );
    }
    return;
  }

  // Fallback: round-robin pool (no dedicated token configured)
  if (poolApis.length === 0) {
    await fallback(chatId, text);
    return;
  }

  const key = `${groupFolder}:${sender}`;
  let idx = senderBotMap.get(key);
  if (idx === undefined) {
    idx = nextPoolIndex % poolApis.length;
    nextPoolIndex++;
    senderBotMap.set(key, idx);
    try {
      await poolApis[idx].setMyName(sender);
      await new Promise((r) => setTimeout(r, 2000));
      logger.info(
        { sender, groupFolder, poolIndex: idx },
        'Assigned and renamed pool bot',
      );
    } catch (err) {
      logger.warn(
        { sender, err },
        'Failed to rename pool bot (sending anyway)',
      );
    }
  }

  const api = poolApis[idx];
  const numericId = parseInt(chatId.replace(/^tg:/, ''), 10);
  const MAX_LENGTH = 4096;
  try {
    if (text.length <= MAX_LENGTH) {
      await sendTelegramMessage(api, numericId, text);
    } else {
      for (let i = 0; i < text.length; i += MAX_LENGTH) {
        await sendTelegramMessage(
          api,
          numericId,
          text.slice(i, i + MAX_LENGTH),
        );
      }
    }
    logger.info(
      { chatId, sender, poolIndex: idx, length: text.length },
      'Pool message sent',
    );
  } catch (err) {
    logger.error({ chatId, sender, err }, 'Failed to send pool message');
  }
}
import { registerChannel, ChannelOpts } from './registry.js';
import {
  Channel,
  OnChatMetadata,
  OnInboundMessage,
  RegisteredGroup,
} from '../types.js';

export interface TelegramChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

/**
 * Send a message with Telegram Markdown parse mode, falling back to plain text.
 * Claude's output naturally matches Telegram's Markdown v1 format:
 *   *bold*, _italic_, `code`, ```code blocks```, [links](url)
 */
async function sendTelegramMessage(
  api: { sendMessage: Api['sendMessage'] },
  chatId: string | number,
  text: string,
  options: { message_thread_id?: number } = {},
): Promise<void> {
  try {
    await api.sendMessage(chatId, text, {
      ...options,
      parse_mode: 'Markdown',
    });
  } catch (err) {
    // Fallback: send as plain text if Markdown parsing fails
    logger.debug({ err }, 'Markdown send failed, falling back to plain text');
    await api.sendMessage(chatId, text, options);
  }
}

export class TelegramChannel implements Channel {
  name = 'telegram';

  private bot: Bot | null = null;
  private opts: TelegramChannelOpts;
  private botToken: string;

  constructor(botToken: string, opts: TelegramChannelOpts) {
    this.botToken = botToken;
    this.opts = opts;
  }

  async connect(): Promise<void> {
    this.bot = new Bot(this.botToken, {
      client: {
        baseFetchConfig: { agent: https.globalAgent, compress: true },
      },
    });

    // Command to get chat ID (useful for registration)
    this.bot.command('chatid', (ctx) => {
      const chatId = ctx.chat.id;
      const chatType = ctx.chat.type;
      const chatName =
        chatType === 'private'
          ? ctx.from?.first_name || 'Private'
          : (ctx.chat as any).title || 'Unknown';

      ctx.reply(
        `Chat ID: \`tg:${chatId}\`\nName: ${chatName}\nType: ${chatType}`,
        { parse_mode: 'Markdown' },
      );
    });

    // Command to check bot status
    this.bot.command('ping', (ctx) => {
      ctx.reply(`${ASSISTANT_NAME} is online.`);
    });

    this.bot.on('message:text', async (ctx) => {
      // Skip commands
      if (ctx.message.text.startsWith('/')) return;

      const chatJid = `tg:${ctx.chat.id}`;
      let content = ctx.message.text;
      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id.toString() ||
        'Unknown';
      const sender = ctx.from?.id.toString() || '';
      const msgId = ctx.message.message_id.toString();

      // Determine chat name
      const chatName =
        ctx.chat.type === 'private'
          ? senderName
          : (ctx.chat as any).title || chatJid;

      // Translate Telegram @bot_username mentions into TRIGGER_PATTERN format.
      // Telegram @mentions (e.g., @andy_ai_bot) won't match TRIGGER_PATTERN
      // (e.g., ^@Andy\b), so we prepend the trigger when the bot is @mentioned.
      const botUsername = ctx.me?.username?.toLowerCase();
      if (botUsername) {
        const entities = ctx.message.entities || [];
        const isBotMentioned = entities.some((entity) => {
          if (entity.type === 'mention') {
            const mentionText = content
              .substring(entity.offset, entity.offset + entity.length)
              .toLowerCase();
            return mentionText === `@${botUsername}`;
          }
          return false;
        });
        if (isBotMentioned && !TRIGGER_PATTERN.test(content)) {
          content = `@${ASSISTANT_NAME} ${content}`;
        }
      }

      // Store chat metadata for discovery
      const isGroup =
        ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(
        chatJid,
        timestamp,
        chatName,
        'telegram',
        isGroup,
      );

      // Only deliver full message for registered groups or shared group JIDs
      const group = this.opts.registeredGroups()[chatJid];
      const isSharedGroupJid =
        !group &&
        Object.values(this.opts.registeredGroups()).some(
          (g) => g.sharedGroupJid === chatJid,
        );
      if (!group && !isSharedGroupJid) {
        logger.debug(
          { chatJid, chatName },
          'Message from unregistered Telegram chat',
        );
        return;
      }

      // Deliver message — startMessageLoop() will pick it up
      this.opts.onMessage(chatJid, {
        id: msgId,
        chat_jid: chatJid,
        sender,
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
        is_bot_message: ctx.from?.is_bot === true,
      });

      logger.info(
        { chatJid, chatName, sender: senderName },
        'Telegram message stored',
      );
    });

    // Handle non-text messages with placeholders so the agent knows something was sent
    const storeNonText = (ctx: any, placeholder: string) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      const isSharedGroupJid =
        !group &&
        Object.values(this.opts.registeredGroups()).some(
          (g) => g.sharedGroupJid === chatJid,
        );
      if (!group && !isSharedGroupJid) return;

      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id?.toString() ||
        'Unknown';
      const caption = ctx.message.caption ? ` ${ctx.message.caption}` : '';

      const isGroup =
        ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(
        chatJid,
        timestamp,
        undefined,
        'telegram',
        isGroup,
      );
      this.opts.onMessage(chatJid, {
        id: ctx.message.message_id.toString(),
        chat_jid: chatJid,
        sender: ctx.from?.id?.toString() || '',
        sender_name: senderName,
        content: `${placeholder}${caption}`,
        timestamp,
        is_from_me: false,
        is_bot_message: ctx.from?.is_bot === true,
      });
    };

    this.bot.on('message:photo', async (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      const isSharedGroupJid =
        !group &&
        Object.values(this.opts.registeredGroups()).some(
          (g) => g.sharedGroupJid === chatJid,
        );
      if (!group && !isSharedGroupJid) return;

      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id?.toString() ||
        'Unknown';
      const caption = ctx.message.caption || '';
      const isGroup =
        ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(
        chatJid,
        timestamp,
        undefined,
        'telegram',
        isGroup,
      );

      let content = caption ? `[Photo] ${caption}` : '[Photo]';

      try {
        // Pick the largest photo size
        const photos = ctx.message.photo;
        const photo = photos[photos.length - 1];
        const file = await ctx.api.getFile(photo.file_id);
        if (file.file_path) {
          const url = `https://api.telegram.org/file/bot${this.botToken}/${file.file_path}`;
          const buffer = await new Promise<Buffer>((resolve, reject) => {
            https
              .get(url, (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (c: Buffer) => chunks.push(c));
                res.on('end', () => resolve(Buffer.concat(chunks)));
                res.on('error', reject);
              })
              .on('error', reject);
          });

          // Find the group folder to store attachment
          const targetGroup =
            group ??
            Object.values(this.opts.registeredGroups()).find(
              (g) => g.sharedGroupJid === chatJid,
            );
          if (targetGroup) {
            const groupDir = resolveGroupFolderPath(targetGroup.folder);
            const processed = await processImage(buffer, groupDir, caption);
            if (processed) content = processed.content;
          }
        }
      } catch (err) {
        logger.warn(
          { chatJid, err },
          'Failed to download/process Telegram photo',
        );
      }

      this.opts.onMessage(chatJid, {
        id: ctx.message.message_id.toString(),
        chat_jid: chatJid,
        sender: ctx.from?.id?.toString() || '',
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
        is_bot_message: ctx.from?.is_bot === true,
      });
    });
    this.bot.on('message:video', (ctx) => storeNonText(ctx, '[Video]'));

    // Download voice and audio to the group attachments folder
    const downloadAudio = async (ctx: any, typeLabel: string, ext: string) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      const isSharedGroupJid =
        !group &&
        Object.values(this.opts.registeredGroups()).some(
          (g) => g.sharedGroupJid === chatJid,
        );
      if (!group && !isSharedGroupJid) return;

      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id?.toString() ||
        'Unknown';
      const caption = ctx.message.caption || '';
      const isGroup =
        ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(
        chatJid,
        timestamp,
        undefined,
        'telegram',
        isGroup,
      );

      let content = caption
        ? `[${typeLabel}: ${typeLabel.toLowerCase()}.${ext}] ${caption}`
        : `[${typeLabel}]`;

      try {
        const fileId = ctx.message.voice?.file_id ?? ctx.message.audio?.file_id;
        const file = await ctx.api.getFile(fileId);
        if (file.file_path) {
          const url = `https://api.telegram.org/file/bot${this.botToken}/${file.file_path}`;
          const buffer = await new Promise<Buffer>((resolve, reject) => {
            https
              .get(url, (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (c: Buffer) => chunks.push(c));
                res.on('end', () => resolve(Buffer.concat(chunks)));
                res.on('error', reject);
              })
              .on('error', reject);
          });

          const targetGroups = group
            ? [group]
            : Object.values(this.opts.registeredGroups()).filter(
                (g) => g.sharedGroupJid === chatJid,
              );
          if (targetGroups.length > 0) {
            const slug = typeLabel.toLowerCase();
            const filename = `${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
            for (const tg of targetGroups) {
              const groupDir = resolveGroupFolderPath(tg.folder);
              const attachDir = path.join(groupDir, 'attachments');
              fs.mkdirSync(attachDir, { recursive: true });
              fs.writeFileSync(path.join(attachDir, filename), buffer);
            }
            const containerPath = `/workspace/group/attachments/${filename}`;
            content = caption
              ? `[${typeLabel}: ${containerPath}] ${caption}`
              : `[${typeLabel}: ${containerPath}]`;
          }
        }
      } catch (err: any) {
        const tooBig =
          err?.error_code === 400 &&
          typeof err?.description === 'string' &&
          err.description.toLowerCase().includes('file is too big');
        if (tooBig) {
          logger.warn(
            { chatJid },
            `Telegram ${typeLabel} exceeds 20MB Bot API limit — notifying agent`,
          );
          content = caption
            ? `[${typeLabel}: too large to download via Bot API (>20MB)] ${caption}`
            : `[${typeLabel}: too large to download via Bot API (>20MB) — ask the user to compress or split the file]`;
        } else {
          logger.warn(
            { chatJid, err },
            `Failed to download Telegram ${typeLabel}`,
          );
        }
      }

      this.opts.onMessage(chatJid, {
        id: ctx.message.message_id.toString(),
        chat_jid: chatJid,
        sender: ctx.from?.id?.toString() || '',
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
        is_bot_message: ctx.from?.is_bot === true,
      });
    };

    this.bot.on('message:voice', (ctx) => downloadAudio(ctx, 'Voice', 'ogg'));
    this.bot.on('message:audio', (ctx) => downloadAudio(ctx, 'Audio', 'mp3'));
    this.bot.on('message:document', async (ctx) => {
      const doc = ctx.message.document;
      const name = doc?.file_name || 'file';
      const mimeType = doc?.mime_type || '';
      const isPdf =
        mimeType === 'application/pdf' || name.toLowerCase().endsWith('.pdf');

      // Determine a short type label for the message
      const typeLabel = isPdf
        ? 'PDF'
        : name.toLowerCase().endsWith('.docx') ||
            mimeType.includes('wordprocessingml')
          ? 'DOCX'
          : name.toLowerCase().endsWith('.doc') ||
              mimeType === 'application/msword'
            ? 'DOC'
            : name.toLowerCase().endsWith('.xlsx') ||
                mimeType.includes('spreadsheetml')
              ? 'XLSX'
              : name.toLowerCase().endsWith('.xls') ||
                  mimeType.includes('ms-excel')
                ? 'XLS'
                : name.toLowerCase().endsWith('.pptx') ||
                    mimeType.includes('presentationml')
                  ? 'PPTX'
                  : name.toLowerCase().endsWith('.csv') ||
                      mimeType === 'text/csv'
                    ? 'CSV'
                    : name.toLowerCase().endsWith('.txt') ||
                        mimeType.startsWith('text/')
                      ? 'TXT'
                      : 'Document';

      // Download all document types to the group attachments folder
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      const isSharedGroupJid =
        !group &&
        Object.values(this.opts.registeredGroups()).some(
          (g) => g.sharedGroupJid === chatJid,
        );
      if (!group && !isSharedGroupJid) return;

      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id?.toString() ||
        'Unknown';
      const caption = ctx.message.caption || '';
      const isGroup =
        ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(
        chatJid,
        timestamp,
        undefined,
        'telegram',
        isGroup,
      );

      let content = caption
        ? `[${typeLabel}: ${name}] ${caption}`
        : `[${typeLabel}: ${name}]`;

      try {
        const file = await ctx.api.getFile(doc!.file_id);
        if (file.file_path) {
          const url = `https://api.telegram.org/file/bot${this.botToken}/${file.file_path}`;
          const buffer = await new Promise<Buffer>((resolve, reject) => {
            https
              .get(url, (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (c: Buffer) => chunks.push(c));
                res.on('end', () => resolve(Buffer.concat(chunks)));
                res.on('error', reject);
              })
              .on('error', reject);
          });

          // For shared groups, save to ALL matching agents' folders so
          // any dispatched agent finds the file at /workspace/group/attachments/
          const targetGroups = group
            ? [group]
            : Object.values(this.opts.registeredGroups()).filter(
                (g) => g.sharedGroupJid === chatJid,
              );
          if (targetGroups.length > 0) {
            const ext = path.extname(name) || (isPdf ? '.pdf' : '');
            const slug = typeLabel.toLowerCase();
            const filename = `${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}${ext}`;
            for (const tg of targetGroups) {
              const groupDir = resolveGroupFolderPath(tg.folder);
              const attachDir = path.join(groupDir, 'attachments');
              fs.mkdirSync(attachDir, { recursive: true });
              fs.writeFileSync(path.join(attachDir, filename), buffer);
            }
            // Absolute container path is the same for all agents
            const containerPath = `/workspace/group/attachments/${filename}`;
            content = caption
              ? `[${typeLabel}: ${containerPath}] ${caption}`
              : `[${typeLabel}: ${containerPath}]`;
          }
        }
      } catch (err) {
        logger.warn(
          { chatJid, err },
          `Failed to download Telegram document (${typeLabel})`,
        );
      }

      this.opts.onMessage(chatJid, {
        id: ctx.message.message_id.toString(),
        chat_jid: chatJid,
        sender: ctx.from?.id?.toString() || '',
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
        is_bot_message: ctx.from?.is_bot === true,
      });
    });
    this.bot.on('message:sticker', (ctx) => {
      const emoji = ctx.message.sticker?.emoji || '';
      storeNonText(ctx, `[Sticker ${emoji}]`);
    });
    this.bot.on('message:location', (ctx) => storeNonText(ctx, '[Location]'));
    this.bot.on('message:contact', (ctx) => storeNonText(ctx, '[Contact]'));

    // Handle errors gracefully
    this.bot.catch((err) => {
      logger.error({ err: err.message }, 'Telegram bot error');
    });

    // Start polling — returns a Promise that resolves when started
    return new Promise<void>((resolve) => {
      this.bot!.start({
        onStart: (botInfo) => {
          logger.info(
            { username: botInfo.username, id: botInfo.id },
            'Telegram bot connected',
          );
          console.log(`\n  Telegram bot: @${botInfo.username}`);
          console.log(
            `  Send /chatid to the bot to get a chat's registration ID\n`,
          );
          resolve();
        },
      });
    });
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.bot) {
      logger.warn('Telegram bot not initialized');
      return;
    }

    try {
      const numericId = jid.replace(/^tg:/, '');

      // Telegram has a 4096 character limit per message — split if needed
      const MAX_LENGTH = 4096;
      if (text.length <= MAX_LENGTH) {
        await sendTelegramMessage(this.bot.api, numericId, text);
      } else {
        for (let i = 0; i < text.length; i += MAX_LENGTH) {
          await sendTelegramMessage(
            this.bot.api,
            numericId,
            text.slice(i, i + MAX_LENGTH),
          );
        }
      }
      logger.info({ jid, length: text.length }, 'Telegram message sent');
    } catch (err) {
      logger.error({ jid, err }, 'Failed to send Telegram message');
    }
  }

  isConnected(): boolean {
    return this.bot !== null;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('tg:');
  }

  async disconnect(): Promise<void> {
    if (this.bot) {
      this.bot.stop();
      this.bot = null;
      logger.info('Telegram bot stopped');
    }
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    if (!this.bot || !isTyping) return;
    try {
      const numericId = jid.replace(/^tg:/, '');
      await this.bot.api.sendChatAction(numericId, 'typing');
    } catch (err) {
      logger.debug({ jid, err }, 'Failed to send Telegram typing indicator');
    }
  }
}

registerChannel('telegram', (opts: ChannelOpts) => {
  const envVars = readEnvFile(['TELEGRAM_BOT_TOKEN']);
  const token =
    process.env.TELEGRAM_BOT_TOKEN || envVars.TELEGRAM_BOT_TOKEN || '';
  if (!token) {
    logger.warn('Telegram: TELEGRAM_BOT_TOKEN not set');
    return null;
  }
  return new TelegramChannel(token, opts);
});
