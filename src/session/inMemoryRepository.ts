/**
 * PRJ226 v4.2: In-memory SessionRepository for tests.
 *
 * Mirrors the semantics the SqlStorage implementation must provide (unique
 * active session, update_id dedupe, UNIQUE(session_id, seq) turns, ordered
 * job scheduling). No Cloudflare runtime required.
 */

import type {
  InboundRow,
  JobRow,
  SessionRepository,
  SessionRow,
  TurnFragmentRow,
  TurnRow,
} from './sessionRepository';

export class InMemorySessionRepository implements SessionRepository {
  private sessions: SessionRow[] = [];
  private inbound: InboundRow[] = [];
  private turns: TurnRow[] = [];
  private fragments: TurnFragmentRow[] = [];
  private jobs = new Map<string, JobRow>();

  // ── sessions ──
  async getActiveSession(): Promise<SessionRow | null> {
    return this.sessions.find((s) => s.status === 'active') ?? null;
  }

  async getSession(sessionId: string): Promise<SessionRow | null> {
    return this.sessions.find((s) => s.sessionId === sessionId) ?? null;
  }

  async getRecentSession(): Promise<SessionRow | null> {
    let latest: SessionRow | null = null;
    for (const s of this.sessions) {
      if (latest === null || s.createdAt > latest.createdAt || (s.createdAt === latest.createdAt && s.generation > latest.generation)) {
        latest = s;
      }
    }
    return latest ? { ...latest } : null;
  }

  async insertSession(row: SessionRow): Promise<void> {
    if (row.status === 'active' && this.sessions.some((s) => s.status === 'active')) {
      throw new Error('one active session per scope');
    }
    this.sessions.push({ ...row });
  }

  async updateSession(row: SessionRow): Promise<void> {
    const i = this.sessions.findIndex((s) => s.sessionId === row.sessionId);
    if (i < 0) throw new Error(`session not found: ${row.sessionId}`);
    this.sessions[i] = { ...row };
  }

  async patchSession(sessionId: string, patch: Partial<SessionRow>): Promise<void> {
    const i = this.sessions.findIndex((s) => s.sessionId === sessionId);
    if (i < 0) throw new Error(`session not found: ${sessionId}`);
    const next: SessionRow = { ...this.sessions[i], ...patch, updatedAt: Date.now() };
    if (next.status === 'active' && this.sessions.some((s) => s.sessionId !== sessionId && s.status === 'active')) {
      throw new Error('one active session per scope');
    }
    this.sessions[i] = next;
  }

  // ── inbound ──
  async getInbound(updateId: number): Promise<InboundRow | null> {
    return this.inbound.find((r) => r.updateId === updateId) ?? null;
  }

  async insertInbound(row: InboundRow): Promise<void> {
    if (this.inbound.some((r) => r.updateId === row.updateId)) {
      throw new Error(`duplicate update_id: ${row.updateId}`);
    }
    this.inbound.push({ ...row });
  }

  async patchInbound(updateId: number, patch: Partial<InboundRow>): Promise<void> {
    const i = this.inbound.findIndex((r) => r.updateId === updateId);
    if (i < 0) throw new Error(`inbound not found: ${updateId}`);
    this.inbound[i] = { ...this.inbound[i], ...patch, updatedAt: Date.now() };
  }

  // ── turns ──
  async insertTurn(row: TurnRow): Promise<void> {
    const dup = this.turns.some(
      (t) => t.sessionId === row.sessionId && t.seq === row.seq,
    );
    if (dup) throw new Error(`turn seq collision for session ${row.sessionId} seq ${row.seq}`);
    this.turns.push({ ...row });
  }

  async patchTurn(turnId: string, patch: Partial<TurnRow>): Promise<void> {
    const i = this.turns.findIndex((t) => t.turnId === turnId);
    if (i < 0) throw new Error(`turn not found: ${turnId}`);
    this.turns[i] = { ...this.turns[i], ...patch, updatedAt: Date.now() };
  }

