/**
 * PRJ226 v4.2: SqlStorage-backed SessionRepository for the TelegramSession
 * Durable Object (§7).
 *
 * SQLite provides the uniqueness and constraint guarantees the session state
 * machine relies on: one active session per scope, update_id dedupe,
 * UNIQUE(session_id, seq) turns, and one processing turn at a time.
 *
 * The storage calls use the SqlStorage `exec(query, ...bindings)` cursor API
 * as declared by the bundled `@cloudflare/workers-types`. Row reads go through
 * a small cursor helper; writes discard the cursor.
 */

import type { SqlStorage, SqlStorageCursor, SqlStorageValue } from '@cloudflare/workers-types';
import type {
  InboundRow,
  JobRow,
  JobType,
  SessionRepository,
  SessionRow,
  SessionStatus,
  TurnFragmentRow,
  TurnRow,
  TurnStatus,
} from './sessionRepository';

type SqlRow = Record<string, SqlStorageValue>;

export const SESSION_DDL = `
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  generation INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','closing','closed')),
  started_at INTEGER NOT NULL,
  last_user_activity_at INTEGER NOT NULL,
  logical_expires_at INTEGER NOT NULL,
  closed_at INTEGER,
  close_reason TEXT,
  summary_status TEXT NOT NULL DEFAULT 'none',
  summary_json TEXT,
  summary_covers_through_seq INTEGER NOT NULL DEFAULT 0,
  current_focus_json TEXT,
  context_version INTEGER NOT NULL DEFAULT 1,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  llm_call_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_one_active ON sessions(status) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS inbound_events (
  update_id INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  telegram_message_id INTEGER,
  callback_query_id TEXT,
  user_id INTEGER NOT NULL,
  chat_id INTEGER NOT NULL,
  thread_id INTEGER,
  telegram_event_at INTEGER,
  received_at INTEGER NOT NULL,
  text TEXT,
  attachment_json TEXT,
  reply_context_json TEXT,
  status TEXT NOT NULL,
  logical_turn_id TEXT,
  error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS turns (
  turn_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  user_text TEXT NOT NULL,
  user_text_hash TEXT NOT NULL,
  assistant_text TEXT,
  status TEXT NOT NULL,
  attempt_token TEXT,
  processing_started_at INTEGER,
  lease_expires_at INTEGER,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at INTEGER,
  intent TEXT,
  standalone_query TEXT,
  entity_json TEXT,
  source_refs_json TEXT,
  model_provider TEXT,
  model_id TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  error_code TEXT,
  error_message_safe TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (session_id, seq)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_turns_one_processing ON turns(session_id) WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id, seq);

CREATE TABLE IF NOT EXISTS turn_fragments (
  turn_id TEXT NOT NULL,
  update_id INTEGER NOT NULL,
  fragment_order INTEGER NOT NULL,
  PRIMARY KEY (turn_id, update_id)
);

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  job_key TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  payload_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_due ON scheduled_jobs(due_at);
`;

