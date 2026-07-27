/**
 * PRJ226 v3.0: Daily Focus Skill
 * Intent: Daily_Focus
 *
 * Fetches actionable tasks (dependency-cleared) + latest working memory,
 * asks Gemini to synthesize a structured daily briefing, and sends to Telegram.
 */

import type { SkillContext } from '../governance/intentRouter';
import { NeonClient } from '../tools/neonClient';
import { LLMRouter } from '../router/llmRouter';
import { sendMessage } from '../tools/telegramClient';

export async function handleDailyFocus(ctx: SkillContext): Promise<void> {
  const { chatId, env } = ctx;
  const neon = new NeonClient(env);
  const llm = new LLMRouter(env);

  // Update status message
  await sendMessage(chatId, '🔍 <i>Reviewing your tasks and working memory...</i>', env);

  // Fetch data in parallel
  const [tasks, memory] = await Promise.all([
    neon.getActionableTasks(10),
    neon.getLatestWorkingMemory(),
  ]);

  if (tasks.length === 0) {
    await sendMessage(
      chatId,
      '✅ <b>All clear!</b> No pending tasks found. Great job staying on top of things!',
      env,
    );
    return;
  }

  // Build context for Gemini
  const taskList = tasks
    .map(
      (t, i) =>
        `${i + 1}. [${t.priority.toUpperCase()}] ${t.name}${t.estimate_hours ? ` (~${t.estimate_hours}h)` : ''}${t.scheduled_date ? ` — due ${t.scheduled_date}` : ''}`,
    )
    .join('\n');

  const memoryContext = memory
    ? `Last session:
- Last action: ${memory.last_action ?? 'N/A'}
- Was working on: ${memory.doing ?? 'N/A'}
- Next planned: ${memory.next_action ?? 'N/A'}`
    : 'No previous session data available.';

  const prompt = `You are Liam, an AI second brain assistant. Synthesize a concise daily focus briefing for your user.

${memoryContext}

Actionable tasks (dependency-cleared, priority ordered):
${taskList}

Format response as:
1. One-sentence "today's focus" recommendation
2. Bulleted task list (max 5 items, with emojis and time estimates)
3. One short motivational line

Keep it under 200 words. Use HTML formatting (bold, italic) for Telegram.`;

  const briefing = await llm.callPro(prompt);

  await sendMessage(chatId, `🌅 <b>Daily Briefing</b>\n\n${briefing}`, env);
}
