import { config } from '../config';

const TELEGRAM_API_URL = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}`;

interface SendMessagePayload {
  chat_id: number | string;
  text: string;
  parse_mode?: string;
  reply_markup?: any;
}

export async function sendMessage(chatId: number | string, text: string, replyMarkup?: any): Promise<any> {
  const payload: SendMessagePayload = {
    chat_id: chatId,
    text: text,
    parse_mode: 'Markdown',
  };

  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  const response = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Telegram] Failed to send message:', errorText);
  }

  return response.json();
}

export async function editMessageText(
  chatId: number | string,
  messageId: number,
  text: string,
  replyMarkup?: any
): Promise<any> {
  const payload: any = {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: 'Markdown',
  };

  if (replyMarkup !== undefined) {
    payload.reply_markup = replyMarkup;
  }

  const response = await fetch(`${TELEGRAM_API_URL}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return response.json();
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<any> {
  const payload: any = {
    callback_query_id: callbackQueryId,
  };

  if (text) {
    payload.text = text;
  }

  const response = await fetch(`${TELEGRAM_API_URL}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return response.json();
}
