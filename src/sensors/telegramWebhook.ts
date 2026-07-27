/**
 * PRJ226 v3.0: Telegram Webhook Handler (Sensor Layer)
 *
 * Responsibilities:
 *   1. Receive Telegram update payloads (text, voice, callback_query)
 *   2. Fire sendChatAction("typing") immediately (< 50ms UX ack)
 *   3. Dispatch non-blocking AI execution via ExecutionContext ctx.waitUntil()
 *   4. KV-backed debounce buffering (100% Free Tier)
 */

import type { Env } from '../config';
import { sendChatAction } from '../tools/telegramClient';
import { handleWorkerPayload } from '../governance/intentRouter';
import { DebounceManager } from './debounceBuffer';

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; is_bot: boolean; first_name: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
    reply_to_message?: unknown;
    date: number;
  };
  callback_query?: {
    id: string;
    from: { id: number; username?: string };
    message?: { chat: { id: number } };
    data?: string;
  };
}

export async function handleTelegramWebhook(
  update: TelegramUpdate,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  const chatId = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;

  if (!chatId) {
    console.warn('[TelegramWebhook] No chatId found in update. Dropping.');
    return;
  }

  // ─── Typing ack (< 50ms UX feedback) ──────────────────────────────────────
  ctx.waitUntil(
    sendChatAction(chatId, 'typing', env).catch((err) =>
      console.warn('[TelegramWebhook] sendChatAction failed (non-fatal):', err),
    ),
  );

  // ─── Direct execution for callback_query & replies ───────────────
  if (update.callback_query || update.message?.reply_to_message) {
    ctx.waitUntil(handleWorkerPayload(update as unknown as Record<string, unknown>, env));
    return;
  }

  // ─── KV Debounce Buffer ──────────────────────────────────────────────────
  const debounceManager = new DebounceManager(env);
  const { shouldProcess, mergedPayload } = await debounceManager.bufferMessage(chatId, update as unknown as Record<string, unknown>);

  if (shouldProcess) {
    ctx.waitUntil(
      (async () => {
        try {
          await handleWorkerPayload(mergedPayload, env);
        } finally {
          await debounceManager.clearBuffer(chatId);
        }
      })(),
    );
  }
}
