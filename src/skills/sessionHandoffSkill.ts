/**
 * PRJ226 v3.0: Session Handoff Skill
 * Intent: Session_Handoff
 *
 * Saves working memory snapshot at end of day.
 * Reads current in-progress tasks, asks LLM to summarize, stores in Cloudflare D1.
 */

import type { SkillContext } from '../governance/intentRouter';
import { D1Client } from '../tools/d1Client';
import { LLMRouter } from '../router/llmRouter';
import { sendMessage } from '../tools/telegramClient';

export async function handleSessionHandoff(ctx: SkillContext): Promise<void> {
  const { chatId, userText, env } = ctx;
  const d1 = new D1Client(env);
  const llm = new LLMRouter(env);

  await sendMessage(chatId, '🌙 <i>Saving your session handoff...</i>', env);

  // Get current in-progress tasks
  const inProgressTasks = await d1.getActionableTasks(5);
  const taskSummary = inProgressTasks
    .map((t) => `- ${t.name} [${t.status}]`)
    .join('\n') || 'No active tasks.';

  // Ask LLM to generate a handoff summary
  const handoffSummary = await llm.callFast(
    `The user is ending their work session. They said: "${userText}"\n\nCurrent active tasks:\n${taskSummary}\n\nWrite a brief 1-2 sentence session handoff summary (what was done, what to pick up next).`,
    'You are Liam, an AI second brain assistant. Write concise session handoff notes.',
  );

  // Save to working memory
  const nextTask = inProgressTasks[0];
  await d1.saveWorkingMemory({
    lastAction: userText || 'Session handoff',
    doing: inProgressTasks[0]?.name,
    nextAction: nextTask?.name,
    metadata: {
      handoffSummary,
      taskCount: inProgressTasks.length,
      timestamp: new Date().toISOString(),
    },
  });

  await sendMessage(
    chatId,
    `🌙 <b>Session Saved!</b>

${handoffSummary}

<i>Rest well. Liam will pick up where you left off tomorrow. 😊</i>`,
    env,
  );
}
