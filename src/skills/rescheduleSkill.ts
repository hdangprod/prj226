/**
 * PRJ226 v3.0: Reschedule Skill
 * Intent: Reschedule
 *
 * Dependency-aware task rescheduler.
 * Warns if rescheduling a task would block downstream dependent tasks.
 */

import { z } from 'zod';
import type { SkillContext } from '../governance/intentRouter';
import { D1Client } from '../tools/d1Client';
import { LLMRouter } from '../router/llmRouter';
import { sendMessage, sendMessageWithKeyboard } from '../tools/telegramClient';

const RescheduleExtractSchema = z.object({
  taskName: z.string(),
  newDate: z.string().optional(),       // YYYY-MM-DD
  postponeDays: z.number().optional(),  // Number of days to postpone
});

export async function handleReschedule(ctx: SkillContext): Promise<void> {
  const { chatId, userText, env } = ctx;
  const d1 = new D1Client(env);
  const llm = new LLMRouter(env);

  await sendMessage(chatId, '🔄 <i>Checking dependencies...</i>', env);

  const today = new Date().toISOString().split('T')[0];

  // Extract reschedule intent
  const extracted = await llm.callFastStructured(
    `Extract reschedule details from: "${userText}"\nToday is ${today}.`,
    RescheduleExtractSchema,
    'Extract: task name, new date (YYYY-MM-DD), or number of days to postpone. Return JSON.',
  );

  // Find task in Cloudflare D1 using the public findTasksByName method
  const matchingTasks = await d1.findTasksByName(extracted.taskName, 3);

  if (matchingTasks.length === 0) {
    await sendMessage(
      chatId,
      `❓ I couldn't find a task matching "<b>${escapeHtml(extracted.taskName)}</b>" in your list. Check the task name and try again.`,
      env,
    );
    return;
  }

  const task = matchingTasks[0];

  // Check if any other task depends on this one
  const dependents = await d1.getDependentTasks(task.id);

  if (dependents.length > 0) {
    const depList = dependents.map((d) => `• <b>${escapeHtml(d.name)}</b>`).join('\n');
    const keyboard = {
      inline_keyboard: [[
        { text: '⚡ Force Reschedule', callback_data: `reschedule_force:${task.id}:${extracted.newDate ?? ''}` },
        { text: '❌ Cancel', callback_data: 'cancel' },
      ]],
    };

    await sendMessageWithKeyboard(
      chatId,
      `⚠️ <b>Dependency Warning</b>

Rescheduling <b>${escapeHtml(task.name)}</b> may block these dependent tasks:
${depList}

Do you want to force reschedule anyway, or resolve the dependencies first?`,
      keyboard,
      env,
    );
    return;
  }

  // No dependency conflicts — compute new date
  const newDate = extracted.newDate ??
    (extracted.postponeDays
      ? new Date(Date.now() + extracted.postponeDays * 86_400_000).toISOString().split('T')[0]
      : null);

  if (!newDate) {
    await sendMessage(chatId, '❓ What date should I reschedule this task to?', env);
    return;
  }

  // Perform the reschedule
  await d1.rescheduleTask(task.id, newDate);

  await sendMessage(
    chatId,
    `✅ <b>${escapeHtml(task.name)}</b> rescheduled to <b>${newDate}</b>.`,
    env,
  );
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
