import { sendMessage, editMessageText, answerCallbackQuery } from './telegram/client';
import type { InlineKeyboardMarkup } from './telegram/client';
import {
  addTaskFromText,
  rolloverTask,
  rescueTask,
  completeTask,
  getTaskById,
  viewTodayTasks,
  planWeekDraft,
  bulkCreateTasks,
} from './services/taskService';
import type { PlannedTask } from './services/taskService';
import { updateHighlight } from './services/highlightService';
import { generateWeeklyReport } from './services/reportService';
import { getOrCreateDailyLog } from './notion/client';
import type { WeeklyReport } from './services/reportService';

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
    message_id: number;
  };
  callback_query?: {
    id: string;
    message: { chat: { id: number }; message_id: number };
    data: string;
  };
}

/**
 * FR-7: In-memory store of pending /plan_week drafts, keyed by a short draft id.
 * Ensures bulk creation only happens on confirm, and repeated button presses
 * are idempotent (the draft is deleted once consumed).
 */
const planDrafts = new Map<string, PlannedTask[]>();

function newDraftId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function formatPlanPreview(drafts: PlannedTask[]): string {
  const lines: string[] = [`🗓 *Weekly Plan Preview* (${drafts.length} tasks)\n`];
  drafts.forEach((d, i) => {
    lines.push(
      `*${i + 1}. ${d.prefixedName}*\n` +
        `   Priority: ${d.task.priority} | Est: ${d.task.estimate}h | Due: ${d.task.dueDate}` +
        (d.projectId ? '' : `\n   ⚠️ Project not found — will be created unlinked`) +
        (d.task.checklist.length
          ? `\n   • ${d.task.checklist.join('\n   • ')}`
          : '')
    );
  });
  return lines.join('\n');
}

function planKeyboard(draftId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✅ Tạo tất cả', callback_data: `plan_confirm:${draftId}` },
        { text: '✏️ Sửa', callback_data: `plan_edit:${draftId}` },
        { text: '❌ Hủy', callback_data: `plan_cancel:${draftId}` },
      ],
    ],
  };
}

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function getTomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function getWeekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay()); // Sunday
  return d.toISOString().slice(0, 10);
}

function formatWeeklyReport(r: WeeklyReport): string {
  return [
    `📊 *Weekly Retrospective* (${r.weekStart} → ${r.weekEnd})`,
    ``,
    `📌 Total Tasks: ${r.totalTasks}`,
    `✅ Completed: ${r.completedTasks}`,
    `⏳ Deferred/Rollover: ${r.deferredTasks}`,
    ``,
    `📉 Slippage Rate: ${r.slippageRate}%`,
    `⚡ Velocity Score: ${r.velocityScore}h`,
    ``,
    `🔬 Discovery: ${r.discoveryPercent}%`,
    `🚀 Delivery: ${r.deliveryPercent}%`,
  ].join('\n');
}

export async function handleUpdate(body: unknown): Promise<void> {
  const update = body as TelegramUpdate;

  // Handle inline button callback queries
  if (update.callback_query) {
    const { data, message, id: callbackId } = update.callback_query;
    const chatId = message.chat.id;
    const [action, taskId] = data.split(':');

    if (action === 'complete') {
      await completeTask(taskId);
      await sendMessage(chatId, `✅ Task marked as Done!`);
    } else if (action === 'defer') {
      const task = await getTaskById(taskId);
      const newId = await rolloverTask(task, getTomorrowStr());
      await sendMessage(chatId, `⏳ Task deferred. Rollover created for tomorrow (ID: \`${newId}\`).`);
    } else if (action === 'plan_confirm') {
      const drafts = planDrafts.get(taskId);
      if (!drafts) {
        await answerCallbackQuery(callbackId, 'This plan has expired or was already created.');
      } else {
        planDrafts.delete(taskId); // consume immediately for idempotency
        await answerCallbackQuery(callbackId, 'Creating tasks...');
        const dailyLog = await getOrCreateDailyLog(getTodayStr());
        const created = await bulkCreateTasks(drafts, dailyLog.id);
        await editMessageText(
          chatId,
          message.message_id,
          `✅ Created ${created}/${drafts.length} tasks in Notion.`
        );
      }
    } else if (action === 'plan_edit') {
      planDrafts.delete(taskId);
      await answerCallbackQuery(callbackId);
      await editMessageText(
        chatId,
        message.message_id,
        `✏️ Plan discarded. Send \`/plan_week <your revised plan>\` to try again.`
      );
    } else if (action === 'plan_cancel') {
      planDrafts.delete(taskId);
      await answerCallbackQuery(callbackId, 'Cancelled.');
      await editMessageText(chatId, message.message_id, `❌ Plan cancelled. Nothing was created.`);
    }
    return;
  }

  const msg = update.message;
  if (!msg?.text) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const today = getTodayStr();

  try {
    if (text.startsWith('/add_task')) {
      const input = text.replace('/add_task', '').trim();
      const dailyLog = await getOrCreateDailyLog(today);
      const pageId = await addTaskFromText(input, today, undefined, dailyLog.id);
      await sendMessage(chatId, `✅ Task created in Notion!\nPage ID: \`${pageId}\``);

    } else if (text.startsWith('/view_task')) {
      const taskList = await viewTodayTasks(today);
      await sendMessage(chatId, taskList);

    } else if (text.startsWith('/rescue')) {
      const rescued = await rescueTask();
      await sendMessage(chatId, rescued);

    } else if (text.startsWith('/highlight')) {
      const input = text.replace('/highlight', '').trim();
      await updateHighlight(input, today);
      await sendMessage(chatId, `📝 Daily Log highlight updated!`);

    } else if (text.startsWith('/plan_week')) {
      const input = text.replace('/plan_week', '').trim();
      if (!input) {
        await sendMessage(
          chatId,
          `Usage: \`/plan_week <describe your week>\`\nExample: /plan_week Tuần này tôi làm dự án học tiếng Anh: nghiên cứu người dùng, customer journey map, competitive analysis...`
        );
      } else {
        const drafts = await planWeekDraft(input, today);
        if (drafts.length === 0) {
          await sendMessage(chatId, `🤔 I couldn't extract any tasks. Try adding more detail.`);
        } else {
          const draftId = newDraftId();
          planDrafts.set(draftId, drafts);
          await sendMessage(chatId, formatPlanPreview(drafts), planKeyboard(draftId));
        }
      }

    } else if (text.startsWith('/weekly_report')) {
      const report = await generateWeeklyReport(getWeekStart(), today);
      await sendMessage(chatId, formatWeeklyReport(report));

    } else {
      await sendMessage(
        chatId,
        `Unknown command. Available:\n/add_task /view_task /rescue /highlight /plan_week /weekly_report`
      );
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[Router] Error:', errMsg);
    await sendMessage(chatId, `❌ Something went wrong: ${errMsg}`);
  }
}
