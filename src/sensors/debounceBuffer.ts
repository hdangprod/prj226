import { DEBOUNCE_CONFIG } from '../config';
import { sendChatAction } from '../tools/telegramClient';
import { transcribeVoiceNote } from './voiceProcessor';
import {
  rpushBuffer,
  getBufferLength,
  setBufferTime,
  getBufferTime,
  flushBuffer,
  setTranscribingLock,
  clearTranscribingLock,
  isTranscribing,
  isRedisAvailable,
} from '../tools/redisClient';
import { scheduleBufferFlush } from '../tools/qstashClient';
import { handleWorkerPayload } from '../governance/intentRouter';
import { BOT_MESSAGES } from '../constants/messages';

/**
 * Result type returned by ingestMessage to inform the caller
 * how to proceed in the webhook handler.
 *
 *   - 'buffered':  Message stored in Redis. QStash timer scheduled. No further action needed.
 *   - 'fallback':  Redis is unavailable. Caller must dispatch directly (fail-open ERR-05).
 */
export type IngestResult = 'buffered' | 'fallback';

/**
 * Checks if the debounce buffer feature is enabled for a given chatId.
 * Supports kill-switch (FEATURE_DEBOUNCE_BUFFER) and phased rollout (WHITELIST_CHAT_IDS).
 */
export function isDebounceEnabled(chatId: number | string): boolean {
  if (!DEBOUNCE_CONFIG.FEATURE_DEBOUNCE_BUFFER) return false;

  // If whitelist is configured, only debounce for whitelisted chats (Phase 1 Alpha)
  if (DEBOUNCE_CONFIG.WHITELIST_CHAT_IDS) {
    const numericId = typeof chatId === 'string' ? parseInt(chatId, 10) : chatId;
    return DEBOUNCE_CONFIG.WHITELIST_CHAT_IDS.includes(numericId);
  }

  // No whitelist = GA (Global Availability)
  return true;
}

/**
 * Ingestion Phase (PRD MOD-07 Section 3.1)
 *
 * Receives a raw Telegram webhook payload and buffers its text content
 * in Redis. Schedules a QStash delayed callback to flush the buffer
 * after DEBOUNCE_BUFFER_TIME_MS of inactivity.
 *
 * @returns 'buffered' if the message was stored successfully,
 *          'fallback' if Redis is unavailable and the caller should dispatch directly.
 */
export async function ingestMessage(payload: any): Promise<IngestResult> {
  const chatId = extractChatId(payload);
  if (!chatId) {
    console.error('[DebounceBuffer] Could not extract chatId from payload');
    return 'fallback';
  }

  // ERR-05: Check Redis availability for fail-open fallback
  const redisUp = await isRedisAvailable();
  if (!redisUp) {
    console.warn('[DebounceBuffer] Redis unavailable. Returning fallback signal.');
    return 'fallback';
  }

  const isVoice = !!(payload?.message?.voice);
  const text = payload?.message?.text?.trim() || '';

  // Determine chat action type based on message content
  const chatAction = isVoice ? 'record_voice' as const : 'typing' as const;

  // ─── Handle Voice Notes (PRD 3.1 Req 6) ───
  if (isVoice) {
    const fileId = payload.message.voice.file_id;
    console.log(`[DebounceBuffer] Voice note detected. file_id: ${fileId}`);

    // Check buffer length BEFORE the voice is added for chat action trigger
    const lengthBefore = await getBufferLength(chatId);
    if (lengthBefore === 0) {
      // First message in session → send chat action immediately (PRD 3.1 Req 5)
      sendChatAction(chatId, chatAction).catch(err =>
        console.error('[DebounceBuffer] sendChatAction error:', err)
      );
    }

    // ERR-02: Spam protection check
    if (lengthBefore >= DEBOUNCE_CONFIG.MAX_BUFFER_SIZE) {
      console.warn(`[DebounceBuffer] Spam protection: buffer for chatId ${chatId} is full (${lengthBefore}). Dropping voice.`);
      return 'buffered';
    }

    // Set transcription lock BEFORE transcription starts
    await setTranscribingLock(chatId);

    try {
      const transcribedText = await transcribeVoiceNote(fileId);
      console.log(`[DebounceBuffer] Voice transcribed: "${transcribedText}"`);

      // Push transcribed text to buffer
      await rpushBuffer(chatId, transcribedText);
      await setBufferTime(chatId);
    } catch (err) {
      console.error('[DebounceBuffer] Voice transcription failed:', err);
    } finally {
      // Always clear transcription lock
      await clearTranscribingLock(chatId);
    }

    // Schedule timer now that transcription is done
    const stillTranscribing = await isTranscribing(chatId);
    if (!stillTranscribing) {
      await scheduleBufferFlush(chatId, DEBOUNCE_CONFIG.BUFFER_TIME_MS);
    }

    return 'buffered';
  }

  // ─── Handle Text Messages ───
  if (!text) {
    console.log('[DebounceBuffer] Empty text message. Skipping buffer.');
    return 'fallback';
  }

  // Check buffer length BEFORE push for first-message detection
  const lengthBefore = await getBufferLength(chatId);

  // ERR-02: Spam protection
  if (lengthBefore >= DEBOUNCE_CONFIG.MAX_BUFFER_SIZE) {
    console.warn(`[DebounceBuffer] Spam protection: buffer for chatId ${chatId} is full (${lengthBefore}). Dropping text.`);
    return 'buffered';
  }

  // First message in session → send typing indicator (PRD 3.1 Req 5)
  if (lengthBefore === 0) {
    sendChatAction(chatId, chatAction).catch(err =>
      console.error('[DebounceBuffer] sendChatAction error:', err)
    );
  }

  // Atomic append to buffer + update timestamp
  await rpushBuffer(chatId, text);
  await setBufferTime(chatId);

  // Check voice transcription lock (PRD 3.1 Req 6)
  // If currently transcribing, do NOT schedule the timer
  const transcribing = await isTranscribing(chatId);
  if (transcribing) {
    console.log(`[DebounceBuffer] Transcription in progress for chatId ${chatId}. Skipping timer schedule.`);
    return 'buffered';
  }

  // Schedule delayed buffer flush via QStash
  await scheduleBufferFlush(chatId, DEBOUNCE_CONFIG.BUFFER_TIME_MS);

  return 'buffered';
}

