import { config } from '../config';

const BASE_URL = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}`;

export class TelegramClient {
  /**
   * Sends a message to a specific Telegram chat.
   */
  public async sendMessage(
    chatId: number | string,
    text: string,
    options: Record<string, any> = {}
  ): Promise<any> {
    const url = `${BASE_URL}/sendMessage`;
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown',
      ...options
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        console.error(`Telegram sendMessage failed with status ${res.status}:`, JSON.stringify(data));
      }
      return data;
    } catch (error) {
      console.error('Error in TelegramClient sendMessage:', error);
      throw error;
    }
  }

  /**
   * Edits the text of an existing Telegram message.
   */
  public async editMessageText(
    chatId: number | string,
    messageId: number,
    text: string,
    options: Record<string, any> = {}
  ): Promise<any> {
    const url = `${BASE_URL}/editMessageText`;
    const payload = {
      chat_id: chatId,
      message_id: messageId,
      text: text,
      parse_mode: 'Markdown',
      ...options
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        console.error(`Telegram editMessageText failed with status ${res.status}:`, JSON.stringify(data));
      }
      return data;
    } catch (error) {
      console.error('Error in TelegramClient editMessageText:', error);
      throw error;
    }
  }

  /**
   * Answers a callback query from an inline keyboard button click.
   */
  public async answerCallbackQuery(
    callbackQueryId: string,
    text: string = ''
  ): Promise<any> {
    const url = `${BASE_URL}/answerCallbackQuery`;
    const payload = {
      callback_query_id: callbackQueryId,
      text: text
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        console.error(`Telegram answerCallbackQuery failed with status ${res.status}:`, JSON.stringify(data));
      }
      return data;
    } catch (error) {
      console.error('Error in TelegramClient answerCallbackQuery:', error);
      throw error;
    }
  }
}

export const telegramClient = new TelegramClient();