function toSession(r: SqlRow): SessionRow {
  return {
    sessionId: String(r.session_id),
    generation: Number(r.generation),
    status: r.status as SessionStatus,
    startedAt: Number(r.started_at),
    lastUserActivityAt: Number(r.last_user_activity_at),
    logicalExpiresAt: Number(r.logical_expires_at),
    closedAt: r.closed_at === null ? null : Number(r.closed_at),
    closeReason: r.close_reason === null ? null : String(r.close_reason),
    summaryStatus: r.summary_status as SessionRow['summaryStatus'],
    summaryJson: r.summary_json === null ? null : String(r.summary_json),
    summaryCoversThroughSeq: Number(r.summary_covers_through_seq),
    currentFocusJson: r.current_focus_json === null ? null : String(r.current_focus_json),
    contextVersion: Number(r.context_version),
    inputTokens: Number(r.input_tokens),
    outputTokens: Number(r.output_tokens),
    llmCallCount: Number(r.llm_call_count),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

function toInbound(r: SqlRow): InboundRow {
  return {
    updateId: Number(r.update_id),
    sessionId: String(r.session_id),
    eventType: r.event_type as InboundRow['eventType'],
    telegramMessageId: r.telegram_message_id === null ? null : Number(r.telegram_message_id),
    callbackQueryId: r.callback_query_id === null ? null : String(r.callback_query_id),
    userId: Number(r.user_id),
    chatId: Number(r.chat_id),
    threadId: r.thread_id === null ? null : Number(r.thread_id),
    telegramEventAt: r.telegram_event_at === null ? null : Number(r.telegram_event_at),
    receivedAt: Number(r.received_at),
    text: r.text === null ? null : String(r.text),
    attachmentJson: r.attachment_json === null ? null : String(r.attachment_json),
    replyContextJson: r.reply_context_json === null ? null : String(r.reply_context_json),
    status: r.status as InboundRow['status'],
    logicalTurnId: r.logical_turn_id === null ? null : String(r.logical_turn_id),
    errorCode: r.error_code === null ? null : String(r.error_code),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

function toTurn(r: SqlRow): TurnRow {
  return {
    turnId: String(r.turn_id),
    sessionId: String(r.session_id),
    generation: Number(r.generation),
    seq: Number(r.seq),
    userText: String(r.user_text),
    userTextHash: String(r.user_text_hash),
    assistantText: r.assistant_text === null ? null : String(r.assistant_text),
    status: r.status as TurnStatus,
    attemptToken: r.attempt_token === null ? null : String(r.attempt_token),
    processingStartedAt: r.processing_started_at === null ? null : Number(r.processing_started_at),
    leaseExpiresAt: r.lease_expires_at === null ? null : Number(r.lease_expires_at),
    retryCount: Number(r.retry_count),
    nextRetryAt: r.next_retry_at === null ? null : Number(r.next_retry_at),
    intent: r.intent === null ? null : String(r.intent),
    standaloneQuery: r.standalone_query === null ? null : String(r.standalone_query),
    entityJson: r.entity_json === null ? null : String(r.entity_json),
    sourceRefsJson: r.source_refs_json === null ? null : String(r.source_refs_json),
    modelProvider: r.model_provider === null ? null : String(r.model_provider),
    modelId: r.model_id === null ? null : String(r.model_id),
    promptTokens: r.prompt_tokens === null ? null : Number(r.prompt_tokens),
    completionTokens: r.completion_tokens === null ? null : Number(r.completion_tokens),
    errorCode: r.error_code === null ? null : String(r.error_code),
    errorMessageSafe: r.error_message_safe === null ? null : String(r.error_message_safe),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

function toJob(r: SqlRow): JobRow {
  return {
    jobKey: String(r.job_key),
    jobType: r.job_type as JobType,
    dueAt: Number(r.due_at),
    payloadJson: r.payload_json === null ? null : String(r.payload_json),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export class SqlSessionRepository implements SessionRepository {
  constructor(private readonly sql: SqlStorage) {
    this.sql.exec(SESSION_DDL);
  }

  // The bundled type requires an explicit generic on exec() even though the
  // query text determines the row shape, so we route through these helpers.
  private all(sql: string, ...bindings: SqlStorageValue[]): SqlRow[] {
    const exec = this.sql.exec as (q: string, ...b: SqlStorageValue[]) => SqlStorageCursor<SqlRow>;
    return exec(sql, ...bindings).toArray();
  }

  private first(sql: string, ...bindings: SqlStorageValue[]): SqlRow | null {
    const all = this.all(sql, ...bindings);
    return all[0] ?? null;
  }

  private run(sql: string, ...bindings: SqlStorageValue[]): void {
    const exec = this.sql.exec as (q: string, ...b: SqlStorageValue[]) => SqlStorageCursor<SqlRow>;
    exec(sql, ...bindings);
  }

  // ── sessions ──
  async getActiveSession(): Promise<SessionRow | null> {
    const row = this.first(`SELECT * FROM sessions WHERE status = 'active' LIMIT 1`);
    return row ? toSession(row) : null;
  }

  async getSession(sessionId: string): Promise<SessionRow | null> {
    const row = this.first('SELECT * FROM sessions WHERE session_id = ?', sessionId);
    return row ? toSession(row) : null;
  }

  async getRecentSession(): Promise<SessionRow | null> {
    const row = this.first('SELECT * FROM sessions ORDER BY created_at DESC, generation DESC LIMIT 1');
    return row ? toSession(row) : null;
  }

  async insertSession(row: SessionRow): Promise<void> {
    this.run(
      `INSERT INTO sessions (session_id, generation, status, started_at, last_user_activity_at,
       logical_expires_at, closed_at, close_reason, summary_status, summary_json,
       summary_covers_through_seq, current_focus_json, context_version, input_tokens,
       output_tokens, llm_call_count, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      row.sessionId, row.generation, row.status, row.startedAt, row.lastUserActivityAt,
      row.logicalExpiresAt, row.closedAt, row.closeReason, row.summaryStatus, row.summaryJson,
      row.summaryCoversThroughSeq, row.currentFocusJson, row.contextVersion, row.inputTokens,
      row.outputTokens, row.llmCallCount, row.createdAt, row.updatedAt,
    );
  }

  async updateSession(row: SessionRow): Promise<void> {
    await this.patchSession(row.sessionId, row);
  }

  async patchSession(sessionId: string, patch: Partial<SessionRow>): Promise<void> {
    const fields: string[] = [];
    const values: SqlStorageValue[] = [];
    const map: Array<[keyof SessionRow, string]> = [
      ['generation', 'generation'],
      ['status', 'status'],
      ['startedAt', 'started_at'],
      ['lastUserActivityAt', 'last_user_activity_at'],
      ['logicalExpiresAt', 'logical_expires_at'],
      ['closedAt', 'closed_at'],
      ['closeReason', 'close_reason'],
      ['summaryStatus', 'summary_status'],
      ['summaryJson', 'summary_json'],
      ['summaryCoversThroughSeq', 'summary_covers_through_seq'],
      ['currentFocusJson', 'current_focus_json'],
      ['contextVersion', 'context_version'],
      ['inputTokens', 'input_tokens'],
      ['outputTokens', 'output_tokens'],
      ['llmCallCount', 'llm_call_count'],
      ['updatedAt', 'updated_at'],
    ];
    for (const [key, col] of map) {
      if (key in patch) {
        fields.push(`${col} = ?`);
        values.push(patch[key] ?? null);
      }
    }
    if (fields.length === 0) return;
    this.run(`UPDATE sessions SET ${fields.join(', ')} WHERE session_id = ?`, ...values, sessionId);
  }

  // ── inbound ──
  async getInbound(updateId: number): Promise<InboundRow | null> {
    const row = this.first('SELECT * FROM inbound_events WHERE update_id = ?', updateId);
    return row ? toInbound(row) : null;
  }

  async insertInbound(row: InboundRow): Promise<void> {
    this.run(
      `INSERT OR IGNORE INTO inbound_events (update_id, session_id, event_type, telegram_message_id,
       callback_query_id, user_id, chat_id, thread_id, telegram_event_at, received_at,
       text, attachment_json, reply_context_json, status, logical_turn_id, error_code,
       created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      row.updateId, row.sessionId, row.eventType, row.telegramMessageId, row.callbackQueryId, row.userId,
      row.chatId, row.threadId, row.telegramEventAt, row.receivedAt, row.text,
      row.attachmentJson, row.replyContextJson, row.status, row.logicalTurnId, row.errorCode,
      row.createdAt, row.updatedAt,
    );
  }

  async patchInbound(updateId: number, patch: Partial<InboundRow>): Promise<void> {
    const fields: string[] = [];
    const values: SqlStorageValue[] = [];
    const map: Array<[keyof InboundRow, string]> = [
      ['status', 'status'],
      ['logicalTurnId', 'logical_turn_id'],
      ['errorCode', 'error_code'],
      ['updatedAt', 'updated_at'],
    ];
    for (const [key, col] of map) {
      if (key in patch) {
        fields.push(`${col} = ?`);
        values.push(patch[key] ?? null);
      }
    }
    if (fields.length === 0) return;
    this.run(`UPDATE inbound_events SET ${fields.join(', ')} WHERE update_id = ?`, ...values, updateId);
  }

  // ── turns ──
  async insertTurn(row: TurnRow): Promise<void> {
    this.run(
      `INSERT INTO turns (turn_id, session_id, generation, seq, user_text, user_text_hash,
       assistant_text, status, attempt_token, processing_started_at, lease_expires_at,
       retry_count, next_retry_at, intent, standalone_query, entity_json, source_refs_json,
       model_provider, model_id, prompt_tokens, completion_tokens, error_code,
       error_message_safe, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      row.turnId, row.sessionId, row.generation, row.seq, row.userText, row.userTextHash,
      row.assistantText, row.status, row.attemptToken, row.processingStartedAt,
      row.leaseExpiresAt, row.retryCount, row.nextRetryAt, row.intent, row.standaloneQuery,
      row.entityJson, row.sourceRefsJson, row.modelProvider, row.modelId, row.promptTokens,
      row.completionTokens, row.errorCode, row.errorMessageSafe, row.createdAt, row.updatedAt,
    );
  }

  async patchTurn(turnId: string, patch: Partial<TurnRow>): Promise<void> {
    const fields: string[] = [];
    const values: SqlStorageValue[] = [];
    const map: Array<[keyof TurnRow, string]> = [
      ['assistantText', 'assistant_text'],
      ['status', 'status'],
      ['attemptToken', 'attempt_token'],
      ['processingStartedAt', 'processing_started_at'],
      ['leaseExpiresAt', 'lease_expires_at'],
      ['retryCount', 'retry_count'],
      ['nextRetryAt', 'next_retry_at'],
      ['intent', 'intent'],
      ['standaloneQuery', 'standalone_query'],
      ['entityJson', 'entity_json'],
      ['sourceRefsJson', 'source_refs_json'],
      ['modelProvider', 'model_provider'],
      ['modelId', 'model_id'],
      ['promptTokens', 'prompt_tokens'],
      ['completionTokens', 'completion_tokens'],
      ['errorCode', 'error_code'],
      ['errorMessageSafe', 'error_message_safe'],
      ['updatedAt', 'updated_at'],
    ];
    for (const [key, col] of map) {
      if (key in patch) {
        fields.push(`${col} = ?`);
        values.push(patch[key] ?? null);
      }
    }
    if (fields.length === 0) return;
    this.run(`UPDATE turns SET ${fields.join(', ')} WHERE turn_id = ?`, ...values, turnId);
  }

  async getTurn(turnId: string): Promise<TurnRow | null> {
    const row = this.first('SELECT * FROM turns WHERE turn_id = ?', turnId);
    return row ? toTurn(row) : null;
  }

  async getTurnsForSession(sessionId: string): Promise<TurnRow[]> {
    return this.all('SELECT * FROM turns WHERE session_id = ? ORDER BY seq ASC', sessionId).map(toTurn);
  }

  async getProcessingTurn(sessionId: string): Promise<TurnRow | null> {
    const row = this.first(
      `SELECT * FROM turns WHERE session_id = ? AND status = 'processing' LIMIT 1`,
      sessionId,
    );
    return row ? toTurn(row) : null;
  }

  async getNextEligibleTurn(sessionId: string, now: number): Promise<TurnRow | null> {
    const row = this.first(
      `SELECT * FROM turns
       WHERE session_id = ?
         AND (status = 'queued'
              OR (status = 'retryable_failed' AND next_retry_at IS NOT NULL AND next_retry_at <= ?))
       ORDER BY seq ASC LIMIT 1`,
      sessionId, now,
    );
    return row ? toTurn(row) : null;
  }

  async getLastTurn(sessionId: string): Promise<TurnRow | null> {
    const row = this.first('SELECT * FROM turns WHERE session_id = ? ORDER BY seq DESC LIMIT 1', sessionId);
    return row ? toTurn(row) : null;
  }

  async maxSeq(sessionId: string): Promise<number> {
    const row = this.first('SELECT COALESCE(MAX(seq), 0) AS m FROM turns WHERE session_id = ?', sessionId);
    return Number(row?.m ?? 0);
  }

  // ── fragments ──
  async insertTurnFragment(row: TurnFragmentRow): Promise<void> {
    this.run(
      'INSERT OR IGNORE INTO turn_fragments (turn_id, update_id, fragment_order) VALUES (?,?,?)',
      row.turnId, row.updateId, row.fragmentOrder,
    );
  }

  async getTurnFragments(turnId: string): Promise<TurnFragmentRow[]> {
    return this.all('SELECT * FROM turn_fragments WHERE turn_id = ? ORDER BY fragment_order ASC', turnId).map(
      (r) => ({
        turnId: String(r.turn_id),
        updateId: Number(r.update_id),
        fragmentOrder: Number(r.fragment_order),
      }),
    );
  }

  // ── jobs ──
  async getJob(jobKey: string): Promise<JobRow | null> {
    const row = this.first('SELECT * FROM scheduled_jobs WHERE job_key = ?', jobKey);
    return row ? toJob(row) : null;
  }

  async upsertJob(job: JobRow): Promise<void> {
    this.run(
      `INSERT INTO scheduled_jobs (job_key, job_type, due_at, payload_json, created_at, updated_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(job_key) DO UPDATE SET due_at = excluded.due_at,
         job_type = excluded.job_type, payload_json = excluded.payload_json,
         updated_at = excluded.updated_at`,
      job.jobKey, job.jobType, job.dueAt, job.payloadJson, job.createdAt, job.updatedAt,
    );
  }

  async deleteJob(jobKey: string): Promise<void> {
    this.run('DELETE FROM scheduled_jobs WHERE job_key = ?', jobKey);
  }

  async getDueJobs(now: number, limit: number): Promise<JobRow[]> {
    return this.all(
      'SELECT * FROM scheduled_jobs WHERE due_at <= ? ORDER BY due_at ASC, created_at ASC LIMIT ?',
      now, limit,
    ).map(toJob);
  }

  async getEarliestJobDue(): Promise<number | null> {
    const row = this.first('SELECT MIN(due_at) AS m FROM scheduled_jobs');
    const m = row?.m;
    return m === null || m === undefined ? null : Number(m);
  }

  async purgeSession(sessionId: string): Promise<void> {
    this.run('BEGIN IMMEDIATE');
    try {
      this.run('DELETE FROM inbound_events WHERE session_id = ?', sessionId);
      this.run('DELETE FROM turn_fragments WHERE turn_id IN (SELECT turn_id FROM turns WHERE session_id = ?)', sessionId);
      this.run('DELETE FROM turns WHERE session_id = ?', sessionId);
      this.run('DELETE FROM sessions WHERE session_id = ?', sessionId);
      this.run('COMMIT');
    } catch (err) {
      this.run('ROLLBACK');
      throw err;
    }
  }

  // ── misc ──
  async runInTransaction<T>(fn: () => T | Promise<T>): Promise<T> {
    this.run('BEGIN IMMEDIATE');
    try {
      const result = await fn();
      this.run('COMMIT');
      return result;
    } catch (err) {
      this.run('ROLLBACK');
      throw err;
    }
  }
}
