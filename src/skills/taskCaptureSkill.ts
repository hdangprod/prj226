/**
 * PRJ226 v3.0: Task Capture Skill
 * Intent: Task_Capture
 *
 * Parses natural language task from user message, creates task in Neon DB.
 * Battle-tested logic ported from v2.0 taskCaptureSkill.
 */

import { z } from 'zod';
import type { SkillContext } from '../governance/intentRouter';
import { D1Client } from '../tools/d1Client';
import { LLMRouter } from '../router/llmRouter';
import { sendMessage, sendMessageWithKeyboard } from '../tools/telegramClient';

const TaskSchema = z.object({
  name: z.string(),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  estimate_hours: z.number().optional(),
  scheduled_date: z.string().optional(), // ISO date string YYYY-MM-DD
  description: z.string().optional(),
});

export async function handleTaskCapture(ctx: SkillContext): Promise<void> {
  const { chatId, userText, env } = ctx;
  const d1 = new D1Client(env);
  const llm = new LLMRouter(env);

  await sendMessage(chatId, '✍️ <i>Capturing your task...</i>', env);

  const today = new Date().toISOString().split('T')[0];

  const extracted = await llm.callFastStructured(
    `Extract task details from: "${userText}"\nToday is ${today}.`,
    TaskSchema,
    `You are a task extraction assistant. Parse the user message and extract: task name, priority (high/medium/low), estimated hours (decimal), scheduled date (YYYY-MM-DD), and optional description. Default priority is medium. Return JSON.`,
  );

  // Save to D1 using the public createTask method
  const taskId = await d1.createTask({
    name: extracted.name,
    priority: extracted.priority ?? 'medium',
    estimate_hours: extracted.estimate_hours ?? null,
    scheduled_date: extracted.scheduled_date ?? null,
    description: extracted.description ?? null,
  });

  const priority = extracted.priority ?? 'medium';
  const priorityEmoji = { high: '🔴', medium: '🟡', low: '🟢' }[priority] ?? '⚫';

  const timePart = new Date().toTimeString().split(' ')[0].replace(/:/g, '');
  const url = `obsidian://new?vault=hdangprod_wiki&file=inbox/${today}/${timePart}&content=${encodeURIComponent(userText)}`;
  
  await sendMessageWithKeyboard(
    chatId,
    `✅ <b>Task captured!</b>\n\n${priorityEmoji} <b>${extracted.name}</b>${priority !== 'medium' ? ` [${priority.toUpperCase()}]` : ''}${extracted.estimate_hours ? `\n⏱ Estimate: ${extracted.estimate_hours}h` : ''}${extracted.scheduled_date ? `\n📅 Scheduled: ${extracted.scheduled_date}` : ''}\n<i>ID: ${taskId.substring(0, 8)}...</i>`,
    {
      inline_keyboard: [[{ text: '📝 Open in Obsidian', url }]]
    },
    env,
  );
}
