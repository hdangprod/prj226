/**
 * PRJ226 v4.2: TelegramSession Durable Object (§8).
 *
 * One DO per conversation scope. It is the sole authority for active session
 * state; all state lives in its SQLite storage. This class is a thin adapter:
 * repository + engine carry the logic, alarms are re-armed after every
 * mutation that touches scheduled jobs.
 */

import type { Env } from '../config';
import { parseSessionConfig, type SessionConfig } from './sessionConfig';
import { SqlSessionRepository } from './sqliteRepository';
import { SessionEngine, type AcceptResult, type IngressUpdate } from './stateMachine';

export class TelegramSession implements DurableObject {
  private readonly repo: SqlSessionRepository;
  private readonly engine: SessionEngine;
  private readonly config: SessionConfig;
  private readonly ctx: DurableObjectState;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.config = parseSessionConfig(env);
    this.repo = new SqlSessionRepository(ctx.storage.sql);
    this.engine = new SessionEngine(this.repo, this.config);
  }

  async accept(ingress: IngressUpdate): Promise<AcceptResult> {
    const result = await this.engine.acceptAndQueueTurn(ingress);
    await this.armAlarm();
    return result;
  }

  async createTurn(userText: string): Promise<{ turnId: string; seq: number } | null> {
    const session = await this.repo.getActiveSession();
    if (!session) return null;
    const turn = await this.engine.createTurn(session, userText, Date.now());
    return { turnId: turn.turnId, seq: turn.seq };
  }

  async getStatus(): Promise<{ sessionId: string; generation: number; status: string } | null> {
    const session = await this.repo.getActiveSession();
    if (!session) return null;
    return { sessionId: session.sessionId, generation: session.generation, status: session.status };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/accept' && request.method === 'POST') {
        const ingress = (await request.json()) as IngressUpdate;
        return Response.json(await this.engine.acceptUpdate(ingress));
      }
      if (url.pathname === '/turn' && request.method === 'POST') {
        const body = (await request.json()) as { userText?: string };
        if (!body.userText) return Response.json({ error: 'missing userText' }, { status: 400 });
        return Response.json(await this.createTurn(body.userText));
      }
      if (url.pathname === '/status' && request.method === 'GET') {
        return Response.json(await this.getStatus());
      }
      return new Response('Not Found', { status: 404 });
    } catch {
      return Response.json({ error: 'bad_request' }, { status: 400 });
    }
  }

  async alarm(): Promise<void> {
    const now = Date.now();

    // Lazy/alarm-driven inactivity close (idempotent).
    await this.engine.expireSessionIfNeeded(now);

    const dueJobs = await this.repo.getDueJobs(now, 20);
    for (const job of dueJobs) {
      switch (job.jobType) {
        case 'closed_session_purge': {
          const payload = job.payloadJson ? (JSON.parse(job.payloadJson) as { sessionId?: string }) : null;
          if (payload?.sessionId) {
            await this.repo.purgeSession(payload.sessionId);
          }
          await this.repo.deleteJob(job.jobKey);
          break;
        }
        case 'session_archive':
        case 'debounce_flush':
        case 'turn_retry':
        case 'context_compaction':
        case 'outbox_retry':
          // Acknowledged here; full handling lands with their owning phases
          // (summary generation, debounce, retry, compaction, outbox).
          await this.repo.deleteJob(job.jobKey);
          break;
      }
    }

    await this.armAlarm();
  }

  private async armAlarm(): Promise<void> {
    const due = await this.engine.computeNextAlarmDue();
    if (due !== null) {
      // Alarm must be strictly in the future; guard against already-due jobs.
      await this.ctx.storage.setAlarm(Math.max(due, Date.now() + 1));
    }
  }
}
