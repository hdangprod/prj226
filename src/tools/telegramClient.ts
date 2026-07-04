import { config } from '../config';

const TELEGRAM_API_URL = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}`;
const TELEGRAM_FILE_URL = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}`;

export interface InlineKeyboardMarkup {
  inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>>;
}

/**
 * Mock storage for local test assertions.
 */
export const sentMessages: Array<{ chatId: number | string; text: string; replyMarkup?: any }> = [];
export function clearSentMessages() {
  sentMessages.length = 0;
}

/**
 * Escape special characters for Telegram HTML parse mode.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Sleep helper for backoff
 */
const sleep = (ms: number) => new Promise((resolve) => resolve(null));

/**
 * Generic request wrapper with exponential backoff for Telegram API calls.
 */
async function callTelegramApi(endpoint: string, payload: any, retries = 3): Promise<any> {
  // If in test environment, mock the call offline
  if (process.env.NODE_ENV === 'test') {
    if (endpoint === 'sendMessage') {
      sentMessages.push({ chatId: payload.chat_id, text: payload.text, replyMarkup: payload.reply_markup });
      console.log(`[Telegram Mock] sendMessage to ${payload.chat_id}: ${payload.text}`);
    } else if (endpoint === 'editMessageText') {
      sentMessages.push({ chatId: payload.chat_id, text: payload.text, replyMarkup: payload.reply_markup });
      console.log(`[Telegram Mock] editMessageText to ${payload.chat_id}: ${payload.text}`);
    } else if (endpoint === 'answerCallbackQuery') {
      console.log(`[Telegram Mock] answerCallbackQuery (id: ${payload.callback_query_id})`);
    }
    return { message_id: 12345 };
  }

  let delay = 1000;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${TELEGRAM_API_URL}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body: any = await response.json();

      if (response.status === 429) {
        const retryAfter = body.parameters?.retry_after ?? 1;
        console.warn(`[Telegram] Rate limited (429). Retrying after ${retryAfter}s. Attempt ${attempt + 1}/${retries}`);
        await sleep(retryAfter * 1000);
        continue;
      }

      if (!response.ok || !body.ok) {
        console.error(`[Telegram] ${endpoint} failed:`, JSON.stringify(body));
        throw new Error(`[Telegram] ${endpoint} failed: ${JSON.stringify(body)}`);
      }

      return body.result;
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      console.warn(`[Telegram] API error on ${endpoint}. Retrying in ${delay}ms...`, error);
      await sleep(delay);
      delay *= 2;
    }
  }
}

export async function sendMessage(
  chatId: number | string,
  text: string,
  replyMarkup?: InlineKeyboardMarkup
): Promise<any> {
  const payload: any = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML',
  };

  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  return callTelegramApi('sendMessage', payload);
}

export async function editMessageText(
  chatId: number | string,
  messageId: number,
  text: string,
  replyMarkup?: InlineKeyboardMarkup
): Promise<any> {
  const payload: any = {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: 'HTML',
  };

  if (replyMarkup !== undefined) {
    payload.reply_markup = replyMarkup;
  }

  return callTelegramApi('editMessageText', payload);
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<any> {
  const payload: any = {
    callback_query_id: callbackQueryId,
  };

  if (text) {
    payload.text = text;
  }

  return callTelegramApi('answerCallbackQuery', payload);
}

/**
 * Retrieves file path details from Telegram server for a given file_id.
 */
export async function getFilePath(fileId: string): Promise<string> {
  if (process.env.NODE_ENV === 'test') {
    return `photos/file_${fileId}.ogg`;
  }
  const result = await callTelegramApi('getFile', { file_id: fileId });
  if (!result.file_path) {
    throw new Error(`[Telegram] getFile did not return a file_path for fileId ${fileId}`);
  }
  return result.file_path;
}

/**
 * Downloads a file from Telegram using its file path and returns it as an ArrayBuffer.
 */
export async function downloadFile(filePath: string): Promise<ArrayBuffer> {
  if (process.env.NODE_ENV === 'test') {
    // Return empty mock buffer for testing
    return new ArrayBuffer(0);
  }
  const url = `${TELEGRAM_FILE_URL}/${filePath}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`[Telegram] Failed to download file from path: ${filePath}, status: ${response.status}`);
  }
  return response.arrayBuffer();
}
