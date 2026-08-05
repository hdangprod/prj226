/**
 * PRJ226 v4.1: Telegram Bot Output Integration Suite
 *
 * Mirrors REAL bot runtime behavior without network access:
 *  - Routes payloads through the actual `handleWorkerPayload` intent router.
 *  - Stubs the LLM + D1 layers only (skills keep real formatting/HTML logic).
 *  - Intercepts global fetch() at the single `api.telegram.org` chokepoint to
 *    record exactly what the bot would send to the user.
 *
 * Run with: npm run test:bot
 */

import { handleWorkerPayload } from '../src/governance/intentRouter';
import { LLMRouter } from '../src/router/llmRouter';
import { D1Client } from '../src/tools/d1Client';
import type { Env } from '../src/config';

const CHAT_ID = 12345678;

// ─── Telegram outbound capture ────────────────────────────────────────────────
interface OutboundMessage {
  method: string;
  chat_id: number;
  text: string;
  reply_markup?: unknown;
}
const sent: OutboundMessage[] = [];

function makeResponse(): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    json: async () => ({ ok: true }),
    text: async () => 'ok',
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    clone: function (this: Response) { return this; },
    url: '',
    redirected: false,
    type: 'default',
    body: null,
    bodyUsed: false,
  } as unknown as Response;
}

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.includes('api.telegram.org')) {
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>; } catch { /* noop */ }
    if (typeof body.text === 'string') {
      sent.push({
        method: String(url.split('/').pop()),
        chat_id: Number(body.chat_id),
        text: body.text,
        reply_markup: body.reply_markup,
      });
    }
    return makeResponse();
  }
  throw new Error(`Unexpected outbound network call in offline bot test: ${url}`);
}) as typeof fetch;

// ─── Mutable fixtures ─────────────────────────────────────────────────────────
const fixtures: any = {
  intent: 'Task_Capture',
  confidence: 100,
  extracted: {},
  classificationError: false,
  taskExtract: { name: 'Review PR', priority: 'high', estimate_hours: 2, scheduled_date: null },
  reschedExtract: { taskName: 'Write report', newDate: '2026-08-10' },
  fastText: '',
  proText: '',
  actionableTasks: [],
  rescueTasks: [],
  matchingTasks: [],
  dependents: [],
  inboxCaptures: [],
  capture: null,
  ftsResults: [],
  vectorMatches: [],
  relatedFiles: [],
};

const mockEnv: Env = {
  DB: {
    prepare: (sql: string) => {
      const stmt: any = {
        bind: (..._args: unknown[]) => stmt,
        all: async () => {
          if (sql.includes('note_chunks_fts')) return { results: fixtures.ftsResults };
          return { results: [] };
        },
        first: async () => null,
        run: async () => {},
      };
      return stmt;
    },
    batch: async () => {},
  } as any,
  VECTORIZE: {
    query: async () => ({ matches: fixtures.vectorMatches, count: fixtures.vectorMatches.length }),
    upsert: async () => {},
    deleteByIds: async () => {},
  } as any,
  AI: {
    run: async () => ({ data: [Array(768).fill(0.1)] }),
  } as any,
  SESSION_KV: {
    put: async () => {},
    get: async () => null,
    delete: async () => {},
  } as any,
  TELEGRAM_BOT_TOKEN: 'mock-bot-token',
  TELEGRAM_WEBHOOK_SECRET: 'mock-webhook-secret',
  TELEGRAM_CHAT_ID: '12345678',
  GITHUB_TOKEN: 'mock-github-token',
  GITHUB_WEBHOOK_SECRET: 'mock-github-webhook-secret',
  GITHUB_OWNER: 'hdangprod',
  GITHUB_REPO: 'hdangprod_wiki',
  EMBEDDING_MODEL: '@cf/baai/bge-base-en-v1.5',
  EMBEDDING_DIMENSIONS: '768',
  TELEGRAM_BOT_USERNAME: 'liam_second_brain_bot',
  LLM_FAST_PROVIDER: 'google',
  LLM_FAST_MODEL: 'gemini-3.5-flash-lite',
  LLM_PRO_PROVIDER: 'google',
  LLM_PRO_MODEL: 'gemini-3.6-flash',
  LLM_FAST_API_KEY: 'mock-fast-key',
  LLM_PRO_API_KEY: 'mock-pro-key',
};

