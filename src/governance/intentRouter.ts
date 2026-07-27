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
import { LLMRouter } from '../router/llmRouter';
import { sendMessage, sendMessageWithKeyboard } from '../tools/telegramClient';
import { handleDailyFocus } from '../skills/dailyFocusSkill';
import { handleTaskCapture } from '../skills/taskCaptureSkill';
import { handleKnowledgeSearch } from '../skills/knowledgeSearchSkill';
import { handleRescueMode } from '../skills/rescueModeSkill';
import { handleSessionHandoff } from '../skills/sessionHandoffSkill';
import { handleReschedule } from '../skills/rescheduleSkill';
import type { TelegramUpdate } from '../sensors/telegramWebhook';

// ─── Intent Schema ────────────────────────────────────────────────────────────

export const INTENTS = [
  'Daily_Focus',
  'Task_Capture',
  'Reschedule',
  'Knowledge_Search',
  'Rescue_Mode',
  'Session_Handoff',
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

  // Classify intent
  const llm = new LLMRouter(env);
  let classification: IntentResponse;

  try {
    classification = await llm.callFastStructured<IntentResponse>(
      `User message: "${userText}"`,
      IntentResponseSchema,
      INTENT_SYSTEM_PROMPT,
    );
  } catch (err) {
    console.error('[IntentRouter] Classification failed:', err);
    await sendMessage(chatId, '⚠️ Liam is having trouble understanding that. Please try again.', env);
    return;
  }

  console.log(
    `[IntentRouter] Intent: ${classification.intent}, Confidence: ${classification.confidence}%`,
  );

  // HITL: confidence < 95% → ask for clarification
  if (classification.confidence < 95) {
    await sendHITLClarification(chatId, userText, classification, env);
    return;
  }

  // Dispatch to skill
  await dispatchToSkill(classification, chatId, userText, update as unknown as TelegramUpdate, env);
}

// ─── Skill Dispatcher ───────────────────────────────────────────────────────────

async function dispatchToSkill(
  classification: IntentResponse,
  chatId: number,
  userText: string,
  update: TelegramUpdate,
  env: Env,
): Promise<void> {
  const ctx = { chatId, userText, extracted: classification.extracted ?? {}, env, update };

  try {
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
      default:
        await sendMessage(chatId, "❓ I wasn't sure how to handle that. Could you rephrase?", env);
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

// ─── HITL Clarification ──────────────────────────────────────────────────────────

async function sendHITLClarification(
  chatId: number,
  userText: string,
  classification: IntentResponse,
  env: Env,
): Promise<void> {
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
    ],
  };

  await sendMessageWithKeyboard(
    chatId,
    `🤔 I'm not sure what you mean by:\n<i>"${escapeHtml(userText)}"</i>\n\nWhat would you like to do?`,
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
}