/**
 * Execution Phase (PRD MOD-07 Section 3.2)
 *
 * Called by QStash after DEBOUNCE_BUFFER_TIME_MS delay.
 * Checks if the buffer is stale enough to flush, then merges
 * all buffered messages and forwards them to intentRouter.
 */
export async function processBuffer(chatId: number | string): Promise<void> {
  console.log(`[DebounceBuffer] processBuffer called for chatId: ${chatId}`);

  // PRD 3.2 Req 2: Check if voice transcription is still in progress
  const transcribing = await isTranscribing(chatId);
  if (transcribing) {
    console.log(`[DebounceBuffer] Transcription still in progress for chatId ${chatId}. Silent exit.`);
    return;
  }

  // PRD 3.2 Req 1-2: Check staleness of buffer
  const lastTime = await getBufferTime(chatId);
  if (lastTime === null) {
    console.log(`[DebounceBuffer] No buffer_time found for chatId ${chatId}. Buffer expired or already flushed.`);
    return;
  }

  const elapsed = Date.now() - lastTime;
  if (elapsed < DEBOUNCE_CONFIG.BUFFER_TIME_MS) {
    console.log(
      `[DebounceBuffer] Buffer for chatId ${chatId} is not stale enough. ` +
      `Elapsed: ${elapsed}ms < ${DEBOUNCE_CONFIG.BUFFER_TIME_MS}ms. Silent exit.`
    );
    return;
  }

  // PRD 3.2 Req 3: Flush buffer and merge messages
  let messages = await flushBuffer(chatId);
  if (messages.length === 0) {
    console.log(`[DebounceBuffer] Buffer empty for chatId ${chatId}. Nothing to process.`);
    return;
  }

  console.log(`[DebounceBuffer] Flushing ${messages.length} messages for chatId ${chatId}`);

  // ERR-02: Spam protection — truncate if exceeding max
  if (messages.length > DEBOUNCE_CONFIG.MAX_BUFFER_SIZE) {
    messages = messages.slice(0, DEBOUNCE_CONFIG.MAX_BUFFER_SIZE);
    messages.push(BOT_MESSAGES.DEBOUNCE.SPAM_TRUNCATED);
  }

  // Merge messages with newline separator
  const mergedText = messages.join('\n');
  console.log(`[DebounceBuffer] Merged text: "${mergedText}"`);

  // Construct synthetic Telegram payload for intentRouter
  const syntheticPayload = {
    message: {
      chat: { id: chatId },
      text: mergedText,
      from: { is_bot: false },
    },
  };

  // Forward to governance layer
  await handleWorkerPayload(syntheticPayload);
}

// ─── Helpers ───

function extractChatId(payload: any): number | string | undefined {
  if (payload?.message?.chat?.id) return payload.message.chat.id;
  if (payload?.callback_query?.message?.chat?.id) return payload.callback_query.message.chat.id;
  return undefined;
}
