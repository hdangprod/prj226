/**
 * PRJ226 v4.2: Session lifecycle state machine (§8).
 *
 * Pure-with-injectables engine over a SessionRepository. The Durable Object
 * is the sole authority; this engine contains the transitions so they are
 * unit-testable with the in-memory repository and a fake clock.
 *
 * Generation + attempt-token compare-and-set guarantees stale LLM results
 * cannot commit after /end, /new, timeout, cancellation, or retry (INV-02).
 */

import {
  classifyExpiry,
  computeLogicalExpiresAt,
  resolveEventTime,
} from './timeoutPolicy';
import type {
  InboundRow,
  JobRow,
  SessionRepository,
  SessionRow,
  TurnRow,
} from './sessionRepository';
import type { SessionConfig } from './sessionConfig';

export type AcceptResult =
  | { status: 'accepted'; sessionId: string; generation: number }
  | { status: 'duplicate' }
  | { status: 'ignored'; reason: string };

export interface IngressUpdate {
  updateId: number;
  telegramEventAt: number | null;
  receivedAt: number;
  userId: number;
  chatId: number;
  threadId: number | null;
  telegramMessageId: number | null;
  callbackQueryId: string | null;
  eventType: 'message' | 'callback_query';
  text: string | null;
  attachmentJson: string | null;
  replyContextJson: string | null;
}

export interface Lease {
  turnId: string;
  attemptToken: string;
  leaseExpiresAt: number;
}

export interface CommitInput {
  assistantText: string;
  usage: { promptTokens: number; completionTokens: number };
  modelProvider: string;
  modelId: string;
  intent?: string;
  standaloneQuery?: string;
}

export type CommitResult =
  | { committed: true }
  | { committed: false; reason: 'stale' | 'not_processing' };

function newId(): string {
  return crypto.randomUUID();
}

export class SessionEngine {
  constructor(
    private readonly repo: SessionRepository,
    private readonly config: SessionConfig,
  ) {}

  // ── Session creation (§8.3) ──

  /**
   * Generation is monotonic within a scope and persisted in the most recent
   * session row, so it survives Durable Object eviction. A freshly created
   * session takes the last known generation + 1; after full purge it restarts
   * at 1 (there is no prior context to invalidate by then).
   */
  private async nextGeneration(): Promise<number> {
    const recent = await this.repo.getRecentSession();
    if (!recent) return 1;
    return recent.generation + 1;
  }

