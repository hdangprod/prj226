/**
 * PRJ226 v4.2: Ingress update schema validation (§6.1).
 *
 * The webhook validates the Telegram payload shape before authorization,
 * scope derivation, or durable acceptance. Unsupported shapes are rejected
 * safely (HTTP 200, no retry).
 */

import { z } from 'zod';

const FromSchema = z.object({
  id: z.number().int(),
  is_bot: z.boolean().optional(),
  username: z.string().optional(),
  first_name: z.string().optional(),
});

const ChatSchema = z.object({
  id: z.number().int(),
  type: z.string(),
  is_forum: z.boolean().optional(),
});

const VoiceSchema = z.object({
  file_id: z.string(),
  duration: z.number().int().nonnegative(),
  file_size: z.number().int().nonnegative().optional(),
});

const MessageSchema = z.object({
  message_id: z.number().int().positive(),
  date: z.number().int().nonnegative(),
  from: FromSchema.optional(),
  chat: ChatSchema,
  message_thread_id: z.number().int().positive().optional(),
  is_topic_message: z.boolean().optional(),
  text: z.string().optional(),
  voice: VoiceSchema.optional(),
  reply_to_message: z.unknown().optional(),
});

const CallbackQuerySchema = z.object({
  id: z.string().min(1),
  from: FromSchema,
  message: z.object({ chat: ChatSchema }).optional(),
  data: z.string().optional(),
});

export const TelegramUpdateSchema = z.object({
  update_id: z.number().int().positive(),
  message: MessageSchema.optional(),
  callback_query: CallbackQuerySchema.optional(),
});

export type ValidatedTelegramUpdate = z.infer<typeof TelegramUpdateSchema>;

export type ParsedUpdate =
  | { ok: true; value: ValidatedTelegramUpdate }
  | { ok: false; reason: 'invalid_json' | 'invalid_shape' | 'unsupported_type' };

export function parseTelegramUpdate(input: unknown): ParsedUpdate {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, reason: 'invalid_shape' };
  }

  const result = TelegramUpdateSchema.safeParse(input);
  if (!result.success) {
    return { ok: false, reason: 'invalid_shape' };
  }

  const value = result.data;
  const hasMessage = !!value.message;
  const hasCallback = !!value.callback_query;
  if (!hasMessage && !hasCallback) {
    return { ok: false, reason: 'unsupported_type' };
  }

  return { ok: true, value };
}
