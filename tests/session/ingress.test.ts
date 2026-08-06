import { Harness } from './harness';
import { handleSessionIngress } from '../../src/session/ingress';
import { deriveConversationScope, scopeToDurableObjectName } from '../../src/session/conversationScope';
import { InMemorySessionRepository } from '../../src/session/inMemoryRepository';
import { SessionEngine, type IngressUpdate } from '../../src/session/stateMachine';
import { SESSION_CONFIG_DEFAULTS, type SessionConfig } from '../../src/session/sessionConfig';
import type { Env } from '../../src/config';

interface CallRecord {
  name: string;
  init: RequestInit;
}

function makeStubNamespace(records: CallRecord[], response: Response) {
  return {
    idFromName: (name: string) => ({ key: name }),
    get: (id: { key: string }) => ({
      fetch: async (path: string, init: RequestInit): Promise<Response> => {
        records.push({ name: id.key, init });
        return response;
      },
    }),
  } as unknown as DurableObjectNamespace;
}

function fakeEnv(records: CallRecord[], response?: Response): Env {
  return {
    DB: {} as never,
    VECTORIZE: {} as never,
    AI: {} as never,
    SESSION_KV: {} as never,
    TELEGRAM_SESSIONS: makeStubNamespace(records, response ?? new Response('OK', { status: 200 })),
    SESSION_FEATURE_ENABLED: 'true',
    TELEGRAM_ALLOWED_USER_IDS: '111,222',
    TELEGRAM_ALLOWED_CHAT_IDS: '999,900',
  } as unknown as Env;
}

const PRIVATE_UPDATE = {
  update_id: 1001,
  message: {
    message_id: 50,
    date: 1_700_000_000,
    from: { id: 111, is_bot: false },
    chat: { id: 999, type: 'private' },
    text: 'hello',
  },
};

const TOPIC_UPDATE = {
  update_id: 1002,
  message: {
    message_id: 51,
    date: 1_700_000_000,
    from: { id: 111, is_bot: false },
    chat: { id: 900, type: 'supergroup', is_forum: true },
    message_thread_id: 7,
    is_topic_message: true,
    text: 'topic msg',
  },
};

