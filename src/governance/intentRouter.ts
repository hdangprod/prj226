/**
 * PRJ226 v3.0: Intent Router (Governance Layer)
 *
 * Classifies incoming Telegram payloads into 6 skill intents using
 * the model-agnostic LLMRouter (Vercel AI SDK — provider-agnostic).
 *
 * Intents:
 *   - Daily_Focus      → morning summary, actionable task list
 *   - Task_Capture     → add new task to backlog
 *   - Reschedule       → move/postpone task, dependency conflict check
 *   - Knowledge_Search → RAG query across notes_staging + knowledge_wiki
 *   - Rescue_Mode      → low-energy quick-win task suggestions
 *   - Session_Handoff  → end-of-day memory snapshot, next-session prep
 *
 * Routing:
 *   - Confidence ≥ 95% → dispatch to skill
 *   - Confidence < 95% → HITL clarification keyboard
 */

import { z } from 'zod';
import type { Env } from '../config';
import { BOT_MESSAGES } from '../constants/messages';
import { LLMRouter } from '../router/llmRouter';
import { D1Client } from '../tools/d1Client';
import { sendMessage, sendMessageWithKeyboard } from '../tools/telegramClient';
import { handleDailyFocus } from '../skills/dailyFocusSkill';
import { handleTaskCapture } from '../skills/taskCaptureSkill';
import { handleKnowledgeSearch } from '../skills/knowledgeSearchSkill';
import { handleRescueMode } from '../skills/rescueModeSkill';
import { handleSessionHandoff } from '../skills/sessionHandoffSkill';
import { handleReschedule } from '../skills/rescheduleSkill';
import { handleInboxOrganize, handleOrganizeCapture, handleApproveOrganize, handleArchiveInbox } from '../skills/inboxOrganizeSkill';
import { getLocalDate } from '../lib/dateUtils';
import type { TelegramUpdate } from '../sensors/telegramWebhook';

// ─── Intent Schema ────────────────────────────────────────────────────────────

export const INTENTS = [
  'Daily_Focus',
  'Task_Capture',
  'Reschedule',
  'Knowledge_Search',
  'Rescue_Mode',
  'Session_Handoff',
  'Inbox_Organize',
] as const;

export type Intent = (typeof INTENTS)[number];

const IntentResponseSchema = z.object({
  intent: z.enum(INTENTS),
  confidence: z.number().min(0).max(100),
  extracted: z.record(z.unknown()).optional(),
});

type IntentResponse = z.infer<typeof IntentResponseSchema>;

// ─── System Prompt ────────────────────────────────────────────────────────────

const INTENT_SYSTEM_PROMPT = `You are Liam, an AI second brain assistant. Classify the user's message into exactly one intent.

Available intents:
- Daily_Focus: User wants their daily summary, morning briefing, or list of today's tasks. Examples: "what are my tasks today", "morning brief", "what should I work on"
- Task_Capture: User wants to add, log, or capture a new task/to-do. Examples: "add task", "remind me to", "create a task for", "note down"
- Reschedule: User wants to move, delay, or reschedule a task or appointment. Examples: "reschedule", "move tennis to tomorrow", "delay task X", "push back"
- Knowledge_Search: User is searching for information in their notes or knowledge base. Examples: "what do I know about", "find my notes on", "search for", "what documents do I have"
- Rescue_Mode: User is tired, low energy, or overwhelmed and needs easy tasks. Examples: "I'm tired", "low energy", "what can I do quickly", "easy wins", "rescue me"
- Session_Handoff: User wants to close their work session, save state, or prepare for tomorrow. Examples: "end of day", "save my progress", "session handoff", "wrapping up", "handoff to tomorrow"
- Inbox_Organize: User wants to review, organize, or process their raw inbox captures into permanent knowledge notes. Examples: "/inbox", "organize my notes", "review inbox", "what did I capture", "process my thoughts", "show my captures"

Return a JSON object with:
- intent: the classified intent string
- confidence: number 0-100 (how confident you are)
- extracted: optional key-value pairs extracted from the message (e.g. taskName, date, searchQuery)`;

// ─── Main Handler ───────────────────────────────────────────────────────────────