// ─── Deterministic LLM stub ───────────────────────────────────────────────────
LLMRouter.prototype.callFast = async (): Promise<string> => fixtures.fastText;
LLMRouter.prototype.callPro = async (): Promise<string> => fixtures.proText;
LLMRouter.prototype.callFastStructured = async (
  _prompt: string,
  _schema: unknown,
  system?: string,
): Promise<unknown> => {
  if (fixtures.classificationError) throw new Error('mock LLM provider outage');
  if (system && system.startsWith('You are Liam, an AI second brain assistant. Classify')) {
    return { intent: fixtures.intent, confidence: fixtures.confidence, extracted: fixtures.extracted };
  }
  if (system && system.includes('task extraction assistant')) {
    return fixtures.taskExtract;
  }
  if (system && system.startsWith('Extract: task name')) {
    return fixtures.reschedExtract;
  }
  return {};
};

// ─── Deterministic D1 stub ────────────────────────────────────────────────────
D1Client.prototype.createCapture = async (): Promise<string> => 'cap-fixed';
D1Client.prototype.createTask = async (): Promise<string> => 'task-fixed-0001';
D1Client.prototype.saveWorkingMemory = async (): Promise<string> => 'wm-fixed';
D1Client.prototype.getActionableTasks = async (): Promise<unknown[]> => fixtures.actionableTasks;
D1Client.prototype.getRescueTasks = async (): Promise<unknown[]> => fixtures.rescueTasks;
D1Client.prototype.getLatestWorkingMemory = async (): Promise<unknown> => fixtures.memory ?? null;
D1Client.prototype.findTasksByName = async (): Promise<unknown[]> => fixtures.matchingTasks;
D1Client.prototype.getDependentTasks = async (): Promise<unknown[]> => fixtures.dependents;
D1Client.prototype.getInboxCaptures = async (): Promise<unknown[]> => fixtures.inboxCaptures;
D1Client.prototype.getCaptureById = async (): Promise<unknown> => fixtures.capture ?? null;
D1Client.prototype.getChunksByIds = async (): Promise<unknown[]> => fixtures.chunksByIds ?? [];
D1Client.prototype.searchRelatedFiles = async (): Promise<unknown[]> => fixtures.relatedFiles ?? [];

function resetFixtures() {
  fixtures.intent = 'Task_Capture';
  fixtures.confidence = 100;
  fixtures.extracted = {};
  fixtures.classificationError = false;
  fixtures.taskExtract = { name: 'Review PR', priority: 'high', estimate_hours: 2, scheduled_date: null };
  fixtures.reschedExtract = { taskName: 'Write report', newDate: '2026-08-10' };
  fixtures.fastText = '';
  fixtures.proText = '';
  fixtures.actionableTasks = [];
  fixtures.rescueTasks = [];
  fixtures.matchingTasks = [];
  fixtures.dependents = [];
  fixtures.inboxCaptures = [];
  fixtures.capture = null;
  fixtures.memory = null;
  fixtures.ftsResults = [];
  fixtures.vectorMatches = [];
  fixtures.chunksByIds = [];
  fixtures.relatedFiles = [];
  sent.length = 0;
}

const textMsg = (text: string) => ({
  message: { text, chat: { id: CHAT_ID } },
});

const callbackMsg = (data: string) => ({
  callback_query: { id: 'cb-1', data, message: { chat: { id: CHAT_ID } } },
});

// ─── Runner ───────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function check(condition: boolean, name: string) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.error(`  ❌ ${name}`);
    failed++;
  }
}

function lastText(): string {
  return sent.length > 0 ? sent[sent.length - 1].text : '';
}

function messagesForChat(): OutboundMessage[] {
  return sent.filter((m) => m.method === 'sendMessage');
}

async function runScenario(name: string, fn: () => Promise<void>) {
  console.log(`\n── ${name} ──`);
  resetFixtures();
  try {
    await fn();
  } catch (err) {
    console.error('  💥 Scenario threw:', err);
    failed++;
  }
}

