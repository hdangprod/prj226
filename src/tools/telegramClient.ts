/**
 * PRJ226 v3.0: Telegram Client (Tool Layer)
 *
 * Low-level Telegram Bot API wrappers adapted for Cloudflare Workers fetch API.
 * Replaces: Node.js http/axios calls from v2.0.
 * All functions use the global fetch() available in Workers.
 *
 * Features:
 *   - sendMessage (HTML parse mode)
 *   - sendMessageWithKeyboard (inline keyboard)
 *   - sendChatAction (typing indicator)
 *   - editMessageText (progressive status updates)
 *   - answerCallbackQuery
 */

import type { Env } from '../config';

// ─── Base API Call ────────────────────────────────────────────────────────────

async function callTelegramAPI(
  method: string,
  payload: Record<string, unknown>,
  env: Env,
): Promise<Response> {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`[TelegramClient] ${method} failed (${response.status}): ${error}`);
  }

  return response;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send a plain or HTML-formatted message.
 * Automatically truncates to Telegram's 4096 char limit.
 */
export async function sendMessage(
  chatId: number,
  text: string,
  env: Env,
  options?: { disableWebPagePreview?: boolean },
): Promise<void> {
  const truncated = text.length > 4096 ? text.substring(0, 4093) + '...' : text;
  await callTelegramAPI('sendMessage', {
    chat_id: chatId,
    text: truncated,
    parse_mode: 'HTML',
    disable_web_page_preview: options?.disableWebPagePreview ?? true,
  }, env);
}

/**
 * Send a message with inline keyboard buttons.
 */
export async function sendMessageWithKeyboard(
  chatId: number,
  text: string,
  keyboard: {
    inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>>;
  },
  env: Env,
): Promise<void> {
  const truncated = text.length > 4096 ? text.substring(0, 4093) + '...' : text;
  await callTelegramAPI('sendMessage', {
    chat_id: chatId,
    text: truncated,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: keyboard,
  }, env);
}

/**
 * Fire typing indicator — must be fire-and-forget (do not await in webhook handler).
 * Latency target: < 50ms from webhook receipt.
 */
export async function sendChatAction(
  chatId: number,
  action: 'typing' | 'upload_document' | 'find_location',
  env: Env,
): Promise<void> {
  await callTelegramAPI('sendChatAction', {
    chat_id: chatId,
    action,
  }, env);
}

/**
 * Edit an existing message (progressive status updates: "Searching..." → result).
 */
export async function editMessageText(
  chatId: number,
  messageId: number,
  text: string,
  env: Env,
): Promise<void> {
  const truncated = text.length > 4096 ? text.substring(0, 4093) + '...' : text;
  await callTelegramAPI('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: truncated,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  }, env);
}

/**
 * Acknowledge an inline keyboard button press (removes loading spinner).
 */
export async function answerCallbackQuery(
  callbackQueryId: string,
  text: string | undefined,
  env: Env,
): Promise<void> {
  await callTelegramAPI('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false,
  }, env);
}

/**
 * Register the Telegram webhook URL with Bot API.
 * Call once during deployment setup.
 */
export async function setWebhook(workerUrl: string, env: Env): Promise<void> {
  await callTelegramAPI('setWebhook', {
    url: `${workerUrl}/webhook`,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  }, env);
  console.log(`[TelegramClient] Webhook set to: ${workerUrl}/webhook`);
}
