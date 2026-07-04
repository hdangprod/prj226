import { sendMessage } from '../tools/telegramClient';
import { saveSession } from '../tools/firestoreClient';
import type { InlineKeyboardMarkup } from '../tools/telegramClient';
import { BOT_MESSAGES } from '../constants/messages';

/**
 * Known intents that can be presented as HITL confirmation options.
 */
const HITL_INTENT_OPTIONS = [
  { label: '📝 Thêm Task', intent: 'Add Task' },
  { label: '⚡ Cứu vãn tập trung', intent: 'Rescue' },
  { label: '📌 Ghi nhận thành tựu', intent: 'Highlight' },
  { label: '📅 Lập kế hoạch tuần', intent: 'Weekly Planning' },
] as const;

/**
 * HITL Manager: Handles low-confidence intent routing.
 *
 * When the Gemini LITE classifier returns a confidence_score < 95%,
 * this manager:
 *   1. Persists the pending input into Firestore under state `AWAITING_HITL_CONFIRMATION`
 *   2. Presents an inline keyboard to the user with all known intents
 *   3. Appends a `[❌ Hủy bỏ]` button with callback `hitl_cancel` for session cleanup
 *
 * The user's selection is handled back in `intentRouter.ts` via the
 * `hitl_confirm:<intent>` callback data pattern.
 *
 * @param chatId - Telegram chat ID
 * @param originalText - The original user message that triggered low confidence
 * @param classifiedIntent - The best-guess intent from Gemini
 * @param confidenceScore - The confidence score returned by Gemini
 * @param reasoning - Gemini's reasoning for the classification
 */
export async function requestHitlConfirmation(
  chatId: number | string,
  originalText: string,
  classifiedIntent: string,
  confidenceScore: number,
  reasoning: string,
): Promise<void> {
  // Persist state to Firestore for session continuity
  await saveSession(chatId, {
    state: 'AWAITING_HITL_CONFIRMATION',
    originalText,
    classifiedIntent,
    confidenceScore,
    reasoning,
  });

  // Build the inline keyboard with all intent options + cancel button
  const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];

  for (const option of HITL_INTENT_OPTIONS) {
    // Highlight the AI's best guess with a ✨ marker
    const isGuess = option.intent === classifiedIntent;
    const label = isGuess ? `${option.label} ✨` : option.label;
    keyboard.push([{ text: label, callback_data: `hitl_confirm:${option.intent}` }]);
  }

  // Always append the cancel button as the final row (per AGENTS.md requirement)
  keyboard.push([{ text: '❌ Hủy bỏ', callback_data: 'hitl_cancel' }]);

  const replyMarkup: InlineKeyboardMarkup = { inline_keyboard: keyboard };

  // Build clarification message
  const message =
    `🤔 Liam chưa chắc chắn ý định của Sếp (${confidenceScore}% confidence).\n\n` +
    `<b>Tin nhắn:</b> <i>"${originalText}"</i>\n` +
    `<b>Dự đoán:</b> ${classifiedIntent} — ${reasoning}\n\n` +
    `Sếp muốn thực hiện hành động nào?`;

  await sendMessage(chatId, message, replyMarkup);
}
