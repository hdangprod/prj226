import type { HttpFunction } from '@google-cloud/functions-framework';
import { sendMessage, answerCallbackQuery, editMessageText } from './telegram/client';
import {
  processSingleTask,
  getRescueTask,
  processHighlight,
  deferTask,
  processWeeklyPlanPreview,
  bulkCreateTasks
} from './services/taskService';
import { generateWeeklyReport } from './services/reportService';
import { updateTaskStatus } from './notion/client';

// Simple in-memory cache to store weekly plan drafts for bulk confirmation
const weeklyPlanDrafts = new Map<number, any[]>();

export const helloHttp: HttpFunction = async (req, res) => {
  try {
    const update = req.body;
    res.status(200).send('OK');

    if (update.message && update.message.text) {
      await handleMessage(update.message);
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    }
  } catch (error) {
    console.error('[Webhook] Error handling update:', error);
  }
};

async function handleMessage(message: any) {
  const chatId = message.chat.id;
  const text = message.text.trim();

  try {
    if (text.startsWith('/start')) {
      await sendMessage(chatId, 'Hello! I am your Second Brain Assistant. Ready to help you manage tasks and projects.');
    } else if (text.startsWith('/add_task ')) {
      await sendMessage(chatId, '⏳ Processing your task...');
      const responseText = await processSingleTask(text.replace('/add_task', '').trim());
      await sendMessage(chatId, responseText);
    } else if (text.startsWith('/view_task')) {
      await sendMessage(chatId, 'This feature will query today\'s tasks. Currently under construction!');
    } else if (text.startsWith('/rescue')) {
      await sendMessage(chatId, '⏳ Finding a rescue task...');
      const responseText = await getRescueTask();
      await sendMessage(chatId, responseText);
    } else if (text.startsWith('/plan_week ')) {
      await sendMessage(chatId, '⏳ Analyzing your weekly plan. Please wait...');
      const parsedTasks = await processWeeklyPlanPreview(text.replace('/plan_week', '').trim());
      weeklyPlanDrafts.set(chatId, parsedTasks);
      
      const previewText = parsedTasks.map((t, idx) => `*${idx + 1}. ${t.name}* (${t.estimate}h, ${t.priority})`).join('\n');
      
      await sendMessage(chatId, `Draft Plan Generated:\n\n${previewText}\n\nDo you want to create these tasks?`, {
        inline_keyboard: [[
          { text: '✅ Create All', callback_data: `confirm_bulk_create` },
          { text: '❌ Cancel', callback_data: `cancel_bulk_create` }
        ]]
      });
    } else if (text.startsWith('/weekly_report')) {
      await sendMessage(chatId, '⏳ Generating your weekly report (this may take a few seconds)...');
      const retro = await generateWeeklyReport();
      await sendMessage(chatId, retro);
    } else if (text.startsWith('/highlight ')) {
      await sendMessage(chatId, '⏳ Translating your highlight...');
      const result = await processHighlight(text.replace('/highlight', '').trim());
      await sendMessage(chatId, result);
    } else {
      await sendMessage(chatId, 'Command not recognized or missing arguments.');
    }
  } catch (err) {
    console.error('[Telegram] Error processing message:', err);
    await sendMessage(chatId, 'An error occurred while processing your request.');
  }
}

async function handleCallbackQuery(callbackQuery: any) {
  const queryId = callbackQuery.id;
  const chatId = callbackQuery.message?.chat.id;
  const messageId = callbackQuery.message?.message_id;
  const data = callbackQuery.data;

  try {
    if (data.startsWith('complete_')) {
      const taskId = data.split('_')[1];
      await updateTaskStatus(taskId, 'Done');
      await answerCallbackQuery(queryId, 'Task marked as Complete!');
      await editMessageText(chatId, messageId, '✅ Task marked as Done!');
    } else if (data.startsWith('defer_')) {
      const taskId = data.split('_')[1];
      await deferTask(taskId);
      await answerCallbackQuery(queryId, 'Task deferred for tomorrow!');
      await editMessageText(chatId, messageId, '⏳ Task deferred and rollover created.');
    } else if (data === 'confirm_bulk_create') {
      const draftTasks = weeklyPlanDrafts.get(chatId);
      if (!draftTasks) {
        await answerCallbackQuery(queryId, 'Draft not found or expired.');
        return;
      }
      await answerCallbackQuery(queryId, 'Creating tasks...');
      const result = await bulkCreateTasks(draftTasks);
      weeklyPlanDrafts.delete(chatId);
      await editMessageText(chatId, messageId, `✅ ${result}`);
    } else if (data === 'cancel_bulk_create') {
      weeklyPlanDrafts.delete(chatId);
      await answerCallbackQuery(queryId, 'Draft cancelled.');
      await editMessageText(chatId, messageId, '❌ Weekly plan creation cancelled.');
    } else {
      await answerCallbackQuery(queryId, 'Action not recognized.');
    }
  } catch (err) {
    console.error('[Telegram] Error processing callback query:', err);
  }
}