  async getTurn(turnId: string): Promise<TurnRow | null> {
    return this.turns.find((t) => t.turnId === turnId) ?? null;
  }

  async getTurnsForSession(sessionId: string): Promise<TurnRow[]> {
    return this.turns
      .filter((t) => t.sessionId === sessionId)
      .sort((a, b) => a.seq - b.seq);
  }

  async getProcessingTurn(sessionId: string): Promise<TurnRow | null> {
    return this.turns.find((t) => t.sessionId === sessionId && t.status === 'processing') ?? null;
  }

  async getNextEligibleTurn(sessionId: string, now: number): Promise<TurnRow | null> {
    const eligible = this.turns
      .filter(
        (t) =>
          t.sessionId === sessionId &&
          (t.status === 'queued' ||
            (t.status === 'retryable_failed' && t.nextRetryAt !== null && t.nextRetryAt <= now)),
      )
      .sort((a, b) => a.seq - b.seq);
    return eligible[0] ?? null;
  }

  async getLastTurn(sessionId: string): Promise<TurnRow | null> {
    const turns = await this.getTurnsForSession(sessionId);
    return turns[turns.length - 1] ?? null;
  }

  async maxSeq(sessionId: string): Promise<number> {
    const turns = await this.getTurnsForSession(sessionId);
    return turns.reduce((m, t) => Math.max(m, t.seq), 0);
  }

  // ── fragments ──
  async insertTurnFragment(row: TurnFragmentRow): Promise<void> {
    const dup = this.fragments.some((f) => f.turnId === row.turnId && f.updateId === row.updateId);
    if (dup) throw new Error('duplicate turn fragment');
    this.fragments.push({ ...row });
  }

  async getTurnFragments(turnId: string): Promise<TurnFragmentRow[]> {
    return this.fragments
      .filter((f) => f.turnId === turnId)
      .sort((a, b) => a.fragmentOrder - b.fragmentOrder);
  }

  // ── jobs ──
  async getJob(jobKey: string): Promise<JobRow | null> {
    return this.jobs.get(jobKey) ?? null;
  }

  async upsertJob(job: JobRow): Promise<void> {
    this.jobs.set(job.jobKey, { ...job });
  }

  async deleteJob(jobKey: string): Promise<void> {
    this.jobs.delete(jobKey);
  }

  async getDueJobs(now: number, limit: number): Promise<JobRow[]> {
    return [...this.jobs.values()]
      .filter((j) => j.dueAt <= now)
      .sort((a, b) => a.dueAt - b.dueAt || a.createdAt - b.createdAt)
      .slice(0, limit);
  }

  async getEarliestJobDue(): Promise<number | null> {
    let earliest: number | null = null;
    for (const j of this.jobs.values()) {
      if (earliest === null || j.dueAt < earliest) earliest = j.dueAt;
    }
    return earliest;
  }

  async purgeSession(sessionId: string): Promise<void> {
    this.sessions = this.sessions.filter((s) => s.sessionId !== sessionId);
    this.turns = this.turns.filter((t) => t.sessionId !== sessionId);
    this.inbound = this.inbound.filter((r) => r.sessionId !== sessionId);
  }

  // ── misc ──
  // Emulates SQLite's BEGIN IMMEDIATE serialization: transactions on the same
  // scope run one at a time so read-check-write races behave as in production.
  private txnQueue: Promise<unknown> = Promise.resolve();

  async runInTransaction<T>(fn: () => T | Promise<T>): Promise<T> {
    let release!: () => void;
    const p = new Promise<void>((r) => (release = r as () => void));
    const prev = this.txnQueue;
    this.txnQueue = p;
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  // ── test helpers ──
  allSessions(): SessionRow[] {
    return this.sessions.map((s) => ({ ...s }));
  }

  allTurns(): TurnRow[] {
    return this.turns.map((t) => ({ ...t }));
  }

  allInbound(): InboundRow[] {
    return this.inbound.map((r) => ({ ...r }));
  }
}