export async function handleWorkerPayload(
  update: Record<string, unknown>,
  env: Env,
): Promise<void> {
  const chatId =
    (update.message as { chat?: { id: number } } | undefined)?.chat?.id ??
    (update.callback_query as { message?: { chat?: { id: number } } } | undefined)?.message?.chat?.id;

  if (!chatId) {
    console.warn('[IntentRouter] No chatId in payload. Dropping.');
    return;
  }
  
  console.log(JSON.stringify({ event: 'intent_router_start', chatId }));

  // Handle callback_query (button presses) separately
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query as Record<string, unknown>, chatId, env);
    return;
  }

  const userText = (update.message as { text?: string } | undefined)?.text ?? '';
  if (!userText.trim()) {
    console.log('[IntentRouter] Empty text payload. Ignoring.');
    return;
  }

  // Universal Zero-Loss Ingestion: Save every user message to pending_captures
  let captureId: string | null = null;
  const isControlCommand =
    userText.trim().startsWith('/') ||
    ['check tasks today', 'morning brief', 'end of day', 'wrapping up'].includes(
      userText.trim().toLowerCase(),
    );

  // Support /search <query> explicit control command
  const trimmedText = userText.trim();
  if (trimmedText.toLowerCase().startsWith('/search')) {
    const query = trimmedText.replace(/^\/search\s*/i, '').trim();
    const searchQuery = query || 'PRJ226';
    await dispatchToSkill(
      { intent: 'Knowledge_Search', confidence: 100, extracted: { searchQuery } },
      chatId,
      searchQuery,
      update as unknown as TelegramUpdate,
      env,
      captureId,
    );
    return;
  }

  if (!isControlCommand) {
    try {
      const d1 = new D1Client(env);
      const { dateStr: datePath, timePart } = getLocalDate();
      const filePath = `inbox/${datePath}/${timePart}.md`;
      captureId = await d1.createCapture(userText, filePath);
    } catch (ingestErr) {
      console.warn('[Zero-Loss Ingestion Warning]:', ingestErr);
    }
  }

  // Classify intent
  const llm = new LLMRouter(env);
  let classification: IntentResponse;

  try {
    classification = await llm.callFastStructured<IntentResponse>(
      `User message: "${userText}"`,
      IntentResponseSchema,
      INTENT_SYSTEM_PROMPT,
    );
  } catch (err: any) {
    console.error('[IntentRouter] Classification failed:', err);
    await sendMessage(chatId, BOT_MESSAGES.ERRORS.LLM_TRANSIENT, env);
    return;
  }

  console.log(
    `[IntentRouter] Intent: ${classification.intent}, Confidence: ${classification.confidence}%`,
  );

  // HITL: confidence < 95% → ask for clarification
  if (classification.confidence < 95) {
    await sendHITLClarification(chatId, userText, classification, env, captureId);
    return;
  }

  // Dispatch to skill
  await dispatchToSkill(classification, chatId, userText, update as unknown as TelegramUpdate, env, captureId);
  
  console.log(JSON.stringify({ event: 'intent_router_end', chatId }));
}

// ─── Skill Dispatcher ───────────────────────────────────────────────────────────

const SKILL_TIMEOUT_MS = 30000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Skill execution timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

async function dispatchToSkill(
  classification: IntentResponse,
  chatId: number,
  userText: string,
  update: TelegramUpdate,
  env: Env,
  captureId?: string | null,
): Promise<void> {
  const ctx = { chatId, userText, extracted: classification.extracted ?? {}, env, update, captureId };

  try {
    await withTimeout(executeSkill(classification, ctx, chatId, env), SKILL_TIMEOUT_MS);

    // Successfully handled → remove from the /inbox queue.
    // Failed/low-confidence captures keep needs_review = 1 and stay in inbox.
    if (captureId) {
      try {
        await new D1Client(env).markCaptureProcessed(captureId);
      } catch (markErr) {
        console.warn('[IntentRouter] Failed to mark capture processed:', markErr);
      }
    }
  } catch (err) {
    console.error(`[IntentRouter] Skill execution error (${classification.intent}):`, err);
    await sendMessage(
      chatId,
      '⚠️ System busy, please retry in a moment.',
      env,
    );
  }
}

async function executeSkill(
  classification: IntentResponse,
  ctx: SkillContext,
  chatId: number,
  env: Env,
): Promise<void> {
  switch (classification.intent) {
    case 'Daily_Focus':
      await handleDailyFocus(ctx);
      break;
    case 'Task_Capture':
      await handleTaskCapture(ctx);
      break;
    case 'Reschedule':
      await handleReschedule(ctx);
      break;
    case 'Knowledge_Search':
      await handleKnowledgeSearch(ctx);
      break;
    case 'Rescue_Mode':
      await handleRescueMode(ctx);
      break;
    case 'Session_Handoff':
      await handleSessionHandoff(ctx);
      break;
    case 'Inbox_Organize':
      await handleInboxOrganize(ctx);
      break;
    default:
      await sendMessage(chatId, "❓ I wasn't sure how to handle that. Could you rephrase?", env);
  }
}

