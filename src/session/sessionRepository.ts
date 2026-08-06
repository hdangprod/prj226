/**
 * PRJ226 v4.2: Session repository contracts (§7).
 *
 * The TelegramSession Durable Object is the sole authority for active session
 * state. All state lives in the scope's SQLite storage. To keep the state
 * machine testable without the Cloudflare runtime, the engine talks to a
 * `SessionRepository` interface; a SqlStorage-backed implementation and an
 * in-memory test implementation both satisfy it.
 */

export type SessionStatus = 'active' | 'closing' | 'closed';
export type TurnStatus =
  | 'queued'
  | 'processing'
  | 'response_ready'
  | 'delivery_pending'
  | 'delivered'
  | 'retryable_failed'
  | 'terminal_failed'
  | 'cancelled';

export type InboundStatus =
  | 'accepted'
  | 'debounce_pending'
  | 'grouped'
  | 'queued'
  | 'cancelled'
  | 'ignored'
  | 'failed'
  | 'late_arrival';

export interface SessionRow {
  sessionId: string;
  generation: number;
  status: SessionStatus;
  startedAt: number;
  lastUserActivityAt: number;
  logicalExpiresAt: number;
  closedAt: number | null;
  closeReason: string | null;
  summaryStatus: 'none' | 'pending' | 'ready' | 'failed';
  summaryJson: string | null;
  summaryCoversThroughSeq: number;
  currentFocusJson: string | null;
  contextVersion: number;
  inputTokens: number;
  outputTokens: number;
  llmCallCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface InboundRow {
  updateId: number;
  sessionId: string;
  eventType: 'message' | 'callback_query';
  telegramMessageId: number | null;
  callbackQueryId: string | null;
  userId: number;
  chatId: number;
  threadId: number | null;
  telegramEventAt: number | null;
  receivedAt: number;
  text: string | null;
  attachmentJson: string | null;
  replyContextJson: string | null;
  status: InboundStatus;
  logicalTurnId: string | null;
  errorCode: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TurnRow {
  turnId: string;
  sessionId: string;
  generation: number;
  seq: number;
  userText: string;
  userTextHash: string;
  assistantText: string | null;
  status: TurnStatus;
  attemptToken: string | null;
  processingStartedAt: number | null;
  leaseExpiresAt: number | null;
  retryCount: number;
  nextRetryAt: number | null;
  intent: string | null;
  standaloneQuery: string | null;
  entityJson: string | null;
  sourceRefsJson: string | null;
  modelProvider: string | null;
  modelId: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  errorCode: string | null;
  errorMessageSafe: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TurnFragmentRow {
  turnId: string;
  updateId: number;
  fragmentOrder: number;
}

export type JobType =
  | 'debounce_flush'
  | 'turn_retry'
  | 'context_compaction'
  | 'session_archive'
  | 'closed_session_purge'
  | 'outbox_retry';

export interface JobRow {
  jobKey: string;
  jobType: JobType;
  dueAt: number;
  payloadJson: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SessionRepository {
  // ── sessions ──
  getActiveSession(): Promise<SessionRow | null>;
  getSession(sessionId: string): Promise<SessionRow | null>;
  /** Most recently created session in the scope, regardless of status. Used to derive the next generation. */
  getRecentSession(): Promise<SessionRow | null>;
  insertSession(row: SessionRow): Promise<void>;
  updateSession(row: SessionRow): Promise<void>;
  /** Partially updates only the mutable fields of an existing session. */
  patchSession(sessionId: string, patch: Partial<SessionRow>): Promise<void>;

  // ── inbound events ──
  getInbound(updateId: number): Promise<InboundRow | null>;
  insertInbound(row: InboundRow): Promise<void>;
  patchInbound(updateId: number, patch: Partial<InboundRow>): Promise<void>;

  // ── turns ──
  insertTurn(row: TurnRow): Promise<void>;
  patchTurn(turnId: string, patch: Partial<TurnRow>): Promise<void>;
  getTurn(turnId: string): Promise<TurnRow | null>;
  getTurnsForSession(sessionId: string): Promise<TurnRow[]>;
  getProcessingTurn(sessionId: string): Promise<TurnRow | null>;
  getNextEligibleTurn(sessionId: string, now: number): Promise<TurnRow | null>;
  getLastTurn(sessionId: string): Promise<TurnRow | null>;
  maxSeq(sessionId: string): Promise<number>;

  // ── turn fragments ──
  insertTurnFragment(row: TurnFragmentRow): Promise<void>;
  getTurnFragments(turnId: string): Promise<TurnFragmentRow[]>;

  // ── scheduled jobs ──
  getJob(jobKey: string): Promise<JobRow | null>;
  upsertJob(job: JobRow): Promise<void>;
  deleteJob(jobKey: string): Promise<void>;
  getDueJobs(now: number, limit: number): Promise<JobRow[]>;
  getEarliestJobDue(): Promise<number | null>;

  /** Deletes a closed session and all of its raw data (turns, fragments, inbound). */
  purgeSession(sessionId: string): Promise<void>;

  // ── misc ──
  runInTransaction<T>(fn: () => T | Promise<T>): Promise<T>;
}
