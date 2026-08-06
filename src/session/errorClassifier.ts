/**
 * PRJ226 v4.2: Telegram transport error classification (§14.9).
 *
 * Classifies a failed Telegram API call so the outbox can decide between:
 * retryable (with retry_after), fallback-and-retry (formatting), or terminal.
 */

export interface TelegramFailureInput {
  httpStatus: number;
  errorCode?: number;
  description?: string;
  retryAfterSeconds?: number;
}

export type TelegramErrorClassification =
  | { kind: 'retryable'; retryAfterSeconds?: number }
  | { kind: 'fallback'; reason: string }
  | { kind: 'terminal'; reason: string; treatedAsDelivered?: boolean };

const TERMINAL_DESCRIPTION_PATTERNS: Array<{ pattern: RegExp; reason: string; delivered?: boolean }> = [
  { pattern: /bot was blocked by the user/i, reason: 'bot_blocked' },
  { pattern: /chat not found/i, reason: 'chat_not_found' },
  { pattern: /message to (edit|reply|delete) not found/i, reason: 'message_not_found' },
  { pattern: /message is not modified/i, reason: 'message_unchanged', delivered: true },
  { pattern: /can't initiate conversation with a user/i, reason: 'cannot_initiate' },
  { pattern: /bad request: chat_id is empty/i, reason: 'invalid_target' },
  { pattern: /group chat was migrated/i, reason: 'chat_migrated' },
  { pattern: /wrong file identifier/i, reason: 'invalid_file' },
];

const FALLBACK_PATTERN = /can't parse entities|can't parse|parse error/i;

export function classifyTelegramError(failure: TelegramFailureInput): TelegramErrorClassification {
  const desc = failure.description ?? '';
  const status = failure.httpStatus;

  // Terminal / delivered patterns take precedence over the generic 4xx class.
  for (const t of TERMINAL_DESCRIPTION_PATTERNS) {
    if (t.pattern.test(desc)) {
      return { kind: 'terminal', reason: t.reason, treatedAsDelivered: t.delivered };
    }
  }

  if (status === 429) {
    return { kind: 'retryable', retryAfterSeconds: failure.retryAfterSeconds };
  }
  if (status >= 500 && status < 600) {
    return { kind: 'retryable' };
  }
  if (status === 408 || status === 0) {
    return { kind: 'retryable' };
  }

  if (status >= 400 && status < 500 && FALLBACK_PATTERN.test(desc)) {
    return { kind: 'fallback', reason: 'parse_error' };
  }

  if (status >= 400 && status < 500) {
    return { kind: 'terminal', reason: 'client_error' };
  }

  return { kind: 'retryable' };
}

export function isTransientLlmFailure(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status < 600);
}