  private async createSession(now: number, closeReasonForOverflow?: string): Promise<SessionRow> {
    const session: SessionRow = {
      sessionId: newId(),
      generation: await this.nextGeneration(),
      status: 'active',
      startedAt: now,
      lastUserActivityAt: now,
      logicalExpiresAt: computeLogicalExpiresAt(now, this.config.inactivityMinutes),
      closedAt: null,
      closeReason: null,
      summaryStatus: 'none',
      summaryJson: null,
      summaryCoversThroughSeq: 0,
      currentFocusJson: null,
      contextVersion: 1,
      inputTokens: 0,
      outputTokens: 0,
      llmCallCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.insertSession(session);
    return session;
  }

  async getSession(): Promise<SessionRow | null> {
    return this.repo.getActiveSession();
  }

  // ── Inbound dedupe / admission (§10.1, §9.4) ──

  async acceptUpdate(ingress: IngressUpdate): Promise<AcceptResult> {
    const now = ingress.receivedAt;
    const dup = await this.repo.getInbound(ingress.updateId);
    if (dup) return { status: 'duplicate' };

    // Insert the inbound row first inside a transaction so a concurrent
    // duplicate delivery races on the UNIQUE(update_id) constraint, not on
    // our read-then-write.
    const admitted = await this.repo.runInTransaction(() => this.admitTx(ingress, now));
    if (admitted === null) return { status: 'duplicate' };
    return { status: 'accepted', sessionId: admitted.sessionId, generation: admitted.generation };
  }

  private async admitTx(ingress: IngressUpdate, now: number): Promise<SessionRow | null> {
    const existingRow = await this.repo.getInbound(ingress.updateId);
    if (existingRow) return null;

    const resolved = resolveEventTime(
      ingress.telegramEventAt ?? undefined,
      now,
      this.config.maxEventClockSkewMs,
    );

    let session = await this.repo.getActiveSession();
    if (session) {
      const decision = classifyExpiry(
        resolved.eventAtMs,
        session.logicalExpiresAt,
        now,
        this.config.expiryIngressGraceSeconds * 1000,
      );
      if (decision.decision === 'start_new_session') {
        await this.closeSession(session.sessionId, 'timeout_restart', now);
        session = await this.createSession(now);
      }
    } else {
      session = await this.createSession(now);
    }

    // Sliding inactivity window: accepted user activity resets the timer.
    const newExpiresAt = computeLogicalExpiresAt(now, this.config.inactivityMinutes);
    await this.repo.patchSession(session.sessionId, {
      lastUserActivityAt: now,
      logicalExpiresAt: newExpiresAt,
    });
    session = { ...session, lastUserActivityAt: now, logicalExpiresAt: newExpiresAt };

    const row: InboundRow = {
      updateId: ingress.updateId,
      sessionId: session.sessionId,
      eventType: ingress.eventType,
      telegramMessageId: ingress.telegramMessageId,
      callbackQueryId: ingress.callbackQueryId,
      userId: ingress.userId,
      chatId: ingress.chatId,
      threadId: ingress.threadId,
      telegramEventAt: ingress.telegramEventAt,
      receivedAt: now,
      text: ingress.text,
      attachmentJson: ingress.attachmentJson,
      replyContextJson: ingress.replyContextJson,
      status: 'accepted',
      logicalTurnId: null,
      errorCode: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.insertInbound(row);
    return session;
  }

  // ── Queued turn creation (§10.6) ──

  /**
   * Durable acceptance + (interim) immediate queueing. A duplicate or
   * non-message update is accepted without creating a turn, so a re-delivered
   * update_id can never create a second turn. Phase 4 replaces immediate
   * queueing with debounce grouping.
   */
  async acceptAndQueueTurn(ingress: IngressUpdate): Promise<AcceptResult> {
    const accepted = await this.acceptUpdate(ingress);
    if (accepted.status !== 'accepted') return accepted;

    const text = ingress.text?.trim();
    if (!text) return accepted;

    const session = await this.repo.getActiveSession();
    if (!session || session.sessionId !== accepted.sessionId) return accepted;

    const turn = await this.createTurn(session, text, ingress.receivedAt);
    await this.repo.insertTurnFragment({
      turnId: turn.turnId,
      updateId: ingress.updateId,
      fragmentOrder: 0,
    });
    await this.repo.patchInbound(ingress.updateId, {
      logicalTurnId: turn.turnId,
      status: 'queued',
    });
    return accepted;
  }

  async createTurn(session: SessionRow, userText: string, now: number): Promise<TurnRow> {
    const seq = (await this.repo.maxSeq(session.sessionId)) + 1;
    const turn: TurnRow = {
      turnId: newId(),
      sessionId: session.sessionId,
      generation: session.generation,
      seq,
      userText,
      userTextHash: hashText(userText),
      assistantText: null,
      status: 'queued',
      attemptToken: null,
      processingStartedAt: null,
      leaseExpiresAt: null,
      retryCount: 0,
      nextRetryAt: null,
      intent: null,
      standaloneQuery: null,
      entityJson: null,
      sourceRefsJson: null,
      modelProvider: null,
      modelId: null,
      promptTokens: null,
      completionTokens: null,
      errorCode: null,
      errorMessageSafe: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.insertTurn(turn);
    return turn;
  }

  // ── Claim with lease (§11.2) ──

  async claimNextTurn(sessionId: string, now: number): Promise<Lease | null> {
    return this.repo.runInTransaction(() => this.claimTx(sessionId, now));
  }

  private async claimTx(sessionId: string, now: number): Promise<Lease | null> {
    const processing = await this.repo.getProcessingTurn(sessionId);
    if (processing) {
      if (processing.leaseExpiresAt !== null && processing.leaseExpiresAt > now) {
        return null; // one turn at a time; lease still valid
      }
      // Lease expired (crash/CPU/network stall): reset so the turn is reclaimable.
      await this.repo.patchTurn(processing.turnId, {
        status: 'queued',
        attemptToken: null,
        processingStartedAt: null,
        leaseExpiresAt: null,
      });
    }
    const next = await this.repo.getNextEligibleTurn(sessionId, now);
    if (!next) return null;

    const attemptToken = newId();
    await this.repo.patchTurn(next.turnId, {
      status: 'processing',
      attemptToken,
      processingStartedAt: now,
      leaseExpiresAt: now + this.config.maxTurnProcessingMs,
    });
    return { turnId: next.turnId, attemptToken, leaseExpiresAt: now + this.config.maxTurnProcessingMs };
  }

  // ── Commit with compare-and-set (§11.4) ──

  async commitTurn(
    session: SessionRow,
    turnId: string,
    attemptToken: string,
    input: CommitInput,
    now: number,
  ): Promise<CommitResult> {
    const sessionNow = await this.repo.getSession(session.sessionId);
    if (!sessionNow || sessionNow.generation !== session.generation || sessionNow.status !== 'active') {
      return { committed: false, reason: 'stale' };
    }
    const turn = await this.repo.getTurn(turnId);
    if (!turn || turn.status !== 'processing' || turn.attemptToken !== attemptToken) {
      return { committed: false, reason: 'stale' };
    }

    await this.repo.patchTurn(turnId, {
      assistantText: input.assistantText,
      status: 'response_ready',
      intent: input.intent ?? turn.intent,
      standaloneQuery: input.standaloneQuery ?? turn.standaloneQuery,
      modelProvider: input.modelProvider,
      modelId: input.modelId,
      promptTokens: input.usage.promptTokens,
      completionTokens: input.usage.completionTokens,
      updatedAt: now,
    });
    await this.repo.patchSession(session.sessionId, {
      inputTokens: sessionNow.inputTokens + input.usage.promptTokens,
      outputTokens: sessionNow.outputTokens + input.usage.completionTokens,
      llmCallCount: sessionNow.llmCallCount + 1,
    });
    return { committed: true };
  }

  // ── Expiry / closure (§8.6, §9) ──

  /**
   * Alarm-driven expiry. Logical expiry is decided by wall-clock comparison
   * against the persisted expiry time; a late or duplicated alarm must not
   * double-close (closeSession is idempotent).
   */
  async expireSessionIfNeeded(now: number): Promise<SessionRow | null> {
    const session = await this.repo.getActiveSession();
    if (!session) return null;
    if (now < session.logicalExpiresAt) return session; // not logically expired
    await this.closeSession(session.sessionId, 'inactivity', now);
    return null;
  }

  async closeSession(sessionId: string, reason: string, now: number): Promise<SessionRow | null> {
    const session = await this.repo.getSession(sessionId);
    if (!session) return null;
    if (session.status === 'closed') return session; // idempotent

    await this.repo.patchSession(sessionId, {
      status: 'closing',
      closedAt: now,
      closeReason: reason,
      updatedAt: now,
    });

    const turns = await this.repo.getTurnsForSession(sessionId);
    for (const t of turns) {
      if (t.status === 'queued' || t.status === 'processing' || t.status === 'delivery_pending') {
        await this.repo.patchTurn(t.turnId, {
          status: 'cancelled',
          attemptToken: null,
          updatedAt: now,
        });
      }
    }

    await this.repo.patchSession(sessionId, { status: 'closed', updatedAt: now });

    await this.scheduleArchiveJob(sessionId, now);
    await this.schedulePurgeJob(sessionId, now);
    return session;
  }

  // ── Job scheduling (idempotent keys) ──

  private async scheduleArchiveJob(sessionId: string, now: number): Promise<void> {
    const key = `archive:${sessionId}`;
    const existing = await this.repo.getJob(key);
    if (existing) return;
    const job: JobRow = {
      jobKey: key,
      jobType: 'session_archive',
      dueAt: now,
      payloadJson: JSON.stringify({ sessionId }),
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.upsertJob(job);
  }

  private async schedulePurgeJob(sessionId: string, now: number): Promise<void> {
    const key = `purge:${sessionId}`;
    const existing = await this.repo.getJob(key);
    if (existing) return;
    const due = now + this.config.rawRetentionHours * 3_600_000;
    const job: JobRow = {
      jobKey: key,
      jobType: 'closed_session_purge',
      dueAt: due,
      payloadJson: JSON.stringify({ sessionId }),
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.upsertJob(job);
  }

  async computeNextAlarmDue(): Promise<number | null> {
    return this.repo.getEarliestJobDue();
  }
}

function hashText(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (
    'h' +
    (h2 >>> 0).toString(16).padStart(8, '0') +
    (h1 >>> 0).toString(16).padStart(8, '0')
  );
}
