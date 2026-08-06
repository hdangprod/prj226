/**
 * PRJ226 v4.2: Session-mode ingress routing (§6.1, Phase 3).
 *
 * Runs the stateless, durable-acceptance-first path: validate update shape →
 * authorize against allowlists → derive conversation scope → accept into the
 * scope's Durable Object. Idempotency lives entirely in the DO SQLite dedup
 * table (inbound_events.update_id), so a duplicate webhook retry is answered
 * before it can create a second turn.
 */

import type { Env } from '../config';
import type { ValidatedTelegramUpdate } from './sessionSchema';
import { parseTelegramUpdate } from './sessionSchema';
import { parseSessionConfig } from './sessionConfig';
import { authorizeUpdate } from './securityPolicy';
import {
  deriveConversationScope,
  scopeToDurableObjectName,
} from './conversationScope';
import type { ConversationScope } from './sessionTypes';
import type { IngressUpdate } from './stateMachine';

interface IdentityView {
  userId: number;
  chatId: number;
  chatType: string;
  isBot: boolean;
  isTopicMessage: boolean;
  isForum: boolean;
  messageThreadId: number;
}

function extractIdentity(value: ValidatedTelegramUpdate): IdentityView | null {
  const message = value.message;
  const cb = value.callback_query;
  const from = message?.from ?? cb?.from;
  const chat = message?.chat ?? cb?.message?.chat;
  if (!from || !chat) return null;

  return {
    userId: from.id,
    chatId: chat.id,
    chatType: chat.type,
    isBot: from.is_bot === true,
    isTopicMessage: message?.is_topic_message === true,
    isForum: chat.is_forum === true,
    messageThreadId: message?.message_thread_id ?? 0,
  };
}

/**
 * The stateless ingress handler. Returns (does not throw) for unauthorized or
 * unsupported updates, matching the "HTTP 200 with no response" contract.
 * Throws only when durable acceptance itself fails, so the caller returns a
 * non-200 and Telegram retries the webhook.
 */
export async function handleSessionIngress(
  update: unknown,
  env: Env,
): Promise<void> {
  const parsed = parseTelegramUpdate(update);
  if (!parsed.ok) return;

  let config;
  try {
    config = parseSessionConfig(env);
  } catch (err) {
    console.error(JSON.stringify({ event: 'session_config_error', error: (err as Error).message }));
    return;
  }

  const identity = extractIdentity(parsed.value);
  if (!identity || identity.isBot) return;

  const auth = authorizeUpdate({
    userId: identity.userId,
    chatId: identity.chatId,
    isBot: identity.isBot,
    allowedUserIds: config.allowedUserIds,
    allowedChatIds: config.allowedChatIds,
  });
  if (!auth.allowed) return;

  const scope = deriveConversationScope(
    {
      userId: identity.userId,
      chatId: identity.chatId,
      chatType: identity.chatType,
      messageThreadId: identity.messageThreadId,
      isTopicMessage: identity.isTopicMessage,
      isForum: identity.isForum,
    },
    { privateTopicsEnabled: config.privateTopicsEnabled, sharedGroupEnabled: false },
  );
  if (!scope) return;

  const ingress = buildIngress(parsed.value, identity, scope);
  await acceptIntoDurableObject(ingress, scope, env);
}

function buildIngress(
  value: ValidatedTelegramUpdate,
  identity: IdentityView,
  scope: ConversationScope,
): IngressUpdate {
  const message = value.message;
  const cb = value.callback_query;

  const voice = message?.voice;
  const attachmentJson = voice
    ? JSON.stringify({ type: 'voice', fileId: voice.file_id, duration: voice.duration })
    : null;

  return {
    updateId: value.update_id,
    telegramEventAt: message?.date !== undefined ? message.date * 1000 : null,
    receivedAt: Date.now(),
    userId: identity.userId,
    chatId: identity.chatId,
    threadId: scope.threadId,
    telegramMessageId: message?.message_id ?? null,
    callbackQueryId: cb?.id ?? null,
    eventType: cb ? 'callback_query' : 'message',
    text: message?.text ?? null,
    attachmentJson,
    replyContextJson: message?.reply_to_message ? JSON.stringify(message.reply_to_message) : null,
  };
}

async function acceptIntoDurableObject(
  ingress: IngressUpdate,
  scope: ConversationScope,
  env: Env,
): Promise<void> {
  const ns = env.TELEGRAM_SESSIONS;
  if (!ns) throw new Error('TELEGRAM_SESSIONS binding is not configured');
  const id = ns.idFromName(scopeToDurableObjectName(scope));
  const stub = ns.get(id);
  const res = await stub.fetch('/accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ingress),
  });
  if (!res.ok) {
    throw new Error('durable accept failed');
  }
}
