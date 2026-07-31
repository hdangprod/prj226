import type { Env } from '../config';
import { sendChatAction, sendMessage } from '../tools/telegramClient';
import { handleWorkerPayload } from '../governance/intentRouter';
import { D1Client } from '../tools/d1Client';

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

  // 1. Idempotency check
  const d1 = new D1Client(env);
  if (await d1.isProcessed(update.update_id)) return;
  await d1.markProcessed(update.update_id);

  // 2. Typing ack
  ctx.waitUntil(sendChatAction(chatId, 'typing', env).catch(() => {}));

  // 3. Callback queries bypass debounce
  if (update.callback_query || update.message?.reply_to_message) {
    ctx.waitUntil(handleWorkerPayload(update as unknown as Record<string, unknown>, env));
    return;
  }

  // 4. Extract text (with voice transcription)
  let text = update.message?.text ?? '';
  if (update.message?.voice) {
    text = await transcribeVoice(update.message.voice.file_id, env);
  }
  if (!text.trim()) return;

  const userId = update.message?.from?.id ?? chatId;

  // 5. KV Debounce Buffer
  const kvKey = `debounce:${userId}`;
  const prevText = await env.SESSION_KV.get(kvKey);
  const combinedText = prevText ? `${prevText}\n${text}` : text;
  await env.SESSION_KV.put(kvKey, combinedText, { expirationTtl: 4 });

  // First message: send ack
  if (!prevText) {
    ctx.waitUntil(sendMessage(chatId, '⏳ <i>Grouping messages...</i>', env).catch(() => {}));
  }

  // 6. Background debounce finalization
  ctx.waitUntil((async () => {
    await new Promise(r => setTimeout(r, 4500));
    const finalText = await env.SESSION_KV.get(kvKey);
    if (finalText !== combinedText) return; // newer message overwrote, exit

    await env.SESSION_KV.delete(kvKey);
    await handleWorkerPayload(
      { message: { ...update.message, text: finalText } } as unknown as Record<string, unknown>,
      env,
    );
  })());
}

async function transcribeVoice(fileId: string, env: Env): Promise<string> {
  // 1. Get file path from Telegram
  const fileRes = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
  const fileData = (await fileRes.json()) as { result: { file_path: string } };
  // 2. Download audio
  const audioRes = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`);
  const audioBuffer = await audioRes.arrayBuffer();
  // 3. Transcribe with Whisper
  const result = await env.AI.run('@cf/openai/whisper-large-v3-turbo' as any, { audio: [...new Uint8Array(audioBuffer)] });
  return (result as any).text || '';
}
