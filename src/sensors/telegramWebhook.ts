import type { Env } from '../config';
import { sendChatAction, sendMessage } from '../tools/telegramClient';
import { handleWorkerPayload } from '../governance/intentRouter';
import { D1Client } from '../tools/d1Client';
import { batchCommitCaptures } from '../tools/gitBatchClient';
import { getLocalDate } from '../lib/dateUtils';
import { isSessionFeatureEnabled } from '../session/featureFlag';
import { handleSessionIngress } from '../session/ingress';

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; is_bot: boolean; first_name: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
    voice?: { file_id: string; duration: number };
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
  if (!chatId) return;

  // Session-based workflow (v4.2): durable acceptance happens before HTTP 200.
  // Idempotency is enforced inside the Durable Object SQLite dedup table.
  if (isSessionFeatureEnabled(env)) {
    await handleSessionIngress(update, env);
    return;
  }

  // Legacy stateless pipeline (unchanged behavior).
  await handleLegacyIngress(update, env, ctx);
}

export async function handleLegacyIngress(
  update: TelegramUpdate,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  const chatId = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;
  if (!chatId) return;

  const d1 = new D1Client(env);

  // 1. Synchronous Durable Write to D1 raw_inbox_logs before processing
  await d1.saveRawInboxLog(update.update_id, JSON.stringify(update));

  // 2. Idempotency check
  if (await d1.isProcessed(update.update_id)) return;
  await d1.markProcessed(update.update_id);

  // 3. Typing ack
  ctx.waitUntil(sendChatAction(chatId, 'typing', env).catch(() => {}));

  // 4. Callback queries bypass debounce
  if (update.callback_query || update.message?.reply_to_message) {
    ctx.waitUntil(
      handleWorkerPayload(update as unknown as Record<string, unknown>, env)
        .then(() => d1.markRawInboxLogStatus(update.update_id, 'processed'))
        .catch((err) => d1.markRawInboxLogStatus(update.update_id, 'failed', String(err)))
    );
    return;
  }

  // 5. Extract text (with voice transcription + optional R2 audio archival)
  let text = update.message?.text ?? '';
  let audioUrl: string | undefined;

  if (update.message?.voice) {
    const voiceRes = await transcribeAndArchiveVoice(update.message.voice.file_id, env);
    text = voiceRes.transcript;
    audioUrl = voiceRes.audioUrl;
  }
  if (!text.trim()) {
    await d1.markRawInboxLogStatus(update.update_id, 'processed');
    return;
  }

  const userId = update.message?.from?.id ?? chatId;

  // 6. KV Debounce Buffer
  const kvKey = `debounce:${userId}`;
  const prevText = await env.SESSION_KV.get(kvKey);
  const combinedText = prevText ? `${prevText}\n${text}` : text;
  await env.SESSION_KV.put(kvKey, combinedText, { expirationTtl: 60 });

  const isDev = env.GITHUB_REPO?.endsWith('_dev');
  const delayMs = isDev ? 50 : 1500;

  // First message: send ack in production
  if (!prevText && !isDev) {
    ctx.waitUntil(sendMessage(chatId, '⏳ <i>Grouping messages...</i>', env).catch(() => {}));
  }

  // 7. Background debounce finalization & immediate dev flush
  ctx.waitUntil((async () => {
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
    const finalText = await env.SESSION_KV.get(kvKey);
    if (finalText !== combinedText) return; // newer message overwrote, exit

    await env.SESSION_KV.delete(kvKey);

    // Form payload with deterministic capture path if needed
    const payloadText = audioUrl
      ? `--- \naudio_url: "${audioUrl}"\n---\n${finalText}`
      : finalText;

    await handleWorkerPayload(
      { message: { ...update.message, text: payloadText } } as unknown as Record<string, unknown>,
      env,
    );
    await d1.markRawInboxLogStatus(update.update_id, 'processed');

    // Fast testing: immediate GitHub flush in dev environment
    if (isDev) {
      try {
        const pending = await d1.getPendingCaptures(50);
        if (pending.length > 0) {
          await batchCommitCaptures(pending, env);
          await d1.markCapturesFlushed(pending.map((c) => c.id));
          console.log(`[Dev Fast Sync] Flushed ${pending.length} captures immediately to GitHub!`);
        }
      } catch (flushErr) {
        console.error('[Dev Immediate Flush Error]:', flushErr);
      }
    }
  })().catch(async (err) => {
    console.error(`[Background Processing Error] Update ${update.update_id}:`, err);
    await d1.markRawInboxLogStatus(update.update_id, 'failed', String(err));
  }));
}

export function generateDeterministicCapturePath(date: Date = new Date()): string {
  const { dateStr, timePart } = getLocalDate(date);
  const dateCompact = dateStr.replace(/-/g, '');
  const rand = crypto.randomUUID().split('-')[0];
  return `inbox/cap_${dateCompact}_${timePart}_${rand}.md`;
}

async function transcribeAndArchiveVoice(
  fileId: string,
  env: Env
): Promise<{ transcript: string; audioUrl?: string }> {
  // 1. Get file path from Telegram
  const fileRes = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
  const fileData = (await fileRes.json()) as { result: { file_path: string } };

  // 2. Download audio
  const audioRes = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`);
  const audioBuffer = await audioRes.arrayBuffer();

  // 3. Optional Zero-Cost Archival to Cloudflare R2
  let audioUrl: string | undefined;
  if (env.AUDIO_BUCKET) {
    try {
      const date = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const key = `audio/${date.getFullYear()}/${pad(date.getMonth() + 1)}/voice_${date.getTime()}_${fileId.slice(0, 8)}.ogg`;
      await env.AUDIO_BUCKET.put(key, audioBuffer, {
        httpMetadata: { contentType: 'audio/ogg' },
      });
      const domain = env.R2_PUBLIC_DOMAIN || 'https://pub-xxx.r2.dev';
      audioUrl = `${domain}/${key}`;
    } catch (err) {
      console.warn('[R2 Voice Archival Error] Non-critical upload failure:', err);
    }
  }

  // 4. Transcribe with Whisper
  const result = await env.AI.run('@cf/openai/whisper-large-v3-turbo' as any, { audio: [...new Uint8Array(audioBuffer)] });
  const transcript = (result as any).text || '';

  return { transcript, audioUrl };
}
