import { Harness } from './harness';
import { InMemorySessionRepository } from '../../src/session/inMemoryRepository';
import { SessionEngine, type CommitInput, type IngressUpdate } from '../../src/session/stateMachine';
import { SESSION_CONFIG_DEFAULTS, type SessionConfig } from '../../src/session/sessionConfig';

const MINUTE = 60_000;

function makeConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return { ...SESSION_CONFIG_DEFAULTS, ...overrides };
}

function makeIngress(updateId: number, receivedAt: number, text = 'hello', telegramEventAt: number | null = receivedAt): IngressUpdate {
  return {
    updateId,
    telegramEventAt,
    receivedAt,
    userId: 111,
    chatId: 999,
    threadId: 0,
    telegramMessageId: 1000 + updateId,
    callbackQueryId: null,
    eventType: 'message',
    text,
    attachmentJson: null,
    replyContextJson: null,
  };
}

export async function run(h: Harness): Promise<void> {
  // ── Fresh session creation ──
  {
    const repo = new InMemorySessionRepository();
    const engine = new SessionEngine(repo, makeConfig());
    const t0 = 1_700_000_000_000;
    const r = await engine.acceptUpdate(makeIngress(1, t0));
    h.assert(r.status === 'accepted' && r.generation === 1, 'first accepted update creates generation 1 session');

    const session = await repo.getActiveSession();
    h.assert(session !== null, 'active session exists after first accept');
    h.assert(session!.logicalExpiresAt === t0 + 30 * MINUTE, 'default 30-minute expiry set');
  }

  // ── Dedupe ──
  {
    const repo = new InMemorySessionRepository();
    const engine = new SessionEngine(repo, makeConfig());
    const t0 = 1_700_000_000_000;
    const a = await engine.acceptUpdate(makeIngress(10, t0));
    const b = await engine.acceptUpdate(makeIngress(10, t0 + 1000));
    h.assert(a.status === 'accepted', 'first delivery accepted');
    h.assert(b.status === 'duplicate', 'duplicate update_id rejected');
    h.assert(repo.allInbound().length === 1, 'only one inbound row stored for duplicate update_id');
  }

  // ── Boundary: message exactly at expiry starts a new session ──
  {
    const repo = new InMemorySessionRepository();
    const engine = new SessionEngine(repo, makeConfig());
    const t0 = 1_700_000_000_000;
    await engine.acceptUpdate(makeIngress(1, t0));
    const r2 = await engine.acceptUpdate(makeIngress(2, t0 + 30 * MINUTE));
    h.assert(r2.status === 'accepted' && r2.generation === 2, 'event at exact expiry starts new session gen 2');

    const recent = await repo.getRecentSession();
    h.assert(recent !== null && recent.generation === 2 && recent.status === 'active', 'new session is active');
    const closed = repo.allSessions().find((s) => s.generation === 1);
    h.assert(closed !== null && closed.status === 'closed' && closed.closeReason === 'timeout_restart', 'expired session closed with timeout_restart');
  }

  // ── Ingress grace: sent before expiry, received within grace → same session ──
  {
    const repo = new InMemorySessionRepository();
    const engine = new SessionEngine(repo, makeConfig());
    const t0 = 1_700_000_000_000;
    await engine.acceptUpdate(makeIngress(1, t0));
    const expiresAt = (await repo.getActiveSession())!.logicalExpiresAt;
    const r = await engine.acceptUpdate(
      makeIngress(2, expiresAt + 5000, 'late', expiresAt - 100),
    );
    h.assert(r.status === 'accepted' && r.generation === 1, 'grace window keeps the same session');
  }

  // ── Receipt beyond grace → new session ──
  {
    const repo = new InMemorySessionRepository();
    const engine = new SessionEngine(repo, makeConfig());
    const t0 = 1_700_000_000_000;
    await engine.acceptUpdate(makeIngress(1, t0));
    const expiresAt = (await repo.getActiveSession())!.logicalExpiresAt;
    const r = await engine.acceptUpdate(
      makeIngress(2, expiresAt + 60_000, 'late', expiresAt - 100),
    );
    h.assert(r.status === 'accepted' && r.generation === 2, 'receipt beyond grace starts a new session');
  }

  // ── Sliding window: activity resets the timer ──
  {
    const repo = new InMemorySessionRepository();
    const engine = new SessionEngine(repo, makeConfig());
    const t0 = 1_700_000_000_000;
    await engine.acceptUpdate(makeIngress(1, t0));
    await engine.acceptUpdate(makeIngress(2, t0 + 10 * MINUTE));
    const session = (await repo.getActiveSession())!;
    h.assert(session.logicalExpiresAt === t0 + 10 * MINUTE + 30 * MINUTE, 'sliding window extended by activity');
  }

  // ── Claim / commit with compare-and-set ──
  {
    const repo = new InMemorySessionRepository();
    const engine = new SessionEngine(repo, makeConfig());
    const t0 = 1_700_000_000_000;
    await engine.acceptUpdate(makeIngress(1, t0));
    const session = (await repo.getActiveSession())!;
    const turn = await engine.createTurn(session, 'hello', t0);

    const lease = await engine.claimNextTurn(session.sessionId, t0);
    h.assert(lease !== null && lease.turnId === turn.turnId, 'queued turn is claimed');

    const again = await engine.claimNextTurn(session.sessionId, t0 + 1000);
    h.assert(again === null, 'claim is exclusive while lease is valid');

    const input: CommitInput = {
      assistantText: 'hi there',
      usage: { promptTokens: 50, completionTokens: 30 },
      modelProvider: 'test',
      modelId: 'test-model',
    };
    const commit = await engine.commitTurn(session, turn.turnId, lease!.attemptToken, input, t0 + 1000);
    h.assert(commit.committed === true, 'commit succeeds with matching attempt token');

    const stored = (await repo.getTurn(turn.turnId))!;
    h.assert(stored.status === 'response_ready' && stored.assistantText === 'hi there', 'turn marked response_ready with text');
    const updated = (await repo.getActiveSession())!;
    h.assert(updated.inputTokens === 50 && updated.outputTokens === 30 && updated.llmCallCount === 1, 'session usage accumulates');

    const stale = await engine.commitTurn(session, turn.turnId, 'wrong-token', input, t0 + 2000);
    h.assert(stale.committed === false && stale.reason === 'stale', 'stale attempt token rejected');
  }

  // ── Lease expiry allows reclaim of the same turn ──
  {
    const repo = new InMemorySessionRepository();
    const engine = new SessionEngine(repo, makeConfig({ maxTurnProcessingMs: 60_000 }));
    const t0 = 1_700_000_000_000;
    await engine.acceptUpdate(makeIngress(1, t0));
    const session = (await repo.getActiveSession())!;
    const turn = await engine.createTurn(session, 'hi', t0);

    const lease1 = await engine.claimNextTurn(session.sessionId, t0);
    h.assert(lease1 !== null, 'first claim acquired');
    const lease2 = await engine.claimNextTurn(session.sessionId, t0 + 61_000);
    h.assert(lease2 !== null && lease2.turnId === turn.turnId, 'expired lease is reclaimed');
    h.assert(lease1!.attemptToken !== lease2!.attemptToken, 'reclaim gets a fresh attempt token');

    const commit = await engine.commitTurn(session, turn.turnId, lease1!.attemptToken, {
      assistantText: 'stale',
      usage: { promptTokens: 1, completionTokens: 1 },
      modelProvider: 'test',
      modelId: 'test',
    }, t0 + 62_000);
    h.assert(commit.committed === false, 'old lease token cannot commit after reclaim');
  }

  // ── Close is idempotent and cancels pending turns ──
  {
    const repo = new InMemorySessionRepository();
    const engine = new SessionEngine(repo, makeConfig());
    const t0 = 1_700_000_000_000;
    await engine.acceptUpdate(makeIngress(1, t0));
    const session = (await repo.getActiveSession())!;
    const t1 = await engine.createTurn(session, 'first', t0);
    const t2 = await engine.createTurn(session, 'second', t0 + 1000);
    await engine.claimNextTurn(session.sessionId, t0 + 2000);

    const closed = await engine.closeSession(session.sessionId, 'user_ended', t0 + 3000);
    h.assert(closed !== null, 'close returns the session');

    const t1s = (await repo.getTurn(t1.turnId))!;
    const t2s = (await repo.getTurn(t2.turnId))!;
    h.assert(t1s.status === 'cancelled', 'processing turn cancelled on close');
    h.assert(t2s.status === 'cancelled', 'queued turn cancelled on close');

    const again = await engine.closeSession(session.sessionId, 'user_ended', t0 + 4000);
    h.assert(again !== null, 'close is idempotent');
    const finalStatus = (await repo.getSession(session.sessionId))!;
    h.assert(finalStatus.status === 'closed' && finalStatus.closeReason === 'user_ended', 'session closed with reason');

    h.assert(await repo.getJob(`archive:${session.sessionId}`) !== null, 'archive job scheduled');
    h.assert(await repo.getJob(`purge:${session.sessionId}`) !== null, 'purge job scheduled');
    const purgeDue = (await repo.getJob(`purge:${session.sessionId}`))!.dueAt;
    h.assert(purgeDue === t0 + 3000 + 24 * 3600_000, 'purge due after raw retention hours');
  }

  // ── Generation mismatch blocks stale commit after /end ──
  {
    const repo = new InMemorySessionRepository();
    const engine = new SessionEngine(repo, makeConfig());
    const t0 = 1_700_000_000_000;
    await engine.acceptUpdate(makeIngress(1, t0));
    const g1 = (await repo.getActiveSession())!;
    const turn = await engine.createTurn(g1, 'pending', t0);
    const lease = await engine.claimNextTurn(g1.sessionId, t0);

    await engine.closeSession(g1.sessionId, 'user_ended', t0 + 1000);
    await engine.acceptUpdate(makeIngress(2, t0 + 2000));
    const g2 = (await repo.getActiveSession())!;
    h.assert(g2.generation === 2, 'new session after /end is generation 2');

    const commit = await engine.commitTurn(g1, turn.turnId, lease!.attemptToken, {
      assistantText: 'too late',
      usage: { promptTokens: 1, completionTokens: 1 },
      modelProvider: 'test',
      modelId: 'test',
    }, t0 + 3000);
    h.assert(commit.committed === false && commit.reason === 'stale', 'stale LLM result rejected after /end');
  }

  // ── Alarm-driven expiry ──
  {
    const repo = new InMemorySessionRepository();
    const engine = new SessionEngine(repo, makeConfig());
    const t0 = 1_700_000_000_000;
    await engine.acceptUpdate(makeIngress(1, t0));

    const notExpired = await engine.expireSessionIfNeeded(t0 + 10 * MINUTE);
    h.assert(notExpired !== null, 'alarm before expiry keeps session');

    const after = await engine.expireSessionIfNeeded(t0 + 30 * MINUTE + 1);
    h.assert(after === null, 'alarm at expiry closes session');
    const s = (await repo.getRecentSession())!;
    h.assert(s.status === 'closed' && s.closeReason === 'inactivity', 'expired session closed with inactivity reason');

    const secondAlarm = await engine.expireSessionIfNeeded(t0 + 40 * MINUTE);
    h.assert(secondAlarm === null, 'double alarm is a no-op');
  }
}

export default run;
