/**
 * PRJ226 v4.3: Self-Evaluation Reflection Loop
 * 
 * Implements a multi-pass Generate→Judge→Refine pipeline for task capture.
 * Uses structured LLM output (Zod schemas) to ensure quality grounding in RAG context.
 * 
 * Architecture:
 *   1. Generate: Produce actionable to-do items from RAG context
 *   2. Judge: Score the draft against strict criteria (structured JSON)
 *   3. Refine: If score < threshold, inject critique and retry
 *   4. Persist: Save all iterations to D1 for nightly optimization
 */

import { z } from 'zod';
import type { Env } from '../config';
import { LLMRouter } from '../router/llmRouter';
import type { TokenUsage } from '../router/llmRouter';
import { D1Client } from '../tools/d1Client';

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const SCORE_THRESHOLD = 0.8;
const LOOP_DEADLINE_MS = 20_000;
const TOKEN_BUDGET = 15_000;
const MAX_CHARS_PER_NOTE = 3000;
const TEMPERATURES = [0.7, 0.6, 0.5, 0.4];

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

export const GeneratedTasksSchema = z.object({
  tasks: z.array(z.string()).min(1).max(8),
});

export const JudgeEvaluationSchema = z.object({
  score: z.number().min(0).max(1),
  criteria: z.object({
    actionable: z.boolean(),
    grounded: z.boolean(),
    specific: z.boolean(),
    executable: z.boolean(),
  }),
  critique: z.string(),
  worst_item_index: z.number().int(),
});

export type GeneratedTasks = z.infer<typeof GeneratedTasksSchema>;
export type JudgeEvaluation = z.infer<typeof JudgeEvaluationSchema>;

// ─── Prompt Templates ────────────────────────────────────────────────────────

const GENERATION_SYSTEM_PROMPT = `You are my LifeOS AI Assistant. A new task has been created. I have provided retrieved context from my Second Brain.
Your goal is to generate a highly actionable To-do list based STRICTLY on the provided context.
CRITICAL RULES:
1. Do NOT generate generic tasks like 'Review requirements', 'Outline findings', or 'Document results'.
2. Extract specific entities, metrics, and existing Action Items from the context to form the tasks.
3. Every task must start with an action verb and be immediately executable.
4. Reference specific competitors, metrics, dates, or data points from the context.
5. Generate 3-6 tasks maximum. Quality over quantity.
Return a JSON object with a "tasks" array of task strings.`;

const JUDGE_SYSTEM_PROMPT = `You are a strict Task Quality Reviewer for a LifeOS.
Score the DRAFT against CONTEXT.
Criteria (binary true/false):
1. actionable: every item starts with a verb and names a specific object.
2. grounded: every item references entities/metrics from CONTEXT (no generic filler like 'review requirements').
3. specific: 80% of items contain domain-specific nouns from CONTEXT.
4. executable: user can start item #1 immediately without additional research.
Return score (0.0 to 1.0 = fraction of criteria passed), critique (how to fix weakest item), worst_item_index (0-indexed).`;

const REFINE_SYSTEM_PROMPT = `You are my LifeOS AI. Regenerate the To-do list.
Fix the flagged weakness FIRST. Keep items that passed. Ground everything in CONTEXT.
Return a JSON object with a "tasks" array of task strings.`;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RetrievedNote {
  title: string;
  path: string;
  score: number;
  content: string;
}

export interface EvalIteration {
  iterIndex: number;
  draft: string[];
  score: number;
  criteria: JudgeEvaluation['criteria'];
  critique: string;
  worstItemIndex: number;
  usage: TokenUsage;
}

export interface ReflectionResult {
  tasks: string[];
  finalScore: number;
  passed: boolean;
  iterations: EvalIteration[];
  totalUsage: TokenUsage;
  relatedNotes: RetrievedNote[];
}

// ─── Smart Context Builder ───────────────────────────────────────────────────

/**
 * Builds context string from retrieved notes with smart truncation.
 * Preserves "Action Items" sections when truncating long notes.
 */
