import { Harness } from './harness';
import { InMemorySessionRepository } from '../../src/session/inMemoryRepository';
import { SessionEngine, type IngressUpdate } from '../../src/session/stateMachine';
import { SESSION_CONFIG_DEFAULTS, type SessionConfig } from '../../src/session/sessionConfig';

const MINUTE = 60_000;

function makeConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return { ...SESSION_CONFIG_DEFAULTS, ...overrides };
}

function makeIngress(updateId: number, receivedAt: number, text = 'hello'): IngressUpdate {
  return {
    updateId,
    telegramEventAt: receivedAt,
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
  // ── Concurrent duplicate delivery (double delivery of the same update) ──
  {
    const repo = new InMemorySessionRepository();
    const engine = new SessionEngine(repo, makeConfig());
    const t0 = 1_700_000_000_000;

    const [a, b] = await Promise.all([
      engine.acceptUpdate(makeIngress(700, t0)),
      engine.acceptUpdate(makeIngress(700, t0)),
    ]);
    const accepted = [a, b].filter((r) => r.status === 'accepted').length;
    const duplicates = [a, b].filter((r) => r.status === 'duplicate').length;
    h.assert(accepted === 1 && duplicates === 1, 'concurrent duplicate delivery yields exactly one accept');
    h.assert(repo.allInbound().length === 1, 'concurrent duplicate delivery stores one inbound row');
  }

  // ── Double alarm does not double-close ──
  {
    const repo = new InMemorySessionRepository();
    const engine = new SessionEngine(repo, makeConfig());
    const t0 = 1_700_000_000_000;
    await engine.acceptUpdate(makeIngress(1, t0));

    const [a, b] = await Promise.all([
      engine.expireSessionIfNeeded(t0 + 30 * MINUTE + 1),
      engine.expireSessionIfNeeded(t0 + 30 * MINUTE + 1),
    ]);
    h.assert(a === null && b === null, 'both alarm calls settle to no active session');
    const closed = repo.allSessions().filter((s) => s.status === 'closed');
    h.assert(closed.length === 1, 'double alarm closes exactly once');
    const jobs = repo.allTurns(); // no turns in this test
    h.assert(jobs.length === 0, 'no turns created in expiry-only scenario');
  }

  // ── Claim race: two claims cannot both win ──
  {
    const repo = new InMemorySessionRepository();
    const engine = new SessionEngine(repo, makeConfig());
    const t0 = 1_700_000_000_000;
    await engine.acceptUpdate(makeIngress(1, t0));
    const session = (await repo.getActiveSession())!;
    await engine.createTurn(session, 'only turn', t0);

    const [c1, c2] = await Promise.all([
      engine.claimNextTurn(session.sessionId, t0),
      engine.claimNextTurn(session.sessionId, t0),
    ]);
    const wins = [c1, c2].filter((c) => c !== null).length;
    h.assert(wins === 1, 'exactly one claim wins a single turn race');
    const processing = await repo.getProcessingTurn(session.sessionId);
    h.assert(processing !== null && processing.attemptToken !== null, 'winner holds the processing turn');
  }

  // ── Stale commit after timeout-restart, both attempts ──
  {
    const repo = new InMemorySessionRepository();
    const engine = new SessionEngine(repo, makeConfig());
    const t0 = 1_700_000_000_000;
    await engine.acceptUpdate(makeIngress(1, t0));
    const g1 = (await repo.getActiveSession())!;
    const turn = await engine.createTurn(g1, 'inflight', t0);
    const lease = await engine.claimNextTurn(g1.sessionId, t0);

    // Timeout restart creates a new generation session while turn is inflight.
    await engine.acceptUpdate(makeIngress(2, t0 + 40 * MINUTE));
    const g2 = (await repo.getActiveSession())!;
    h.assert(g2.generation === 2, 'restart advanced generation');

    const stale = await engine.commitTurn(g1, turn.turnId, lease!.attemptToken, {
      assistantText: 'late',
      usage: { promptTokens: 1, completionTokens: 1 },
      modelProvider: 'test',
      modelId: 'test',
    }, t0 + 40 * MINUTE + 1000);
    h.assert(stale.committed === false, 'inflight result from old generation rejected');
    const turnAfter = (await repo.getTurn(turn.turnId))!;
    h.assert(turnAfter.assistantText === null, 'old generation turn carries no response');
  }

  // ── Purge deletes all raw data for the session ──
  {
    const repo = new InMemorySessionRepository();
    const engine = new SessionEngine(repo, makeConfig());
    const t0 = 1_700_000_000_000;
    await engine.acceptUpdate(makeIngress(1, t0));
    const session = (await repo.getActiveSession())!;
    await engine.createTurn(session, 'data', t0);
    await engine.closeSession(session.sessionId, 'user_ended', t0 + 1000);

    await repo.purgeSession(session.sessionId);
    h.assert((await repo.getSession(session.sessionId)) === null, 'session row purged');
    h.assert((await repo.getTurnsForSession(session.sessionId)).length === 0, 'turns purged');
    h.assert(repo.allInbound().length === 0, 'inbound rows purged');
  }
}

export default run;
