/**
 * PRJ226 v3.0: Telegram Webhook Handler (Sensor Layer)
 *
 * Responsibilities:
 *   1. Receive Telegram update payloads (text, voice, callback_query)
 *   2. Fire sendChatAction("typing") immediately (< 50ms UX ack)
 *   3. Route to Durable Object debounce buffer OR directly to AI processing
 *      - callback_query: always bypass debounce (button presses must be instant)
 *      - reply messages: always bypass debounce
 *      - normal text: route through DebounceBuffer Durable Object
 *   4. Fail-open to Cloudflare Queue if Durable Object is unavailable
 */

import type { Env } from '../config';
import { getDebounceConfig } from '../config';
import { sendChatAction } from '../tools/telegramClient';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; is_bot: boolean; first_name: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
    voice?: { file_id: string; duration: number };
    reply_to_message?: { message_id: number };
    date: number;
  };
  callback_query?: {
    id: string;
    from: { id: number; username?: string };
    message?: { chat: { id: number } };
    data?: string;
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handleTelegramWebhook(
  update: TelegramUpdate,
  env: Env,
): Promise<void> {
  const chatId = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;

  if (!chatId) {
    console.warn('[TelegramWebhook] No chatId found in update. Dropping.');
    return;
  }

  // ─── Typing ack (< 50ms UX feedback) ──────────────────────────────────────
  // Fire-and-forget — do not await. This must not block the 200 OK response.
  sendChatAction(chatId, 'typing', env).catch((err) =>
    console.warn('[TelegramWebhook] sendChatAction failed (non-fatal):', err)
  );

  // ─── callback_query: bypass debounce ──────────────────────────────────────
  if (update.callback_query) {
    console.log('[TelegramWebhook] Callback query — routing directly.');
    await enqueueForProcessing(update, env);
    return;
  }

  // ─── Reply bypass: reply messages bypass debounce ─────────────────────────
  if (update.message?.reply_to_message) {
    console.log('[TelegramWebhook] Reply message — bypassing debounce.');
    await enqueueForProcessing(update, env);
    return;
  }

  // ─── Debounce buffer ──────────────────────────────────────────────────────
  const { enabled } = getDebounceConfig(env);
  if (enabled) {
    try {
      const doId = env.DEBOUNCE_BUFFER.idFromName(chatId.toString());
      const stub = env.DEBOUNCE_BUFFER.get(doId);
      await stub.fetch('https://internal/ingest', {
        method: 'POST',
        body: JSON.stringify(update),
        headers: { 'Content-Type': 'application/json' },
      });
      console.log(`[TelegramWebhook] Message buffered for chatId=${chatId}.`);
    } catch (err) {
      // ERR-05: Durable Object unavailable → fail-open to direct queue
      console.warn('[TelegramWebhook] Durable Object unavailable. Fail-open to queue:', err);
      await enqueueForProcessing(update, env);
    }
  } else {
    // Kill-switch: debounce disabled
    await enqueueForProcessing(update, env);
  }
}

// ─── Queue Dispatch ──────────────────────────────────────────────────────────

async function enqueueForProcessing(update: TelegramUpdate, env: Env): Promise<void> {
  try {
    await env.TASK_QUEUE.send(update);
    console.log('[TelegramWebhook] Message enqueued for AI processing.');
  } catch (err) {
    // ERR: Queue unavailable → store in KV fallback buffer
    console.error('[TelegramWebhook] Queue send failed. Falling back to KV buffer:', err);
    const chatId = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;
    if (chatId) {
      const key = `fallback:${chatId}:${Date.now()}`;
      await env.FALLBACK_KV.put(key, JSON.stringify(update), { expirationTtl: 3600 });
      console.log(`[TelegramWebhook] Stored in KV fallback: ${key}`);
    }
  }
}
