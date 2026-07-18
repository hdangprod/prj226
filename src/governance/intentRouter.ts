import { sendMessage, editMessageText, answerCallbackQuery, escapeHtml } from '../tools/telegramClient';
import { classifyIntent } from '../tools/geminiClient';
import { executeTaskCapture } from '../skills/taskCaptureSkill';
import { executeWeeklyPlanning, commitWeeklyDraft } from '../skills/weeklyPlanningSkill';
import { transcribeVoiceNote } from '../sensors/voiceProcessor';
import { requestHitlConfirmation } from './hitlManager';
import {
  saveSession,
  loadSession,
  deleteSession,
} from '../tools/firestoreClient';
import {
  fetchActiveProjects,
  fetchAreas,
  createProject,
  createTask,
  getOrCreateDailyLog,
} from '../tools/notionClient';
import { BOT_MESSAGES } from '../constants/messages';

function extractChatId(payload: any): number | string | undefined {
  if (payload?.message?.chat?.id) {
    return payload.message.chat.id;
  }
  if (payload?.callback_query?.message?.chat?.id) {
    return payload.callback_query.message.chat.id;
  }
  return undefined;
}

function notionDeepLink(pageId: string): string {
  return `https://notion.so/${pageId.replace(/-/g, '')}`;
}

function getTodayStr(): string {
  // Timezone +08:00
  const d = new Date(new Date().getTime() + 8 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function getCurrentIsoTime(): string {
  const d = new Date(new Date().getTime() + 8 * 60 * 60 * 1000);
  return d.toISOString().replace('Z', '+08:00');
}

/**
 * Executes a confirmed intent. Used both by auto-routing (high confidence)
 * and HITL confirmation callbacks.
 */
async function executeConfirmedIntent(
  chatId: number | string,
  text: string,
  intent: string,
): Promise<void> {
  if (intent === 'Add Task') {
    await sendMessage(chatId, BOT_MESSAGES.PROMPTS.ANALYZING_TASK);
    const captureResult = await executeTaskCapture(text, getCurrentIsoTime(), getTodayStr());

    if (captureResult.status === 'success' && captureResult.taskId) {
      const deepLink = notionDeepLink(captureResult.taskId);
      await sendMessage(
        chatId,
        BOT_MESSAGES.SUCCESS.TASK_CREATED,
        { inline_keyboard: [[{ text: BOT_MESSAGES.BUTTONS.OPEN_IN_NOTION, url: deepLink }]] }
      );
    } else if (captureResult.status === 'needs_project_selection' && captureResult.taskInput) {
      const activeProjects = await fetchActiveProjects();

      if (activeProjects.length > 0) {
        await saveSession(chatId, { state: 'AWAITING_PROJECT_SELECTION', taskInput: captureResult.taskInput });

        const keyboard: any[][] = [];
        for (const proj of activeProjects) {
          keyboard.push([{ text: `📁 ${proj.name}`, callback_data: `addtask_proj:${proj.id}` }]);
        }
        keyboard.push([{ text: '➕ Tạo Project mới', callback_data: 'addtask_newproj' }]);

        await sendMessage(
          chatId,
          BOT_MESSAGES.SUCCESS.TASK_ANALYZED(escapeHtml(captureResult.taskInput.name)) + '\n' + BOT_MESSAGES.PROMPTS.CHOOSE_PROJECT,
          { inline_keyboard: keyboard }
        );
      } else {
        await saveSession(chatId, { state: 'AWAITING_PROJECT_NAME', taskInput: captureResult.taskInput });
        await sendMessage(
          chatId,
          BOT_MESSAGES.SUCCESS.TASK_ANALYZED(escapeHtml(captureResult.taskInput.name)) + '\n' + BOT_MESSAGES.PROMPTS.NO_PROJECT_PROMPT
        );
      }
    }
  } else if (intent === 'Rescue') {
    // Stub: Will be implemented in future slices
    await sendMessage(chatId, '⚡ Tính năng Rescue sẽ được triển khai sớm!');
  } else if (intent === 'Highlight') {
    // Stub: Will be implemented in future slices
    await sendMessage(chatId, '📌 Tính năng Highlight sẽ được triển khai sớm!');
  } else if (intent === 'Weekly Planning') {
    await sendMessage(chatId, BOT_MESSAGES.PROMPTS.ANALYZING_WEEKLY_PLAN);
    try {
      await executeWeeklyPlanning(chatId, text, getCurrentIsoTime());
    } catch (error) {
      console.error('[Worker] Weekly Planning Error:', error);
      const errMsg = error instanceof Error ? error.message : String(error);
      await sendMessage(chatId, BOT_MESSAGES.ERRORS.SOMETHING_WENT_WRONG(escapeHtml(errMsg)));
    }
  } else {
    await sendMessage(chatId, BOT_MESSAGES.ERRORS.UNKNOWN_COMMAND);
  }
}

export async function handleWorkerPayload(payload: any): Promise<void> {
  const chatId = extractChatId(payload);
  if (!chatId) {
    console.error('[Worker] Chat ID could not be extracted from payload:', JSON.stringify(payload));
    return;
  }

  try {
    // ─── Case 1: Callback Queries (Inline Button Presses) ───
    if (payload.callback_query) {
      const { data, message, id: callbackId } = payload.callback_query;
      const colonIndex = data.indexOf(':');
      let action = data;
      let actionPayload = '';
      if (colonIndex !== -1) {
        action = data.substring(0, colonIndex);
        actionPayload = data.substring(colonIndex + 1);
      }

      console.log(`[Worker] Processing callback query action: ${action}, payload: ${actionPayload}`);

      if (action === 'addtask_proj') {
        const session = await loadSession(chatId);
        if (!session || session.state !== 'AWAITING_PROJECT_SELECTION' || !session.taskInput) {
          await answerCallbackQuery(callbackId, BOT_MESSAGES.ERRORS.SESSION_EXPIRED);
          return;
        }

        await answerCallbackQuery(callbackId, BOT_MESSAGES.PROMPTS.CREATING_TASK_SINGLE);
        await deleteSession(chatId);

        const dailyLog = await getOrCreateDailyLog(getTodayStr());
        const taskId = await createTask(session.taskInput, actionPayload, dailyLog.id);
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
        const session = await loadSession(chatId);
        if (!session || session.state !== 'AWAITING_AREA_SELECTION' || !session.pendingProjectName || !session.taskInput) {
          await answerCallbackQuery(callbackId, BOT_MESSAGES.ERRORS.SESSION_EXPIRED);
          return;
        }

        await answerCallbackQuery(callbackId, BOT_MESSAGES.PROMPTS.PROJECT_INIT);
        const areas = await fetchAreas();
        const selectedArea = areas.find(a => a.id === actionPayload);
        const areaName = selectedArea ? selectedArea.name : 'Unknown';

        const newProj = await createProject(session.pendingProjectName, actionPayload);
        session.taskInput.projectName = newProj.name;

        const dailyLog = await getOrCreateDailyLog(getTodayStr());
        const taskId = await createTask(session.taskInput, newProj.id, dailyLog.id);
        const deepLink = notionDeepLink(taskId);

        await deleteSession(chatId);

        try {
          await editMessageText(chatId, message.message_id, BOT_MESSAGES.PROMPTS.CHOOSE_AREA(escapeHtml(newProj.name)));
        } catch (e) {
          console.error('[Worker] Failed to remove inline keyboard:', e);
        }

        await sendMessage(
          chatId,
          BOT_MESSAGES.SUCCESS.TASK_CREATED_FULL(escapeHtml(newProj.name), escapeHtml(areaName)),
          { inline_keyboard: [[{ text: BOT_MESSAGES.BUTTONS.OPEN_IN_NOTION, url: deepLink }]] }
        );
      } else if (action === 'hitl_confirm') {
        // HITL Confirmation: User selected an intent from the clarification keyboard
        const confirmedIntent = actionPayload;
        const session = await loadSession(chatId);
        if (!session || session.state !== 'AWAITING_HITL_CONFIRMATION' || !session.originalText) {
          await answerCallbackQuery(callbackId, BOT_MESSAGES.ERRORS.SESSION_EXPIRED);
          return;
        }

        await answerCallbackQuery(callbackId, BOT_MESSAGES.BUTTONS.PROCESSING);
        await deleteSession(chatId);

        // Re-route the original text through the confirmed intent
        console.log(`[Worker] HITL confirmed intent: ${confirmedIntent} for text: "${session.originalText}"`);
        await editMessageText(chatId, message.message_id, `✅ Đã xác nhận: <b>${confirmedIntent}</b>`);
        await executeConfirmedIntent(chatId, session.originalText, confirmedIntent);
      } else if (action === 'hitl_cancel') {
        // HITL Cancel: User wants to discard the pending input
        await answerCallbackQuery(callbackId);
        await deleteSession(chatId);
        await editMessageText(chatId, message.message_id, BOT_MESSAGES.BUTTONS.CANCELLED);
        console.log(`[Worker] HITL session cancelled by user.`);
      } else if (action === 'weekly_approve') {
        const draftId = actionPayload;
        await answerCallbackQuery(callbackId, BOT_MESSAGES.BUTTONS.PROCESSING);
        
        try {
          const count = await commitWeeklyDraft(chatId, draftId);
          await editMessageText(chatId, message.message_id, `✅ <b>Đã đồng bộ thành công ${count} tasks vào Notion!</b>`);
        } catch (error) {
          console.error('[Worker] Error committing weekly draft:', error);
          const errMsg = error instanceof Error ? error.message : String(error);
          await sendMessage(chatId, BOT_MESSAGES.ERRORS.SOMETHING_WENT_WRONG(escapeHtml(errMsg)));
        }
      } else if (action === 'weekly_cancel') {
        const draftId = actionPayload;
        await answerCallbackQuery(callbackId, BOT_MESSAGES.BUTTONS.CANCELLED);
        try {
          const { deleteDraft } = await import('../tools/firestoreClient');
          await deleteDraft(draftId);
        } catch (e) {
          console.error('[Worker] Failed to delete draft on cancel:', e);
        }
        await editMessageText(chatId, message.message_id, BOT_MESSAGES.ERRORS.PLAN_CANCELLED_NEW_COMMAND);
      }
      return;
    }

    // ─── Case 2: Text or Voice Messages ───
    let text = payload?.message?.text?.trim() || '';

    // Voice Note Detection: transcribe audio if present and no text
    if (!text && payload?.message?.voice) {
      const fileId = payload.message.voice.file_id;
      console.log(`[Worker] Voice note detected. file_id: ${fileId}`);
      await sendMessage(chatId, BOT_MESSAGES.PROMPTS.LISTENING_VOICE);
      text = await transcribeVoiceNote(fileId);
      console.log(`[Worker] Transcribed voice text: "${text}"`);
      await sendMessage(chatId, BOT_MESSAGES.PROMPTS.VOICE_TRANSCRIBED(escapeHtml(text)));
    }

    if (!text) return;

    // A. Check active session state first
    const session = await loadSession(chatId);
    if (session) {
      if (session.state === 'AWAITING_PROJECT_NAME') {
        if (text.startsWith('/')) {
          await deleteSession(chatId);
          await sendMessage(chatId, BOT_MESSAGES.ERRORS.PLAN_CANCELLED_NEW_COMMAND);
        } else {
          const projectName = text;
          const areas = await fetchAreas();

          session.state = 'AWAITING_AREA_SELECTION';
          session.pendingProjectName = projectName;
          await saveSession(chatId, session);

          const keyboard: any[][] = [];
          for (const area of areas) {
            keyboard.push([{ text: `🏷 ${area.name}`, callback_data: `addtask_area:${area.id}` }]);
          }

          await sendMessage(
            chatId,
            BOT_MESSAGES.PROMPTS.CHOOSE_AREA(escapeHtml(projectName)),
            { inline_keyboard: keyboard }
          );
        }
        return;
      }
    }

    // B. Default Router Logic (No active session)
    if (text.startsWith('/start')) {
      await sendMessage(chatId, BOT_MESSAGES.GREETINGS.WELCOME);
      return;
    }

    // Classify intent using Gemini LITE
    const classification = await classifyIntent(text);
    console.log(`[Worker] Intent Classification: ${JSON.stringify(classification)}`);

    // ─── Probabilistic Routing ───
    if (classification.confidence_score >= 95 && classification.intent !== 'Unknown') {
      // HIGH CONFIDENCE: Auto-execute the classified intent
      await executeConfirmedIntent(chatId, text, classification.intent);
    } else if (classification.intent !== 'Unknown' && classification.confidence_score > 0) {
      // LOW CONFIDENCE: Trigger HITL clarification loop
      console.log(`[Worker] Low confidence (${classification.confidence_score}%). Triggering HITL flow.`);
      await requestHitlConfirmation(
        chatId,
        text,
        classification.intent,
        classification.confidence_score,
        classification.reasoning,
      );
    } else {
      // UNKNOWN: No recognizable intent
      await sendMessage(chatId, BOT_MESSAGES.ERRORS.UNKNOWN_COMMAND);
    }

  } catch (error) {
    console.error('[Worker] Global Catch - Unhandled error:', error);
    try {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await sendMessage(
        chatId,
        BOT_MESSAGES.ERRORS.SOMETHING_WENT_WRONG(escapeHtml(errorMsg))
      );
    } catch (tgError) {
      console.error('[Worker] Global Catch - Failed to send Telegram error message:', tgError);
    }
  }
}
