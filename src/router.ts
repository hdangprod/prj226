import { sendMessage, editMessageText, answerCallbackQuery, escapeHtml } from './telegram/client';
import { BOT_MESSAGES } from './constants/messages';
import {
  rolloverTask,
  rescueTask,
  completeTask,
  getTaskById,
  getTodayTaskPages,
  bulkCreateTasks,
} from './services/taskService';
import { WeeklyPlanningSkill, type PlannedTask } from './skills/WeeklyPlanningSkill';
import { updateHighlight } from './services/highlightService';
import { generateWeeklyReport } from './services/reportService';
import { 
  getOrCreateDailyLog, 
  queryTasksByProject, 
  fetchActiveProjects, 
  fetchAreas,
  createProject, 
  createTask 
} from './notion/client';
import { saveDraft, loadDraft, deleteDraft, saveSession, loadSession, deleteSession } from './services/stateManager';
import { parseTaskInput } from './gemini/client';

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
  return `https://notion.so/${pageId.replace(/-/g, '')}`;
}


function formatPlanPreview(drafts: PlannedTask[]): string {
  const lines: string[] = [`🗓 <b>Weekly Plan Preview</b> (${drafts.length} tasks)\n`];
  drafts.forEach((d, i) => {
    lines.push(
      `<b>${i + 1}. ${escapeHtml(d.prefixedName)}</b>\n` +
        `   Priority: ${d.task.priority} | Est: ${d.task.estimate}h | Due: ${d.task.dueDate}` +
        (!d.projectId ? `\n   ⚠️ Project not found — will be created unlinked` : '') +
        (d.task.checklist.length
          ? `\n   • ${d.task.checklist.map(escapeHtml).join('\n   • ')}`
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
    
    // Some actions have an id after the colon, e.g., 'complete:123'
    // For addtask_proj, it's 'addtask_proj:projId'
    const colonIndex = data.indexOf(':');
    let action = data;
    let payloadStr = '';
    if (colonIndex !== -1) {
      action = data.substring(0, colonIndex);
      payloadStr = data.substring(colonIndex + 1);
    }

    try {
      if (action === 'complete') {
        await completeTask(payloadStr);
        await answerCallbackQuery(callbackId, BOT_MESSAGES.SUCCESS.TASK_DONE);
        await editMessageText(chatId, message.message_id, BOT_MESSAGES.SUCCESS.TASK_DONE);

      } else if (action === 'defer') {
        const session = await loadSession(chatId) || { state: 'AWAITING_DEFER_TIME' as const };
        session.state = 'AWAITING_DEFER_TIME';
        session.pendingTaskId = payloadStr;
        await saveSession(chatId, session);

        await answerCallbackQuery(callbackId);
        await editMessageText(
          chatId,
          message.message_id,
          BOT_MESSAGES.PROMPTS.ASK_DEFER_TIME
        );

      } else if (action === 'plan_confirm') {
        const drafts = await loadDraft(payloadStr);
        if (!drafts) {
          await answerCallbackQuery(callbackId, BOT_MESSAGES.ERRORS.PLAN_EXPIRED);
          return;
        }
        await deleteDraft(payloadStr);
        await answerCallbackQuery(callbackId, BOT_MESSAGES.PROMPTS.CREATING_TASKS);

        const dailyLog = await getOrCreateDailyLog(getTodayStr());
        const result = await bulkCreateTasks(drafts, dailyLog.id);

        const linkList = result.taskIds
          .map((id, i) => `${i + 1}. <a href="${notionDeepLink(id)}">${BOT_MESSAGES.BUTTONS.OPEN_IN_NOTION}</a>`)
          .join('\n');

        await editMessageText(
          chatId,
          message.message_id,
          `${BOT_MESSAGES.SUCCESS.PLAN_CREATED(result.createdCount, drafts.length)}\n\n${linkList}`,
          {
            inline_keyboard: result.taskIds.slice(0, 3).map((id, i) => [
              { text: BOT_MESSAGES.BUTTONS.OPEN_TASK(i + 1), url: notionDeepLink(id) },
            ]),
          }
        );

      } else if (action === 'plan_edit') {
        await deleteDraft(payloadStr);
        await answerCallbackQuery(callbackId);
        await editMessageText(
          chatId,
          message.message_id,
          BOT_MESSAGES.ERRORS.PLAN_EDIT_DISCARDED
        );

      } else if (action === 'plan_cancel') {
        await deleteDraft(payloadStr);
        await answerCallbackQuery(callbackId, BOT_MESSAGES.BUTTONS.CANCELLED);
        await editMessageText(chatId, message.message_id, BOT_MESSAGES.ERRORS.PLAN_CANCELLED);
      
      } else if (action === 'addtask_proj') {
        // payloadStr = projectId
        const session = await loadSession(chatId);
        if (!session || session.state !== 'AWAITING_PROJECT_SELECTION') {
          await answerCallbackQuery(callbackId, BOT_MESSAGES.ERRORS.SESSION_EXPIRED);
          return;
        }
        await answerCallbackQuery(callbackId, BOT_MESSAGES.PROMPTS.CREATING_TASK_SINGLE);
        await deleteSession(chatId);

        const dailyLog = await getOrCreateDailyLog(getTodayStr());
        // Use the selected project's name as task prefix if it was not in taskInput (or even if it was, override for consistency?)
        // The project name isn't directly in the callback payload, but createTask doesn't STRICTLY need task.projectName
        // Wait, createTask uses task.projectName for prefix.
        // We will just create the task with the selected project ID.
        // If task.projectName is missing, createTask won't add prefix. Let's fix that in createTask later to fetch project name if missing.
        const taskId = await createTask(session.taskInput!, payloadStr, dailyLog.id);
        const deepLink = notionDeepLink(taskId);

        await editMessageText(
          chatId,
          message.message_id,
          BOT_MESSAGES.SUCCESS.TASK_CREATED,
          { inline_keyboard: [[{ text: BOT_MESSAGES.BUTTONS.OPEN_IN_NOTION, url: deepLink }]] }
        );

      } else if (action === 'addtask_newproj') {
        const session = await loadSession(chatId);
        if (!session || session.state !== 'AWAITING_PROJECT_SELECTION') {
          await answerCallbackQuery(callbackId, BOT_MESSAGES.ERRORS.SESSION_EXPIRED);
          return;
        }
        await answerCallbackQuery(callbackId);
        
        session.state = 'AWAITING_PROJECT_NAME';
        await saveSession(chatId, session);

        await editMessageText(
          chatId,
          message.message_id,
          BOT_MESSAGES.PROMPTS.ENTER_PROJECT_NAME
        );

      } else if (action === 'addtask_area') {
        // payloadStr = areaId
        const session = await loadSession(chatId);
        if (!session || session.state !== 'AWAITING_AREA_SELECTION' || !session.pendingProjectName) {
          await answerCallbackQuery(callbackId, BOT_MESSAGES.ERRORS.SESSION_EXPIRED);
          return;
        }
        await answerCallbackQuery(callbackId, BOT_MESSAGES.PROMPTS.PROJECT_INIT);

        // Retrieve the area name for the success message
        const areas = await fetchAreas();
        const selectedArea = areas.find(a => a.id === payloadStr);
        const areaName = selectedArea ? selectedArea.name : 'Unknown';

        const newProj = await createProject(session.pendingProjectName!, payloadStr);
        session.taskInput!.projectName = newProj.name;
        const dailyLog = await getOrCreateDailyLog(getTodayStr());
        const taskId = await createTask(session.taskInput!, newProj.id, dailyLog.id);
        const deepLink = notionDeepLink(taskId);

        await deleteSession(chatId);

        try {
          // Try to remove keyboard from previous message
          await editMessageText(chatId, message.message_id, BOT_MESSAGES.PROMPTS.CHOOSE_AREA(escapeHtml(newProj.name)));
        } catch (e) {
          console.error('Failed to remove inline keyboard:', e);
        }

        // Send success as a new message
        await sendMessage(
          chatId,
          BOT_MESSAGES.SUCCESS.TASK_CREATED_FULL(escapeHtml(newProj.name), escapeHtml(areaName)),
          { inline_keyboard: [[{ text: BOT_MESSAGES.BUTTONS.OPEN_IN_NOTION, url: deepLink }]] }
        );
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[Router CB] Error:', errMsg);
      try {
        await sendMessage(chatId, BOT_MESSAGES.ERRORS.SOMETHING_WENT_WRONG(escapeHtml(errMsg)));
      } catch { /* best-effort error reporting */ }
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
    // Check conversational state first
    const session = await loadSession(chatId);

    // Handle AWAITING_DEFER_TIME
    if (session && session.state === 'AWAITING_DEFER_TIME' && session.pendingTaskId) {
      if (text.startsWith('/')) {
        await deleteSession(chatId);
        await sendMessage(chatId, BOT_MESSAGES.ERRORS.PLAN_CANCELLED_NEW_COMMAND);
        // Continue processing the command
      } else {
        let spentHours: number | undefined;
        if (text.toLowerCase() !== 'skip') {
          spentHours = parseFloat(text);
          if (isNaN(spentHours)) {
            await sendMessage(chatId, BOT_MESSAGES.ERRORS.INVALID_NUMBER);
            return;
          }
        }
        
        await sendMessage(chatId, BOT_MESSAGES.PROMPTS.ROLLING_OVER_TASK);
        const task = await getTaskById(session.pendingTaskId);
        const newId = await rolloverTask(task, getTomorrowStr(), spentHours);
        const deepLink = notionDeepLink(newId);
        
        await deleteSession(chatId);
        await sendMessage(
          chatId,
          BOT_MESSAGES.SUCCESS.TASK_DEFERRED,
          {
            inline_keyboard: [[{ text: BOT_MESSAGES.BUTTONS.OPEN_ROLLOVER, url: deepLink }]],
          }
        );
        return;
      }
    }

    // Handle AWAITING_AREA_SELECTION — abort if user types a command
    if (session && session.state === 'AWAITING_AREA_SELECTION') {
      if (text.startsWith('/')) {
        await deleteSession(chatId);
        await sendMessage(chatId, BOT_MESSAGES.ERRORS.PLAN_CANCELLED_NEW_COMMAND);
      } else {
        // Try to match area name from user text
        const areas = await fetchAreas();
        const matchedArea = areas.find(a => a.name.toLowerCase() === text.toLowerCase());
        if (matchedArea) {
          // Execute same logic as callback
          const newProj = await createProject(session.pendingProjectName!, matchedArea.id);
          session.taskInput!.projectName = newProj.name;
          await saveSession(chatId, session);

          await sendMessage(chatId, BOT_MESSAGES.PROMPTS.PROJECT_INIT);
          
          const dailyLog = await getOrCreateDailyLog(today);
          const taskId = await createTask(session.taskInput!, newProj.id, dailyLog.id);
          const deepLink = notionDeepLink(taskId);

          await deleteSession(chatId);

          await sendMessage(
            chatId,
            BOT_MESSAGES.SUCCESS.TASK_CREATED_FULL(escapeHtml(newProj.name), escapeHtml(matchedArea.name)),
            { inline_keyboard: [[{ text: BOT_MESSAGES.BUTTONS.OPEN_IN_NOTION, url: deepLink }]] }
          );
        } else {
          // Send a hint message
          await sendMessage(
            chatId,
            `Vui lòng click vào các nút ở trên hoặc gõ chính xác tên Area (ví dụ: Finance, Workplace) để tiếp tục.`
          );
        }
        return;
      }
    }

    // Handle AWAITING_PROJECT_NAME — user types project name
    if (session && session.state === 'AWAITING_PROJECT_NAME') {
      if (text.startsWith('/')) {
        // Abort session if user types a command
        await deleteSession(chatId);
        await sendMessage(chatId, BOT_MESSAGES.ERRORS.PLAN_CANCELLED_NEW_COMMAND);
      } else {
        const projectName = text;
        const areas = await fetchAreas();

        // Save project name and transition to area selection
        session.state = 'AWAITING_AREA_SELECTION';
        session.pendingProjectName = projectName;
        await saveSession(chatId, session);

        // Build inline keyboard for areas
        const keyboard: any[][] = [];
        for (const area of areas) {
          keyboard.push([{ text: `🏷 ${area.name}`, callback_data: `addtask_area:${area.id}` }]);
        }

        await sendMessage(
          chatId,
          BOT_MESSAGES.PROMPTS.CHOOSE_AREA(escapeHtml(projectName)),
          { inline_keyboard: keyboard }
        );
        return;
      }
    }

    // /start
    if (text.startsWith('/start')) {
      await sendMessage(
        chatId,
        BOT_MESSAGES.GREETINGS.WELCOME
      );

    // /add_task
    } else if (text.startsWith('/add_task')) {
      const input = text.replace('/add_task', '').trim();
      if (!input) {
        await sendMessage(chatId, BOT_MESSAGES.ERRORS.INPUT_REQUIRED_ADD_TASK);
        return;
      }
      
      await sendMessage(chatId, BOT_MESSAGES.PROMPTS.ANALYZING_TASK);
      const parsedTask = await parseTaskInput(input, today);
      const activeProjects = await fetchActiveProjects();

      if (activeProjects.length > 0) {
        await saveSession(chatId, { state: 'AWAITING_PROJECT_SELECTION', taskInput: parsedTask });
        
        // Build inline keyboard for projects
        const keyboard: any[][] = [];
        for (const proj of activeProjects) {
          keyboard.push([{ text: `📁 ${proj.name}`, callback_data: `addtask_proj:${proj.id}` }]);
        }
        keyboard.push([{ text: '➕ Tạo Project mới', callback_data: `addtask_newproj` }]);

        await sendMessage(
          chatId,
          BOT_MESSAGES.SUCCESS.TASK_ANALYZED(escapeHtml(parsedTask.name)) + '\n' + BOT_MESSAGES.PROMPTS.CHOOSE_PROJECT,
          { inline_keyboard: keyboard }
        );
      } else {
        await saveSession(chatId, { state: 'AWAITING_PROJECT_NAME', taskInput: parsedTask });
        await sendMessage(
          chatId,
          BOT_MESSAGES.SUCCESS.TASK_ANALYZED(escapeHtml(parsedTask.name)) + '\n' + BOT_MESSAGES.PROMPTS.NO_PROJECT_PROMPT
        );
      }

    // /view_task
    } else if (text.startsWith('/view_task') || text.startsWith('/tasks')) {
      const tasks = await getTodayTaskPages(today);
      if (tasks.length === 0) {
        await sendMessage(chatId, BOT_MESSAGES.SUCCESS.NO_PENDING_TASKS);
      } else {
        for (const t of tasks) {
          let projectInfo = '';
          if (t.projectId) {
            const progress = await queryTasksByProject(t.projectId);
            const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
            projectInfo = ` (Tiến độ: ${pct}%)`;
          }
          const msg = `<b>${escapeHtml(t.name)}</b>\nPriority: ${t.priority} | Est: ${t.estimate}h${projectInfo}`;
          await sendMessage(chatId, msg, {
            inline_keyboard: [
              [
                { text: BOT_MESSAGES.BUTTONS.COMPLETE, callback_data: `complete:${t.id}` },
                { text: BOT_MESSAGES.BUTTONS.DEFER, callback_data: `defer:${t.id}` },
              ],
            ],
          });
        }
      }

    // /rescue
    } else if (text.startsWith('/rescue')) {
      const rescued = await rescueTask();
      if (!rescued) {
        await sendMessage(chatId, BOT_MESSAGES.ERRORS.NO_HIGH_PRIORITY_TASK);
      } else {
        const deepLink = notionDeepLink(rescued.id);
        await sendMessage(
          chatId,
          BOT_MESSAGES.PROMPTS.FOCUS_RESCUE_TITLE + `\n\n<b>${escapeHtml(rescued.name)}</b>\nPriority: High | Est: ${rescued.estimate}h\n\n` + BOT_MESSAGES.PROMPTS.FOCUS_RESCUE_FOOTER,
          {
            inline_keyboard: [
              [
                { text: BOT_MESSAGES.BUTTONS.COMPLETE, callback_data: `complete:${rescued.id}` },
                { text: BOT_MESSAGES.BUTTONS.DEFER, callback_data: `defer:${rescued.id}` },
              ],
              [{ text: BOT_MESSAGES.BUTTONS.OPEN_IN_NOTION, url: deepLink }],
            ],
          }
        );
      }

    // /highlight
    } else if (text.startsWith('/highlight')) {
      const input = text.replace('/highlight', '').trim();
      if (!input) {
        await sendMessage(chatId, BOT_MESSAGES.ERRORS.INPUT_REQUIRED_HIGHLIGHT);
        return;
      }
      await updateHighlight(input, today);
      await sendMessage(chatId, BOT_MESSAGES.SUCCESS.HIGHLIGHT_UPDATED);

    // /plan_week
    } else if (text.startsWith('/plan_week')) {
      const input = text.replace('/plan_week', '').trim();
      if (!input) {
        await sendMessage(
          chatId,
          BOT_MESSAGES.ERRORS.INPUT_REQUIRED_PLAN_WEEK
        );
      } else {
        await sendMessage(chatId, BOT_MESSAGES.PROMPTS.ANALYZING_WEEKLY_PLAN);
        
        const skill = new WeeklyPlanningSkill();
        const { draftId, drafts } = await skill.execute({ text: input, today });
        
        if (drafts.length === 0) {
          await sendMessage(chatId, BOT_MESSAGES.ERRORS.NO_TASK_FOUND);
        } else {
          await sendMessage(chatId, formatPlanPreview(drafts), {
            inline_keyboard: [
              [
                { text: BOT_MESSAGES.BUTTONS.CREATE_ALL, callback_data: `plan_confirm:${draftId}` },
                { text: BOT_MESSAGES.BUTTONS.EDIT, callback_data: `plan_edit:${draftId}` },
                { text: BOT_MESSAGES.BUTTONS.CANCEL, callback_data: `plan_cancel:${draftId}` },
              ],
            ],
          });
        }
      }

    // /weekly_report
    } else if (text.startsWith('/weekly_report') || text.startsWith('/retro')) {
      await sendMessage(chatId, BOT_MESSAGES.PROMPTS.ANALYZING_REPORT);
      const report = await generateWeeklyReport();
      await sendMessage(chatId, report);

    // Unknown command
    } else {
      await sendMessage(
        chatId,
        BOT_MESSAGES.ERRORS.UNKNOWN_COMMAND
      );
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[Router] Error:', errMsg);
    await sendMessage(chatId, BOT_MESSAGES.ERRORS.SOMETHING_WENT_WRONG(escapeHtml(errMsg)));
  }
}
