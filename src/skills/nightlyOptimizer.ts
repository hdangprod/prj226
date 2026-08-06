/**
 * PRJ226 v4.3: Nightly Prompt Optimizer
 * Cron Trigger: 0 20 * * * (03:00 UTC+7)
 *
 * Analyzes failed evaluation traces from the past day and proposes
 * concrete prompt improvements. Results are stored as 'pending' in
 * prompt_versions and sent to Telegram for manual review.
 */

import type { Env } from '../config';
import { D1Client } from '../tools/d1Client';
import { LLMRouter } from '../router/llmRouter';
import { sendMessage } from '../tools/telegramClient';

const OPTIMIZER_SYSTEM_PROMPT = `You are a Prompt Engineering Optimizer for a LifeOS task generation system.
Analyze patterns of rejected task drafts. Identify recurring weaknesses.
Propose concrete, actionable rules to append to the GENERATION_SYSTEM_PROMPT.
Output ONLY a diff of new rules in this format:
RULE_1: <new rule text>
RULE_2: <new rule text>
...
Do NOT repeat existing rules. Focus on fixing the specific patterns that caused failures.`;

export async function nightlyPromptOptimizer(env: Env): Promise<void> {
  const d1 = new D1Client(env);
  const llm = new LLMRouter(env);

  console.log('[NightlyOptimizer] Starting prompt optimization analysis...');

  // 1. Query failed evaluations
  const failedEvals = await d1.getFailedEvals(50);

  if (failedEvals.length < 5) {
    console.log(`[NightlyOptimizer] Only ${failedEvals.length} failures found. Skipping (need >= 5).`);
    return;
  }

  // 2. Fetch iteration details for failed evals
  const evalIds = failedEvals.map((e) => e.id);
  const iterations = await d1.getEvalIterationsByIds(evalIds);

  // 3. Build analysis prompt
  const failureSummary = failedEvals.slice(0, 20).map((e, i) => {
    const iters = iterations.filter((it) => it.eval_id === e.id);
    const lastIter = iters[iters.length - 1];
    return `Failure ${i + 1}:
  Prompt: "${e.prompt}"
  Final Score: ${e.final_score}
  Last Draft: ${lastIter?.draft || 'N/A'}
  Last Critique: ${lastIter?.critique || 'N/A'}`;
  }).join('\n\n');

  const analysisPrompt = `Here are ${failedEvals.length} recently rejected task generation attempts:\n\n${failureSummary}\n\nAnalyze the patterns and propose new rules.`;

  // 4. Generate proposed rules
  let proposedRules: string;
  try {
    proposedRules = await llm.callFast(analysisPrompt, OPTIMIZER_SYSTEM_PROMPT);
  } catch (err) {
    console.error('[NightlyOptimizer] LLM analysis failed:', err);
    return;
  }

  if (!proposedRules || proposedRules.trim().length < 10) {
    console.log('[NightlyOptimizer] No meaningful rules proposed. Skipping.');
    return;
  }

  // 5. Persist to prompt_versions
  const versionId = crypto.randomUUID();
  const version = new Date().toISOString().split('T')[0];
  await d1.insertPromptVersion({
    id: versionId,
    version,
    diff: proposedRules,
    status: 'pending',
  });

  // 6. Send digest to Telegram
  const chatId = parseInt(env.TELEGRAM_CHAT_ID, 10);
  if (chatId) {
    const digest = `🤖 <b>Nightly Prompt Optimizer</b>\n\n📊 Analyzed <b>${failedEvals.length}</b> failed task generations.\n\n<b>Proposed Rule Changes:</b>\n<pre>${escapeHtml(proposedRules.substring(0, 3000))}</pre>\n\n<i>Status: pending manual review</i>\n<code>Version: ${version} | ID: ${versionId.substring(0, 8)}</code>`;
    await sendMessage(chatId, digest, env);
  }

  console.log(`[NightlyOptimizer] Proposed ${proposedRules.split('RULE_').length - 1} new rules. Version: ${version}`);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