export function buildSmartContext(notes: RetrievedNote[]): string {
  return notes.map((n, i) => {
    let content = n.content;
    if (content.length > MAX_CHARS_PER_NOTE) {
      content = smartTruncate(content, MAX_CHARS_PER_NOTE);
    }
    return `[Resource ${i + 1}] ${n.title}:\n${content}`;
  }).join('\n\n---\n\n');
}

function smartTruncate(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;

  // Try to find and preserve Action Items sections
  const actionPattern = /(?:Action Items|Tasks|TODO|Next Steps|Key Points)[:\s]*\n([\s\S]*?)(?:\n##|\n#|$)/i;
  const actionMatch = content.match(actionPattern);

  const headerBudget = Math.floor(maxChars * 0.6);
  const header = content.substring(0, headerBudget);

  if (actionMatch) {
    const actionSection = actionMatch[0].substring(0, Math.floor(maxChars * 0.4));
    return header + '\n...\n**[Action Items Preserved]:**\n' + actionSection;
  }

  // Fallback: take header + tail
  const tailBudget = Math.floor(maxChars * 0.4);
  const tail = content.substring(content.length - tailBudget);
  return header + '\n...\n' + tail;
}

// ─── Core Reflection Loop ────────────────────────────────────────────────────

/**
 * Generates an actionable task list using a multi-pass reflection loop.
 * 
 * Flow: Generate → Judge → (Refine → Judge) × MAX_RETRIES
 * Exits early on: score >= threshold, deadline exceeded, token budget exceeded.
 */
export async function generateTaskWithReflection(
  taskName: string,
  context: string,
  relatedNotes: RetrievedNote[],
  env: Env,
): Promise<ReflectionResult> {
  const llm = new LLMRouter(env);
  const deadline = Date.now() + LOOP_DEADLINE_MS;
  const iterations: EvalIteration[] = [];
  let totalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let bestDraft: string[] = [];
  let bestScore = 0;
  let passed = false;

  for (let i = 0; i <= MAX_RETRIES; i++) {
    // Deadline guard
    if (Date.now() > deadline) {
      console.warn(`[ReflectionLoop] Deadline exceeded at iteration ${i}. Using best draft.`);
      break;
    }

    // Token budget guard
    if (totalUsage.totalTokens > TOKEN_BUDGET) {
      console.warn(`[ReflectionLoop] Token budget exceeded (${totalUsage.totalTokens}/${TOKEN_BUDGET}). Using best draft.`);
      break;
    }

    const temperature = TEMPERATURES[Math.min(i, TEMPERATURES.length - 1)];

    // ── Step 1: Generate (or Refine) ──
    let draft: string[];
    try {
      if (i === 0) {
        // First attempt: Generate from scratch
        const generatePrompt = `Task: "${taskName}"\n\nRetrieved context from Second Brain:\n${context}\n\nGenerate a highly actionable To-do list based strictly on the context above.`;
        const { data, usage } = await llm.callFastStructured(
          generatePrompt,
          GeneratedTasksSchema,
          GENERATION_SYSTEM_PROMPT,
          { temperature },
        );
        draft = data.tasks;
        addUsage(totalUsage, usage);
      } else {
        // Retry: Refine with critique
        const prevIteration = iterations[iterations.length - 1];
        const refinePrompt = `Task: "${taskName}"\n\nCONTEXT:\n${context}\n\nPREVIOUS DRAFT (rejected):\n${prevIteration.draft.map((t, j) => `${j + 1}. ${t}`).join('\n')}\n\nJUDGE CRITIQUE: ${prevIteration.critique}\nWORST ITEM INDEX: ${prevIteration.worstItemIndex}\n\nFix the flagged weakness FIRST. Keep items that passed. Ground everything in CONTEXT.`;
        const { data, usage } = await llm.callFastStructured(
          refinePrompt,
          GeneratedTasksSchema,
          REFINE_SYSTEM_PROMPT,
          { temperature },
        );
        draft = data.tasks;
        addUsage(totalUsage, usage);
      }
    } catch (err) {
      console.warn(`[ReflectionLoop] Generate/Refine failed at iteration ${i}:`, err);
      break;
    }

    // Deadline check before Judge call
    if (Date.now() > deadline) {
      // Save what we have
      if (draft.length > 0 && draft.length > bestDraft.length) {
        bestDraft = draft;
      }
      break;
    }

    // ── Step 2: Judge ──
    let evaluation: JudgeEvaluation;
    try {
      const judgePrompt = `CONTEXT:\n${context}\n\nDRAFT TO-DO LIST:\n${draft.map((t, j) => `${j + 1}. ${t}`).join('\n')}\n\nEvaluate the draft against the context.`;
      const { data, usage } = await llm.callFastStructured(
        judgePrompt,
        JudgeEvaluationSchema,
        JUDGE_SYSTEM_PROMPT,
        { temperature: 0.3 }, // Low temperature for consistent judging
      );
      evaluation = data;
      addUsage(totalUsage, usage);
    } catch (err) {
      console.warn(`[ReflectionLoop] Judge failed at iteration ${i}:`, err);
      // If judge fails, accept the draft as-is
      if (draft.length > 0) {
        bestDraft = draft;
        bestScore = 0.5; // Unknown quality
      }
      break;
    }

    // Record iteration
    iterations.push({
      iterIndex: i,
      draft,
      score: evaluation.score,
      criteria: evaluation.criteria,
      critique: evaluation.critique,
      worstItemIndex: evaluation.worst_item_index,
      usage: { ...totalUsage },
    });

    // Track best result
    if (evaluation.score > bestScore) {
      bestScore = evaluation.score;
      bestDraft = draft;
    }

    // ── Step 3: Decision ──
    if (evaluation.score >= SCORE_THRESHOLD &&
        evaluation.criteria.actionable &&
        evaluation.criteria.grounded &&
        evaluation.criteria.specific &&
        evaluation.criteria.executable) {
      passed = true;
      console.log(`[ReflectionLoop] Passed at iteration ${i} with score ${evaluation.score}`);
      break;
    }

    console.log(`[ReflectionLoop] Iteration ${i}: score=${evaluation.score}, retrying...`);
  }

  // Fallback if no draft was generated at all
  if (bestDraft.length === 0) {
    bestDraft = [`Research and plan next steps for ${taskName}`];
  }

  return {
    tasks: bestDraft,
    finalScore: bestScore,
    passed,
    iterations,
    totalUsage,
    relatedNotes,
  };
}

// ─── D1 Persistence ──────────────────────────────────────────────────────────

/**
 * Persists the full evaluation trace (history + all iterations) to D1.
 */
export async function persistEvalTrace(
  result: ReflectionResult,
  prompt: string,
  contextHash: string,
  model: string,
  env: Env,
): Promise<string> {
  const d1 = new D1Client(env);
  const evalId = crypto.randomUUID();

  // Estimate cost (Gemini 2.0 Flash Lite via OpenRouter)
  // Input: $0.075/M tokens, Output: $0.30/M tokens (approx)
  const costUsd = (result.totalUsage.promptTokens * 0.000000075) + (result.totalUsage.completionTokens * 0.0000003);

  await d1.insertEvalHistory({
    id: evalId,
    prompt,
    contextHash,
    finalScore: result.finalScore,
    passed: result.passed ? 1 : 0,
    model,
    tokensIn: result.totalUsage.promptTokens,
    tokensOut: result.totalUsage.completionTokens,
    costUsd,
  });

  for (const iter of result.iterations) {
    await d1.insertEvalIteration({
      id: crypto.randomUUID(),
      evalId,
      iterIndex: iter.iterIndex,
      draft: iter.draft.map(t => `- [ ] ${t}`).join('\n'),
      score: iter.score,
      criteria: JSON.stringify(iter.criteria),
      critique: iter.critique,
      worstItemIndex: iter.worstItemIndex,
    });
  }

  return evalId;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function addUsage(total: TokenUsage, delta: TokenUsage): void {
  total.promptTokens += delta.promptTokens;
  total.completionTokens += delta.completionTokens;
  total.totalTokens += delta.totalTokens;
}