async function main() {
  console.log('=== PRJ226 v4.1 Telegram Bot Output Integration Tests ===');

  // 1. Task Capture
  await runScenario('Task_Capture: happy path + task created', async () => {
    fixtures.intent = 'Task_Capture';
    fixtures.taskExtract = { name: 'Review PR', priority: 'high', estimate_hours: 2, scheduled_date: '2026-08-06' };
    await handleWorkerPayload(textMsg('add task: review PR by friday priority high'), mockEnv);
    const t = lastText();
    check(t.includes('Task captured!'), 'replies "Task captured!"');
    check(t.includes('Review PR'), 'includes extracted task name');
    check(t.includes('[HIGH]'), 'includes priority badge');
    check(t.includes('⏱ Estimate: 2h'), 'includes estimate');
    check(t.includes('📅 Scheduled: 2026-08-06'), 'includes scheduled date');
    check(t.includes('Open in Obsidian'), 'includes Obsidian deep link');
  });

  // 2. Daily Focus (zero tasks)
  await runScenario('Daily_Focus: no tasks → all clear', async () => {
    fixtures.intent = 'Daily_Focus';
    await handleWorkerPayload(textMsg('what are my tasks today'), mockEnv);
    check(lastText().includes('All clear!'), 'replies "All clear!" when no tasks');
  });

  // 3. Daily Focus (tasks + memory + LLM briefing)
  await runScenario('Daily_Focus: briefing with actionable tasks', async () => {
    fixtures.intent = 'Daily_Focus';
    fixtures.actionableTasks = [
      { id: 't1', name: 'Ship onboarding', status: 'not_started', priority: 'high', estimate_hours: 3, scheduled_date: '2026-08-06' },
      { id: 't2', name: 'Write docs', status: 'not_started', priority: 'low', estimate_hours: 1, scheduled_date: null },
    ];
    fixtures.memory = { id: 'm1', last_action: 'scoped onboarding', doing: 'onboarding', next_action: 'docs', metadata: null, snapshot_at: '2026-08-05T00:00:00Z' };
    fixtures.fastText = 'FOCUS: Ship onboarding first to unblock the team.\nMOTIVATION: Momentum wins the day!';
    await handleWorkerPayload(textMsg('morning brief'), mockEnv);
    const t = lastText();
    check(t.includes('Daily Briefing'), 'replies "Daily Briefing"');
    check(t.includes('🔴 <b>Ship onboarding</b>'), 'renders high-priority task with emoji');
    check(t.includes('(~3h)'), 'renders estimate');
    check(t.includes('due 2026-08-06'), 'renders scheduled date');
    check(t.includes("Today's Focus:</b> Ship onboarding first"), 'includes LLM focus line (falls back on failure)');
    check(t.includes('Momentum wins the day!'), 'includes LLM motivation line');
    check(t.includes('View Daily Tasks Snapshot in Obsidian'), 'includes Obsidian snapshot link');
  });

  // 4. Rescue Mode (no quick wins)
  await runScenario('Rescue_Mode: no quick wins', async () => {
    fixtures.intent = 'Rescue_Mode';
    await handleWorkerPayload(textMsg("I'm tired"), mockEnv);
    check(lastText().includes('Rescue Mode'), 'replies Rescue Mode header');
    check(lastText().includes('No quick-win tasks found'), 'informs about no quick wins');
  });

  // 5. Rescue Mode (with tasks)
  await runScenario('Rescue_Mode: quick wins listed', async () => {
    fixtures.intent = 'Rescue_Mode';
    fixtures.rescueTasks = [
      { id: 't1', name: 'Reply to DMs', status: 'not_started', priority: 'low', estimate_hours: 0.25, scheduled_date: null },
    ];
    await handleWorkerPayload(textMsg('rescue me'), mockEnv);
    const t = lastText();
    check(t.includes('Quick Wins'), 'replies "Rescue Mode — Quick Wins"');
    check(t.includes('Reply to DMs'), 'lists quick-win task');
    check(t.includes('(~15 min)'), 'renders minutes estimate');
  });

  // 6. Knowledge Search (no results → capture fallback)
  await runScenario('Knowledge_Search: no results → saved to inbox + buttons', async () => {
    fixtures.intent = 'Knowledge_Search';
    await handleWorkerPayload(textMsg('what do I know about serverless workers'), mockEnv);
    const t = lastText();
    const withKeyboard = sent.find((m) => m.reply_markup);
    check(t.includes('No search results found'), 'reports no results');
    check(t.includes('your thought has been saved to your inbox'), 'confirms inbox capture');
    check(!!withKeyboard, 'sends inline keyboard fallback');
    const buttons = JSON.stringify(withKeyboard?.reply_markup ?? '');
    check(buttons.includes('organize:cap-fixed'), 'organize button uses captured id');
    check(buttons.includes('task_from_inbox:cap-fixed'), 'convert-to-task button present');
    check(buttons.includes('intent:Inbox_Organize'), 'review inbox button present');
  });

  // 7. Knowledge Search (with results → cited summary)
  await runScenario('Knowledge_Search: results → cited summary + sources', async () => {
    fixtures.intent = 'Knowledge_Search';
    fixtures.vectorMatches = [{ id: 'c1', score: 0.9 }];
    fixtures.chunksByIds = [
      { id: 'c1', github_path: 'wiki/architecture/edge-stack.md', title: 'Edge Stack Architecture', content: 'The edge stack uses D1, Vectorize and Workers AI together.', tags: null, updated_at: '2026-01-01' },
    ];
    fixtures.proText = 'Edge Stack combines D1 storage with Vectorize search [Source 1].';
    await handleWorkerPayload(textMsg('how does the edge stack work'), mockEnv);
    const t = lastText();
    const withKeyboard = sent.find((m) => m.reply_markup);
    check(t.includes('Knowledge Search Results'), 'replies results header');
    check(t.includes('Edge Stack combines D1'), 'includes LLM cited summary');
    check(t.includes('Sources:'), 'lists sources');
    check(t.includes('Edge Stack Architecture'), 'includes source title link');
    check(!!withKeyboard, 'sends inline keyboard with source actions');
  });

  // 8. Knowledge Search (FTS-only noise dropped when Vectorize corroborates hits)
  await runScenario('Knowledge_Search: FTS-only inbox noise excluded from sources', async () => {
    fixtures.intent = 'Knowledge_Search';
    fixtures.vectorMatches = [{ id: 'c1', score: 0.77 }];
    fixtures.ftsResults = [{ id: 'c1', rank: 1 }, { id: 'c2', rank: 2 }];
    fixtures.chunksByIds = [
      { id: 'c1', github_path: 'wiki/health/morning-fitness.md', title: 'Morning Fitness Routine', content: '30-minute bodyweight circuit at 6 AM, four days a week.', tags: null, updated_at: '2026-01-01' },
      { id: 'c2', github_path: 'inbox/2026-08-05/101649.md', title: null, content: 'Scanned a fitness article.', tags: null, updated_at: '2026-08-05' },
    ];
    fixtures.proText = 'Morning Fitness Routine [Source 1].';
    await handleWorkerPayload(textMsg('what do I know about morning fitness'), mockEnv);
    const t = lastText();
    check(t.includes('I have found 1 file about <b>morning fitness</b> in your wiki.'), 'counts only corroborated result');
    check(t.includes('Morning Fitness Routine'), 'shows the real semantic source');
    check(!t.includes('101649'), 'excludes FTS-only inbox noise not corroborated by Vectorize');
  });

  // 9. Knowledge Search (LLM denies info despite results → deterministic ack overrides)
  await runScenario('Knowledge_Search: LLM "no information" contradiction is overridden', async () => {
    fixtures.intent = 'Knowledge_Search';
    fixtures.vectorMatches = [{ id: 'c1', score: 0.94 }];
    fixtures.chunksByIds = [
      { id: 'c1', github_path: 'inbox/2026-08-05/101529.md', title: null, content: 'PRJ226 notes content.', tags: null, updated_at: '2026-08-05' },
    ];
    fixtures.proText = 'I currently have no specific information regarding the contents of PRJ226 [1].';
    await handleWorkerPayload(textMsg('search about PRJ226'), mockEnv);
    const t = lastText();
    check(t.includes('Knowledge Search Results'), 'replies results header');
    check(t.includes('I have found 1 file about <b>PRJ226</b> in your wiki.'), 'emits deterministic found-ack now showing result count');
    check(!t.includes('have no specific information'), 'strips contradictory "no information" claim');
    check(t.includes('Sources:'), 'still lists the actual source');
  });

  // 9b. Knowledge Search (whole-picture topic census → lists all related files as GitHub links)
  await runScenario('Knowledge_Search: topic census lists all related files with GitHub links', async () => {
    fixtures.intent = 'Knowledge_Search';
    fixtures.vectorMatches = [{ id: 'c1', score: 0.96 }];
    fixtures.chunksByIds = [
      { id: 'c1', github_path: 'wiki/projects/prj226-second-brain.md', title: 'PRJ226 Second Brain', content: 'PRJ226 orchestrates an Obsidian vault on the edge stack.', tags: null, updated_at: '2026-08-05' },
    ];
    fixtures.relatedFiles = [
      { github_path: 'tasks/2026-08-03-prj226-roadmap.md', matchCount: 2 },
      { github_path: 'tasks/2026-08-03-doing-competitive-research-for-prj226.md', matchCount: 1 },
      { github_path: 'wiki/projects/prj226-competitor-benchmark.md', matchCount: 1 },
    ];
    fixtures.proText = 'PRJ226 orchestrates an Obsidian second brain [1].';
    await handleWorkerPayload(textMsg('what do you know about PRJ226'), mockEnv);
    const t = lastText();
    check(t.includes('I have found 3 files about <b>PRJ226</b> in your wiki.'), 'ack counts every related file (whole picture)');
    check(t.includes('Related files (3):'), 'renders census header with file count');
    check(t.includes('tasks/2026-08-03-prj226-roadmap.md'), 'lists prj226 roadmap task file');
    check(t.includes('tasks/2026-08-03-doing-competitive-research-for-prj226.md'), 'lists competitive-research task file');
    check(t.includes('wiki/projects/prj226-competitor-benchmark.md'), 'lists competitor-benchmark wiki file');
    check(t.includes('hdangprod_wiki/blob/main/'), 'source links point to the wiki repo for verification');
  });

  // 10. Session Handoff
  await runScenario('Session_Handoff: saves summary', async () => {
    fixtures.intent = 'Session_Handoff';
    fixtures.actionableTasks = [
      { id: 't1', name: 'Finish auth flow', status: 'in_progress', priority: 'high', estimate_hours: 2, scheduled_date: null },
    ];
    fixtures.fastText = 'Wrapped up the auth flow; pick up token refresh next.';
    await handleWorkerPayload(textMsg('end of day'), mockEnv);
    const t = lastText();
    check(t.includes('Session Saved!'), 'replies "Session Saved!"');
    check(t.includes('Wrapped up the auth flow'), 'includes LLM handoff summary');
  });

  // 11. Reschedule success
  await runScenario('Reschedule: task found, no deps → rescheduled', async () => {
    fixtures.intent = 'Reschedule';
    fixtures.matchingTasks = [
      { id: 't1', name: 'Write report', status: 'not_started', priority: 'medium', estimate_hours: null, scheduled_date: null, depends_on: null, description: null, created_at: '', updated_at: '' },
    ];
    fixtures.reschedExtract = { taskName: 'Write report', newDate: '2026-08-10' };
    await handleWorkerPayload(textMsg('move write report to next monday'), mockEnv);
    check(lastText().includes('rescheduled to <b>2026-08-10</b>'), 'confirms new date');
  });

  // 10. Reschedule dependency warning
  await runScenario('Reschedule: dependency warning + force keyboard', async () => {
    fixtures.intent = 'Reschedule';
    fixtures.matchingTasks = [
      { id: 't1', name: 'Write report', status: 'not_started', priority: 'medium', estimate_hours: null, scheduled_date: null, depends_on: null, description: null, created_at: '', updated_at: '' },
    ];
    fixtures.dependents = [{ id: 't2', name: 'Publish report', scheduled_date: '2026-08-12' }];
    fixtures.reschedExtract = { taskName: 'Write report', newDate: '2026-08-10' };
    await handleWorkerPayload(textMsg('delay write report to august 10'), mockEnv);
    const withKeyboard = sent.find((m) => m.reply_markup);
    const t = lastText();
    check(t.includes('Dependency Warning'), 'warns about dependent tasks');
    check(t.includes('Publish report'), 'lists dependent task');
    check(!!withKeyboard, 'sends force/cancel keyboard');
  });

  // 13. Reschedule task not found
  await runScenario('Reschedule: task not found', async () => {
    fixtures.intent = 'Reschedule';
    fixtures.matchingTasks = [];
    await handleWorkerPayload(textMsg('move flying car to tomorrow'), mockEnv);
    check(lastText().includes("couldn't find a task"), 'reports task not found');
  });

  // 12. HITL low-confidence clarification
  await runScenario('HITL: confidence < 95 → clarification keyboard', async () => {
    fixtures.intent = 'Task_Capture';
    fixtures.confidence = 60;
    await handleWorkerPayload(textMsg('something ambiguous'), mockEnv);
    const t = lastText();
    const withKeyboard = sent.find((m) => m.reply_markup);
    check(t.includes("I'm not sure what you mean"), 'asks for clarification');
    check(!!withKeyboard, 'sends intent selection keyboard');
  });

  // 13. Classification failure → graceful error
  await runScenario('Classification: LLM outage → friendly error', async () => {
    fixtures.classificationError = true;
    await handleWorkerPayload(textMsg('hello there'), mockEnv);
    check(lastText().includes('temporarily overloaded'), 'replies gracefull with transient LLM error');
  });

  // 14. Inbox Organize empty
  await runScenario('Inbox_Organize: empty inbox', async () => {
    fixtures.intent = 'Inbox_Organize';
    fixtures.inboxCaptures = [];
    await handleWorkerPayload(textMsg('/inbox'), mockEnv);
    check(lastText().includes('Inbox is empty!'), 'replies "Inbox is empty!"');
  });

  // 15. Inbox Organize with captures → cards
  await runScenario('Inbox_Organize: captures listed as cards', async () => {
    fixtures.intent = 'Inbox_Organize';
    fixtures.inboxCaptures = [
      { id: 'cap1', content: 'Investigate edge caching for the wiki search hot path', source: 'telegram', file_path: 'inbox/2026-08-04/10-00.md', created_at: '2026-08-04T10:00:00Z', status: 'raw' },
    ];
    await handleWorkerPayload(textMsg('/inbox'), mockEnv);
    const withKeyboard = sent.find((m) => m.reply_markup);
    check(lastText().includes('Showing <b>1</b> unorganized capture'), 'shows capture count summary');
    check(withKeyboard?.text.includes('Inbox #1'), 'renders capture card');
    check(withKeyboard?.text.includes('Investigate edge caching'), 'renders capture preview');
    check(JSON.stringify(withKeyboard?.reply_markup).includes('organize:cap1'), 'card has organize button');
  });

  // 16. Callback: intent selection
  await runScenario('Callback: intent:Daily_Focus → dispatches skill', async () => {
    fixtures.intent = 'Daily_Focus';
    await handleWorkerPayload(callbackMsg('intent:Daily_Focus'), mockEnv);
    check(lastText().includes('All clear!'), 'dispatches Daily_Focus via callback');
  });

  // 17. Callback: organize with missing capture
  await runScenario('Callback: organize:missing → capture not found', async () => {
    fixtures.capture = null;
    await handleWorkerPayload(callbackMsg('organize:does-not-exist'), mockEnv);
    check(lastText().includes('Capture not found'), 'reports capture not found');
  });

  // 19. Callback: task_from_inbox → converts to task
  await runScenario('Callback: task_from_inbox → task capture', async () => {
    fixtures.capture = { id: 'cap1', content: 'Buy groceries on the way home', source: 'telegram', file_path: 'inbox/2026-08-04/11-00.md', created_at: '2026-08-04T11:00:00Z', status: 'raw' };
    fixtures.taskExtract = { name: 'Buy groceries', priority: 'medium', estimate_hours: null, scheduled_date: null };
    await handleWorkerPayload(callbackMsg('task_from_inbox:cap1'), mockEnv);
    check(lastText().includes('Task captured!'), 'converts inbox capture to task');
    check(lastText().includes('Buy groceries'), 'extracts task name from capture');
  });

  // 21. Empty text dropped silently
  await runScenario('Guard: empty text payload dropped', async () => {
    sent.length = 0;
    await handleWorkerPayload({ message: { text: '', chat: { id: CHAT_ID } } }, mockEnv);
    check(sent.length === 0, 'sends no Telegram message for empty text');
  });

  // 22. Callback: cancel_organize
  await runScenario('Callback: cancel_organize → cancelled', async () => {
    await handleWorkerPayload(callbackMsg('cancel_organize:cap1'), mockEnv);
    check(lastText().includes('Organization cancelled'), 'replies cancelled');
  });

  console.log(`\n=== Bot Suite Results: ${passed} passed, ${failed} failed ===`);
  globalThis.fetch = realFetch;
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Bot suite execution error:', err);
  globalThis.fetch = realFetch;
  process.exit(1);
});
