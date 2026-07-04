import { sendMessage, escapeHtml } from '../tools/telegramClient';
import { BOT_MESSAGES } from '../constants/messages';

/**
 * Extracts the chatId from a Telegram update payload.
 */
function extractChatId(payload: any): number | string | undefined {
  if (payload?.message?.chat?.id) {
    return payload.message.chat.id;
  }
  if (payload?.callback_query?.message?.chat?.id) {
    return payload.callback_query.message.chat.id;
  }
  return undefined;
}

/**
 * The core worker payload handler. Completely wrapped in a global try-catch
 * to guarantee that unhandled errors are reported back to the user on Telegram.
 */
export async function handleWorkerPayload(payload: any): Promise<void> {
  const chatId = extractChatId(payload);

  try {
    const messageText = payload?.message?.text?.trim();

    if (messageText && messageText.startsWith('/start')) {
      if (chatId) {
        await sendMessage(chatId, BOT_MESSAGES.GREETINGS.WELCOME);
      }
      return;
    }

    // Default placeholder for other commands until Slices are added
    if (chatId && messageText) {
      await sendMessage(chatId, `Received: "${escapeHtml(messageText)}". Intent classification will be added in subsequent slices.`);
    }
  } catch (error) {
    console.error('[Worker] Global Catch - Unhandled error:', error);
    
    if (chatId) {
      try {
        const errorMsg = error instanceof Error ? error.message : String(error);
        await sendMessage(
          chatId,
          BOT_MESSAGES.ERRORS.SOMETHING_WENT_WRONG(escapeHtml(errorMsg))
        );
      } catch (tgError) {
        console.error('[Worker] Global Catch - Failed to send Telegram error message:', tgError);
      }
    }
  }
}
