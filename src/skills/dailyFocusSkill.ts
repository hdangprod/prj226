/**
 * PRJ226 v3.0: Daily Focus Skill
 * Intent: Daily_Focus
 *
 * Fetches actionable tasks (dependency-cleared) + latest working memory,
 * asks Gemini to synthesize a structured daily briefing, and sends to Telegram.
 */

import type { SkillContext } from '../governance/intentRouter';
import { D1Client } from '../tools/d1Client';
import { LLMRouter } from '../router/llmRouter';
import { sendMessage } from '../tools/telegramClient';

import { batchCommitCaptures } from '../tools/gitBatchClient';
import { getLocalDate } from '../lib/dateUtils';

export async function handleDailyFocus(ctx: SkillContext): Promise<void> {
  const { chatId, env } = ctx;
  const d1 = new D1Client(env);
  const llm = new LLMRouter(env);

  // Update status message
  await sendMessage(chatId, '🔍 <i>Reviewing your tasks and working memory...</i>', env);

  // Fetch data in parallel
  const [tasks, memory] = await Promise.all([
    d1.getActionableTasks(10),
    d1.getLatestWorkingMemory(),
  ]);

  if (tasks.length === 0) {
    await sendMessage(
      chatId,
      '✅ <b>All clear!</b> No pending tasks found. Great job staying on top of things!',
      env,
    );
    return;
  }

  // 1. Format task list deterministically from database data (100% consistent exact names, estimates & emojis)
  const formattedTaskList = tasks
    .map((t) => {
      const pEmoji = { high: '🔴', medium: '🟡', low: '🟢' }[t.priority] ?? '⚪️';
      const timePart = t.estimate_hours ? ` (~${t.estimate_hours}h)` : '';
      const datePart = t.scheduled_date ? ` — due ${t.scheduled_date}` : '';
      const nameClean = t.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `• ${pEmoji} <b>${nameClean}</b>${timePart}${datePart}`;
    })
    .join('\n');

  // 2. Request AI recommendation & motivational line only
  const rawTaskListForLLM = tasks
    .map((t, i) => `${i + 1}. [${t.priority.toUpperCase()}] ${t.name}`)
    .join('\n');

  const memoryContext = memory
    ? `Last session:
- Last action: ${memory.last_action ?? 'N/A'}
- Was working on: ${memory.doing ?? 'N/A'}
- Next planned: ${memory.next_action ?? 'N/A'}`
    : 'No previous session data available.';

  const prompt = `You are Liam, an AI second brain assistant. Based on the user's tasks:
${rawTaskListForLLM}

${memoryContext}

Provide:
1. "Today's Focus": One single sentence recommending what to prioritize.
2. "Motivation": One short motivational sentence.

Output format exactly:
FOCUS: <one sentence>
MOTIVATION: <one sentence>`;

  let focusLine = "Prioritize your highest priority task to build momentum.";
  let motivationLine = "Consistency is the bridge between goals and accomplishment.";

  try {
    const aiRes = await llm.callFast(prompt);
    const focusMatch = aiRes.match(/FOCUS:\s*(.+)/i);
    const motMatch = aiRes.match(/MOTIVATION:\s*(.+)/i);
    if (focusMatch?.[1]) focusLine = focusMatch[1].trim();
    if (motMatch?.[1]) motivationLine = motMatch[1].trim();
  } catch (err) {
    console.warn('[Daily Focus AI Synthesis Warning]:', err);
  }

  // 3. Assemble exact deterministic briefing
  const { dateStr: today } = getLocalDate();
  const obsidianUrl = `obsidian://open?vault=hdangprod_wiki&file=${encodeURIComponent(`tasks/${today}`)}`;

  const finalBriefing = `🌅 <b>Daily Briefing</b>\n\n<b>Today's Focus:</b> ${focusLine.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}\n\n<b>Actionable Tasks:</b>\n${formattedTaskList}\n\n<i>${motivationLine.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</i>\n\n📅 <a href="${obsidianUrl}">View Daily Tasks Snapshot in Obsidian</a>`;

  await sendMessage(chatId, finalBriefing, env);

  // 2. Save daily task snapshot to D1 pending_captures so it syncs to GitHub tasks/YYYY-MM-DD.md
  try {
    const snapshotMd = generateDailyTaskMarkdownSnapshot(tasks);
    const filePath = `tasks/${today}.md`;
    await d1.createCapture(snapshotMd, filePath);

    // If Dev mode, flush immediately to GitHub
    if (env.GITHUB_REPO?.endsWith('_dev')) {
      const pending = await d1.getPendingCaptures(50);
      if (pending.length > 0) {
        await batchCommitCaptures(pending, env);
        await d1.markCapturesFlushed(pending.map((c) => c.id));
        console.log(`[Daily Focus] Immediately synced daily task snapshot ${filePath} to GitHub!`);
      }
    }
  } catch (syncErr) {
    console.error('[Daily Focus Snapshot Error]:', syncErr);
  }
}

export function generateDailyTaskMarkdownSnapshot(
  tasks: Array<{ id: string; name: string; status: string; priority: string; scheduled_date?: string | null }>
): string {
  const dateStr = new Date().toISOString().split('T')[0];

  const header = `---
type: task_snapshot
generated_at: ${new Date().toISOString()}
read_only: true
---
> [!WARNING]
> **READ-ONLY AUTOMATED SNAPSHOT**
> Edits made directly to this Markdown file inside Obsidian **will not** sync back to Cloudflare D1. 
> To manage tasks, use Telegram bot commands (\`/task\`, \`/done\`).

# 📅 Daily Task Summary (${dateStr})

`;

  const taskLines = tasks.map((t) => {
    const check = t.status === 'completed' || t.status === 'done' ? 'x' : ' ';
    return `- [${check}] **[${t.priority.toUpperCase()}]** ${t.name} \`id:${t.id}\``;
  }).join('\n');

  return header + (taskLines || '*No active tasks found.*') + '\n';
}