// ─── HITL Clarification ──────────────────────────────────────────────────────────

async function sendHITLClarification(
  chatId: number,
  userText: string,
  classification: IntentResponse,
  env: Env,
  captureId?: string | null,
): Promise<void> {
  const { dateStr: datePath, timePart } = getLocalDate();
  
  // If not captured yet, capture now
  if (!captureId) {
    const d1 = new D1Client(env);
    const filePath = `inbox/${datePath}/${timePart}.md`;
    await d1.createCapture(userText, filePath);
  }

  const obsidianUrl = `obsidian://new?vault=hdangprod_wiki&file=inbox/${datePath}/${timePart}&content=${encodeURIComponent(userText)}`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🌅 Daily Focus', callback_data: 'intent:Daily_Focus' },
        { text: '➕ Capture Task', callback_data: 'intent:Task_Capture' },
      ],
      [
        { text: '🔄 Reschedule', callback_data: 'intent:Reschedule' },
        { text: '🔍 Search Notes', callback_data: 'intent:Knowledge_Search' },
      ],
      [
        { text: '💤 Rescue Mode', callback_data: 'intent:Rescue_Mode' },
        { text: '🌙 End Session', callback_data: 'intent:Session_Handoff' },
      ],
      [
        { text: '📥 Organize Inbox', callback_data: 'intent:Inbox_Organize' },
      ],
    ],
  };

  await sendMessageWithKeyboard(
    chatId,
    `🤔 I'm not sure what you mean by:\n<i>"${escapeHtml(userText)}"</i>\n\n📝 <a href="${obsidianUrl}">Open draft in Obsidian</a>\n\nWhat would you like to do?`,
    keyboard,
    env,
  );
}

// ─── Callback Query Handler ───────────────────────────────────────────────────────

async function handleCallbackQuery(
  callbackQuery: Record<string, unknown>,
  chatId: number,
  env: Env,
): Promise<void> {
  const data = callbackQuery.data as string | undefined;
  if (!data) return;

  // HITL intent selection: 'intent:Daily_Focus', etc.
  if (data.startsWith('intent:')) {
    const intent = data.replace('intent:', '') as Intent;
    if (!INTENTS.includes(intent)) return;

    await dispatchToSkill(
      { intent, confidence: 100, extracted: {} },
      chatId,
      '',
      {} as unknown as TelegramUpdate,
      env,
    );
  }

  // Inbox Organize callbacks
  if (data.startsWith('organize:')) {
    const captureId = data.replace('organize:', '');
    await handleOrganizeCapture(captureId, chatId, env);
  }

  if (data.startsWith('approve_organize:')) {
    const captureId = data.replace('approve_organize:', '');
    await handleApproveOrganize(captureId, chatId, env);
  }

  if (data.startsWith('archive_inbox:')) {
    const captureId = data.replace('archive_inbox:', '');
    await handleArchiveInbox(captureId, chatId, env);
  }

  if (data.startsWith('cancel_organize:')) {
    await sendMessage(chatId, '❌ Organization cancelled.', env);
  }

  if (data.startsWith('task_from_inbox:')) {
    const captureId = data.replace('task_from_inbox:', '');
    const d1 = new D1Client(env);
    const capture = await d1.getCaptureById(captureId);
    if (capture) {
      await dispatchToSkill(
        { intent: 'Task_Capture', confidence: 100, extracted: {} },
        chatId,
        capture.content,
        {} as unknown as TelegramUpdate,
        env,
      );
    }
  }

  if (data.startsWith('view_chunk:')) {
    const chunkId = data.replace('view_chunk:', '');
    const d1 = new D1Client(env);
    const chunks = await d1.getChunksByIds([chunkId]);
    if (chunks.length > 0) {
      const c = chunks[0];
      const title = c.title || c.github_path || 'Snippet';
      const cleanPath = (c.github_path || '').replace(/\.md$/, '');
      const obsidianUrl = `obsidian://open?vault=hdangprod_wiki&file=${encodeURIComponent(cleanPath)}`;
      await sendMessage(
        chatId,
        `📄 <code>${escapeHtml(title)}</code>\n\n<pre>${escapeHtml(c.content)}</pre>\n\n📝 <b>Open in Obsidian:</b>\n<code>${obsidianUrl}</code>`,
        env,
      );
    } else {
      await sendMessage(chatId, '⚠️ Snippet not found.', env);
    }
  }
}

// ─── Utils ──────────────────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Shared skill context type */
export interface SkillContext {
  chatId: number;
  userText: string;
  extracted: Record<string, unknown>;
  env: Env;
  update: TelegramUpdate;
  captureId?: string | null;
}
