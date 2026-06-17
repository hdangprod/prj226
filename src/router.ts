import { sendMessage, editMessageText, answerCallbackQuery, escapeMarkdown } from './telegram/client';
import {
  addTaskFromText,
  rolloverTask,
  rescueTask,
  completeTask,
  getTaskById,
  viewTodayTasks,
  getTodayTaskPages,
  planWeekDraft,
  bulkCreateTasks,
} from './services/taskService';
import type { PlannedTask } from './services/taskService';
import { updateHighlight } from './services/highlightService';
import { generateWeeklyReport } from './services/reportService';
import { getOrCreateDailyLog, queryTasksByProject } from './notion/client';
import { saveDraft, loadDraft, deleteDraft } from './services/stateManager';

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

// ─── Helpers ───

function notionDeepLink(pageId: string): string {
  return `notion://notion.so/${pageId.replace(/-/g, '')}`;
}

function newDraftId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function formatPlanPreview(drafts: PlannedTask[]): string {
  const lines: string[] = [`🗓 <b>Weekly Plan Preview</b> (${drafts.length} tasks)\n`];
  drafts.forEach((d, i) => {
    lines.push(
      `<b>${i + 1}. ${escapeMarkdown(d.prefixedName)}</b>\n` +
        `   Priority: ${d.task.priority} | Est: ${d.task.estimate}h | Due: ${d.task.dueDate}` +
        (!d.projectId ? `\n   ⚠️ Project not found — will be created unlinked` : '') +
        (d.task.checklist.length
          ? `\n   • ${d.task.checklist.map(escapeMarkdown).join('\n   • ')}`
          : '')
    );
  });
  return lines.join('\n');
}

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function getTomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ─── Main Router ───