export async function run(h: Harness): Promise<void> {
  // ── Valid private message → one durable accept, correct scope ──
  {
    const privateScope = deriveConversationScope(
      { chatId: 999, chatType: 'private' },
      { privateTopicsEnabled: false, sharedGroupEnabled: false },
    );
    const records: CallRecord[] = [];
    await handleSessionIngress(PRIVATE_UPDATE, fakeEnv(records));
    h.assert(records.length === 1, 'valid private message reaches the DO exactly once');
    h.assert(records[0]?.name === scopeToDurableObjectName(privateScope!), 'private scope name derived from chat_id');
    const body = JSON.parse(String(records[0]?.init.body)) as { updateId: number; threadId: number; text: string | null; eventType: string };
    h.assert(body.updateId === 1001 && body.text === 'hello', 'ingress forwards the original update_id and text');
    h.assert(body.threadId === 0, 'private chat thread is 0');
    h.assert(body.eventType === 'message', 'message update classified as message event');
  }

  // ── Group/topic message → thread-scoped DO name ──
  {
    const topicScope = deriveConversationScope(
      { userId: 111, chatId: 900, chatType: 'supergroup', messageThreadId: 7, isForum: true },
      { privateTopicsEnabled: false, sharedGroupEnabled: false },
    );
    const records: CallRecord[] = [];
    await handleSessionIngress(TOPIC_UPDATE, fakeEnv(records));
    h.assert(records.length === 1, 'topic message reaches the DO');
    h.assert(
      records[0]?.name === scopeToDurableObjectName(topicScope!),
      'group topic scope includes thread id',
    );
  }

  // ── Unauthorized: non-allowlisted user/chat → no DO call, no throw ──
  {
    const records: CallRecord[] = [];
    const otherUser = {
      ...PRIVATE_UPDATE,
      message: { ...PRIVATE_UPDATE.message, from: { id: 999_999, is_bot: false } },
    };
    await handleSessionIngress(otherUser, fakeEnv(records));
    h.assert(records.length === 0, 'non-allowlisted user never reaches the DO');

    const otherChat = {
      ...PRIVATE_UPDATE,
      message: { ...PRIVATE_UPDATE.message, chat: { id: 555, type: 'private' } },
    };
    await handleSessionIngress(otherChat, fakeEnv(records));
    h.assert(records.length === 0, 'non-allowlisted chat never reaches the DO');
  }

  // ── Bot messages are rejected before the DO ──
  {
    const records: CallRecord[] = [];
    const botUpdate = {
      ...PRIVATE_UPDATE,
      message: { ...PRIVATE_UPDATE.message, from: { id: 111, is_bot: true } },
    };
    await handleSessionIngress(botUpdate, fakeEnv(records));
    h.assert(records.length === 0, 'bot messages never reach the DO');
  }

  // ── Unsupported/invalid shapes → silent 200 (no DO call, no throw) ──
  {
    const records: CallRecord[] = [];
    await handleSessionIngress({ update_id: 2000 }, fakeEnv(records));
    h.assert(records.length === 0, 'update without message/callback is silently dropped');
    await handleSessionIngress(null, fakeEnv(records));
    h.assert(records.length === 0, 'malformed payload is silently dropped');
    await handleSessionIngress({ update_id: 'x', message: { chat: { id: 1 } } }, fakeEnv(records));
    h.assert(records.length === 0, 'shape-invalid payload is silently dropped');
  }

  // ── Durable acceptance failure propagates (so Telegram retries) ──
  {
    const records: CallRecord[] = [];
    const env = fakeEnv(records, new Response('error', { status: 500 }));
    let threw = false;
    try {
      await handleSessionIngress(PRIVATE_UPDATE, env);
    } catch {
      threw = true;
    }
    h.assert(threw, 'failed durable accept rethrows for non-200 webhook');
  }

  // ── Engine: accepted message queues one turn; duplicate does not ──
  {
    const repo = new InMemorySessionRepository();
    const config: SessionConfig = { ...SESSION_CONFIG_DEFAULTS, featureEnabled: true };
    const engine = new SessionEngine(repo, config);
    const t0 = 1_700_000_000_000;
    const ingress: IngressUpdate = {
      updateId: 3001,
      telegramEventAt: t0,
      receivedAt: t0,
      userId: 111,
      chatId: 999,
      threadId: 0,
      telegramMessageId: 1,
      callbackQueryId: null,
      eventType: 'message',
      text: 'capture this',
      attachmentJson: null,
      replyContextJson: null,
    };

    const first = await engine.acceptAndQueueTurn(ingress);
    h.assert(first.status === 'accepted', 'fresh update accepted');
    const turns = repo.allTurns();
    h.assert(turns.length === 1 && turns[0].status === 'queued', 'one queued turn created on accept');
    const inbound = (await repo.getInbound(3001))!;
    h.assert(inbound.logicalTurnId === turns[0].turnId && inbound.status === 'queued', 'inbound linked to the queued turn');
    h.assert((await repo.getTurnFragments(turns[0].turnId)).length === 1, 'fragment links update to turn');

    const retry = await engine.acceptAndQueueTurn(ingress);
    h.assert(retry.status === 'duplicate', 'duplicate retry is rejected by the DO');
    h.assert(repo.allTurns().length === 1, 'duplicate retry does not create a second turn');
  }

  // ── Engine: message without text is accepted but queues nothing ──
  {
    const repo = new InMemorySessionRepository();
    const config: SessionConfig = { ...SESSION_CONFIG_DEFAULTS, featureEnabled: true };
    const engine = new SessionEngine(repo, config);
    const t0 = 1_700_000_000_000;
    const ingress: IngressUpdate = {
      updateId: 3002,
      telegramEventAt: t0,
      receivedAt: t0,
      userId: 111,
      chatId: 999,
      threadId: 0,
      telegramMessageId: 2,
      callbackQueryId: null,
      eventType: 'message',
      text: null,
      attachmentJson: null,
      replyContextJson: null,
    };
    const result = await engine.acceptAndQueueTurn(ingress);
    h.assert(result.status === 'accepted', 'non-text update accepted');
    h.assert(repo.allTurns().length === 0, 'no turn queued for text-less update');
  }
}

export default run;
