/**
 * PRJ226 v4.2: Typed transport & session errors.
 *
 * The Telegram transport layer MUST throw typed errors instead of logging and
 * swallowing (spec §3.6). The outbox classifies retryability (§14.9).
 */

export type TelegramErrorKind = 'retryable' | 'fallback' | 'terminal' | 'ambiguous';

export class TelegramApiError extends Error {
  readonly kind: TelegramErrorKind;
  readonly httpStatus: number;
  readonly errorCode?: number;
  readonly retryAfterSeconds?: number;
  /** When true the API call is considered effectively delivered (e.g. "message is not modified"). */
  readonly treatedAsDelivered?: boolean;

  constructor(params: {
    kind: TelegramErrorKind;
    httpStatus: number;
    message?: string;
    errorCode?: number;
    retryAfterSeconds?: number;
    treatedAsDelivered?: boolean;
  }) {
    super(params.message ?? `Telegram API error (HTTP ${params.httpStatus})`);
    this.kind = params.kind;
    this.httpStatus = params.httpStatus;
    this.errorCode = params.errorCode;
    this.retryAfterSeconds = params.retryAfterSeconds;
    this.treatedAsDelivered = params.treatedAsDelivered ?? false;
  }
}

export function isTelegramApiError(err: unknown): err is TelegramApiError {
  return err instanceof TelegramApiError;
}

export class SessionConfigError extends Error {
  constructor(message: string) {
    super(`[sessionConfig] ${message}`);
  }
}