export async function handleUpdate(body: unknown): Promise<void> {
  const update = body as TelegramUpdate;

  // ── Callback Queries (inline button presses) ──
  if (update.callback_query) {
    const { data, message, id: callbackId } = update.callback_query;
    const chatId = message.chat.id;
    const [action, taskId] = data.split(':');

    try {
      if (action === 'complete') {
        await completeTask(taskId);
        await answerCallbackQuery(callbackId, 'Task marked as Done!');
        await editMessageText(chatId, message.message_id, '✅ Task marked as Done!');

      } else if (action === 'defer') {
        const task = await getTaskById(taskId);
        const newId = await rolloverTask(task, getTomorrowStr());
        await answerCallbackQuery(callbackId, 'Deferred!');
        const deepLink = notionDeepLink(newId);
        await editMessageText(
          chatId,
          message.message_id,
          `⏳ Task deferred. Rollover created for tomorrow.`,
          {
            inline_keyboard: [[{ text: '📂 Mở Rollover Task', url: deepLink }]],
          }
        );

      } else if (action === 'plan_confirm') {
        const drafts = await loadDraft(taskId);
        if (!drafts) {
          await answerCallbackQuery(callbackId, 'This plan has expired or was already created.');
          return;
        }
        await deleteDraft(taskId);
        await answerCallbackQuery(callbackId, 'Creating tasks...');

        const dailyLog = await getOrCreateDailyLog(getTodayStr());
        const result = await bulkCreateTasks(drafts, dailyLog.id);

        const linkList = result.taskIds
          .map((id, i) => `${i + 1}. <a href="${notionDeepLink(id)}">Open in Notion</a>`)
          .join('\n');

        await editMessageText(
          chatId,
          message.message_id,
          `✅ Created ${result.createdCount}/${drafts.length} tasks!\n\n${linkList}`,
          {
            inline_keyboard: result.taskIds.slice(0, 3).map((id, i) => [
              { text: `📂 Task ${i + 1}`, url: notionDeepLink(id) },
            ]),
          }
        );

      } else if (action === 'plan_edit') {
        await deleteDraft(taskId);
        await answerCallbackQuery(callbackId);
        await editMessageText(
          chatId,
          message.message_id,
          `✏️ Plan discarded. Send <code>/plan_week &lt;your revised plan&gt;</code> to try again.`
        );

      } else if (action === 'plan_cancel') {
        await deleteDraft(taskId);
        await answerCallbackQuery(callbackId, 'Cancelled.');
        await editMessageText(chatId, message.message_id, '❌ Plan cancelled. Nothing was created.');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[Router CB] Error:', errMsg);
    }
    return;
  }

  // ── Text Messages ──
  const msg = update.message;
  if (!msg?.text) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const today = getTodayStr();

  try {
    // /start
    if (text.startsWith('/start')) {
      await sendMessage(
        chatId,
        `Chào Sếp! Tôi là Liam, trợ lý Second Brain của Sếp. 🧠\n\nCác lệnh:\n• <code>/add_task &lt;text&gt;</code> — Tạo task\n• <code>/view_task</code> — Task hôm nay\n• <code>/rescue</code> — Tìm task cứu vãn tập trung\n• <code>/highlight &lt;text&gt;</code> — Ghi nhận thành tựu\n• <code>/plan_week &lt;text&gt;</code> — Lập kế hoạch tuần\n• <code>/weekly_report</code> — Báo cáo tuần`
      );

    // /add_task
    } else if (text.startsWith('/add_task')) {
      const input = text.replace('/add_task', '').trim();
      if (!input) {
        await sendMessage(chatId, '⚠️ Vui lòng nhập nội dung task. Ví dụ: <code>/add_task Thiết kế UI cho PRJ226, High, 2h</code>');
        return;
      }
      const dailyLog = await getOrCreateDailyLog(today);
      const pageId = await addTaskFromText(input, today, undefined, dailyLog.id);
      const deepLink = notionDeepLink(pageId);
      await sendMessage(chatId, `✅ Task created!`, {
        inline_keyboard: [[{ text: '📂 Mở trong Notion', url: deepLink }]],
      });

    // /view_task
    } else if (text.startsWith('/view_task') || text.startsWith('/tasks')) {
      const tasks = await getTodayTaskPages(today);
      if (tasks.length === 0) {
        await sendMessage(chatId, '🎉 Hôm nay không còn task chưa hoàn thành!');
      } else {
        for (const t of tasks) {
          let projectInfo = '';
          if (t.projectId) {
            const progress = await queryTasksByProject(t.projectId);
            const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
            projectInfo = ` (Tiến độ: ${pct}%)`;
          }
          const msg = `<b>${escapeMarkdown(t.name)}</b>\nPriority: ${t.priority} | Est: ${t.estimate}h${projectInfo}`;
          await sendMessage(chatId, msg, {
            inline_keyboard: [
              [
                { text: '✅ Complete', callback_data: `complete:${t.id}` },
                { text: '⏳ Defer', callback_data: `defer:${t.id}` },
              ],
            ],
          });
        }
      }

    // /rescue
    } else if (text.startsWith('/rescue')) {
      const rescued = await rescueTask();
      if (!rescued) {
        await sendMessage(chatId, '💡 Không tìm thấy task High Priority ≤ 30 phút. Hãy xem <code>/view_task</code>!');
      } else {
        const deepLink = notionDeepLink(rescued.id);
        await sendMessage(
          chatId,
          `⚡ <b>FOCUS RESCUE</b> ⚡\n\n<b>${escapeMarkdown(rescued.name)}</b>\nPriority: High | Est: ${rescued.estimate}h\n\n👉 Bắt đầu ngay 25 phút Pomodoro!`,
          {
            inline_keyboard: [
              [
                { text: '✅ Complete', callback_data: `complete:${rescued.id}` },
                { text: '⏳ Defer', callback_data: `defer:${rescued.id}` },
              ],
              [{ text: '📂 Mở trong Notion', url: deepLink }],
            ],
          }
        );
      }

    // /highlight
    } else if (text.startsWith('/highlight')) {
      const input = text.replace('/highlight', '').trim();
      if (!input) {
        await sendMessage(chatId, '⚠️ Vui lòng nhập nội dung. Ví dụ: <code>/highlight Đóng gói thành công tính năng chatbot</code>');
        return;
      }
      await updateHighlight(input, today);
      await sendMessage(chatId, '📝 Daily Log highlight updated!');

    // /plan_week
    } else if (text.startsWith('/plan_week')) {
      const input = text.replace('/plan_week', '').trim();
      if (!input) {
        await sendMessage(
          chatId,
          'Usage: <code>/plan_week &lt;describe your week&gt;</code>'
        );
      } else {
        await sendMessage(chatId, '⏳ Analyzing your weekly plan...');
        const drafts = await planWeekDraft(input, today);
        if (drafts.length === 0) {
          await sendMessage(chatId, '🤔 Không thể bóc tách được task nào. Hãy thử mô tả chi tiết hơn.');
        } else {
          const draftId = newDraftId();
          await saveDraft(draftId, drafts);
          await sendMessage(chatId, formatPlanPreview(drafts), {
            inline_keyboard: [
              [
                { text: '✅ Tạo tất cả', callback_data: `plan_confirm:${draftId}` },
                { text: '✏️ Sửa', callback_data: `plan_edit:${draftId}` },
                { text: '❌ Hủy', callback_data: `plan_cancel:${draftId}` },
              ],
            ],
          });
        }
      }

    // /weekly_report
    } else if (text.startsWith('/weekly_report') || text.startsWith('/retro')) {
      await sendMessage(chatId, '⏳ Liam đang tổng hợp chỉ số hiệu suất tuần...');
      const report = await generateWeeklyReport();
      await sendMessage(chatId, report);

    // Unknown command
    } else {
      await sendMessage(
        chatId,
        'Unknown command. Available:\n/add_task /view_task /rescue /highlight /plan_week /weekly_report'
      );
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[Router] Error:', errMsg);
    await sendMessage(chatId, `❌ Something went wrong: ${escapeMarkdown(errMsg)}`);
  }
}
