/**
 * PRJ226 v3.0: Rescue Mode Skill
 * Intent: Rescue_Mode
 *
 * For users experiencing cognitive fatigue.
 * Returns quick-win tasks (estimate_hours ≤ 0.5) with no dependency blocks.
 */

import type { SkillContext } from '../governance/intentRouter';
import { D1Client } from '../tools/d1Client';
import { sendMessage } from '../tools/telegramClient';

export async function handleRescueMode(ctx: SkillContext): Promise<void> {
  const { chatId, env } = ctx;
  const d1 = new D1Client(env);

  await sendMessage(chatId, '💤 <i>Finding easy wins for you...</i>', env);

  const tasks = await d1.getRescueTasks(0.5, 5);

  if (tasks.length === 0) {
    await sendMessage(
      chatId,
      '🧘 <b>Rescue Mode</b>\n\nNo quick-win tasks found right now. Maybe take a short break and come back? You\'ve got this! ❤️',
      env,
    );
    return;
  }

  const taskList = tasks
    .map(
      (t, i) =>
        `${i + 1}. ${t.name}${t.estimate_hours ? ` <i>(~${t.estimate_hours * 60} min)</i>` : ''}`,
    )
    .join('\n');

  await sendMessage(
    chatId,
    `💤 <b>Rescue Mode — Quick Wins</b>

Here are ${tasks.length} easy tasks you can tackle right now:

${taskList}

<i>Pick one and build momentum. You\'re doing great! 💪</i>`,
    env,
  );
}
