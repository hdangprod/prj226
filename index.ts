import * as functions from '@google-cloud/functions-framework';
import * as dotenv from 'dotenv';

// Load environment variables locally
dotenv.config();

import { 
  fetchProjects, 
  addTask, 
  fetchTodayTasks, 
  completeTask, 
  getTaskWithBlocks, 
  updateTaskEstimate, 
  cloneTaskForNextDay 
} from './src/notionClient';

import { parseTaskInput } from './src/geminiClient';

import { 
  sendMessage, 
  editMessageText, 
  answerCallbackQuery 
} from './src/telegramClient';

// Register HTTP function helloHttp
functions.http('helloHttp', async (req: any, res: any) => {
  const body = req.body;

  // Log incoming body for debugging
  console.log('Incoming Telegram Update:', JSON.stringify(body, null, 2));

  // 1. Handle Callback Queries (from inline keyboards)
  if (body && body.callback_query) {
    const callbackQuery = body.callback_query;
    const callbackQueryId = callbackQuery.id;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const originalText = callbackQuery.message.text || '';
    const callbackData = callbackQuery.data;

    try {
      // Answer callback query immediately to stop Telegram loading spinner
      await answerCallbackQuery(callbackQueryId);

      if (callbackData.startsWith('complete_')) {
        const taskId = callbackData.replace('complete_', '');
        console.log(`Processing complete action for task: ${taskId}`);

        // Update task status in Notion
        await completeTask(taskId);

        // Edit original message text to show completion
        const updatedText = `✅ *Đã hoàn thành!*\n\n${originalText}`;
        await editMessageText(chatId, messageId, updatedText, {
          reply_markup: { inline_keyboard: [] } // remove buttons
        });

      } else if (callbackData.startsWith('defer_')) {
        const taskId = callbackData.replace('defer_', '');
        console.log(`Processing defer/rollover action for task: ${taskId}`);

        // 1. Fetch task details and checklist blocks from Notion
        const task = await getTaskWithBlocks(taskId);

        // 2. Identify unchecked checklist items
        const uncheckedItems = task.checklist.filter(item => !item.checked);
        const checkedCount = task.checklist.length - uncheckedItems.length;

        // 3. Recalculate original task's estimate (halve it)
        const adjustedOriginalEstimate = parseFloat((task.estimate * 0.5).toFixed(2)) || 0.5;
        await updateTaskEstimate(taskId, adjustedOriginalEstimate);

        // 4. Mark original task as Done
        await completeTask(taskId);

        // 5. Clone task for the next day with unchecked items
        await cloneTaskForNextDay(task, uncheckedItems);

        // 6. Edit original message on Telegram to reflect the deferral
        const updatedText = `⏳ *Đã hoãn & Chia nhỏ sang ngày mai*\n- Ưu lượng gốc giảm còn: ${adjustedOriginalEstimate}h\n- Tiến trình: Hoàn thành ${checkedCount}/${task.checklist.length} subtasks.\n\n${originalText}`;
        await editMessageText(chatId, messageId, updatedText, {
          reply_markup: { inline_keyboard: [] }
        });

        // 7. Send confirmation message for the rollover task
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short' });
        
        let rolloverMsg = `🚀 *Rollover thành công!*\nĐã chuyển ${uncheckedItems.length} việc chưa làm sang ngày ${tomorrowStr}:\n*Task:* [Rollover] ${task.name}\n*Dự lượng:* ${(task.estimate * 0.5).toFixed(2)}h`;
        if (uncheckedItems.length > 0) {
          rolloverMsg += `\n*Checklist chuyển đi:*\n` + uncheckedItems.map(it => `- ${it.text}`).join('\n');
        } else {
          rolloverMsg += `\n(Tất cả subtasks đã hoàn thành hoặc không có checklist!)`;
        }
        await sendMessage(chatId, rolloverMsg);
      }

    } catch (error: any) {
      console.error('Error handling callback query:', error);
      await sendMessage(chatId, `❌ Có lỗi xảy ra khi xử lý nút bấm: ${error.message}`);
    }

    return res.status(200).send('OK');
  }

  // 2. Handle Text Messages
  if (body && body.message) {
    const message = body.message;
    const chatId = message.chat.id;
    const text = message.text || '';

    // Ignore non-text messages
    if (!text) {
      return res.status(200).send('OK');
    }

    try {
      if (text.startsWith('/start')) {
        const welcomeMessage = `Chào Sếp! Hệ thống TypeScript V3.0 Serverless đã thông suốt tại Singapore. 🇸🇬\n\nTôi là Liam, trợ lý hiệu suất tối cao của Sếp.\n\n*Các lệnh hỗ trợ:*\n- Nhập văn bản trực tiếp hoặc dùng lệnh \`/add_task <nội dung>\` để thêm task thông minh bằng AI.\n- Dùng lệnh \`/view_task\` hoặc \`/tasks\` để xem các task hôm nay và thực hiện thao tác nhanh.`;
        await sendMessage(chatId, welcomeMessage);

      } else if (text.startsWith('/view_task') || text.startsWith('/tasks')) {
        console.log('Fetching today\'s tasks...');
        const tasks = await fetchTodayTasks();

        if (tasks.length === 0) {
          await sendMessage(chatId, `🎉 Hôm nay Sếp không còn task nào chưa hoàn thành! Tuyệt vời!`);
        } else {
          await sendMessage(chatId, `📋 *Danh sách task chưa hoàn thành hôm nay:*`);
          for (const task of tasks) {
            const taskMsg = `*Task:* ${task.name}\n*Độ ưu tiên:* ${task.priority}\n*Dự lượng:* ${task.estimate}h\n*Ngày:* ${task.date}`;
            
            // Inline Keyboard buttons
            const replyMarkup = {
              inline_keyboard: [
                [
                  { text: '✅ Complete', callback_data: `complete_${task.id}` },
                  { text: '⏳ Defer', callback_data: `defer_${task.id}` }
                ]
              ]
            };

            await sendMessage(chatId, taskMsg, { reply_markup: replyMarkup });
          }
        }

      } else {
        // Treat as task creation command (either starting with /add_task or raw natural language text)
        let taskDescription = text;
        if (text.startsWith('/add_task')) {
          taskDescription = text.replace('/add_task', '').trim();
        }

        if (!taskDescription) {
          await sendMessage(chatId, `⚠️ Sếp vui lòng nhập nội dung công việc. Ví dụ: \`/add_task Thiết kế UI mới, độ ưu tiên cao, dự kiến 2h\``);
          return res.status(200).send('OK');
        }

        // Inform user that Liam is parsing
        const waitMsgResponse = await sendMessage(chatId, `🤖 _Liam đang phân tích yêu cầu và đồng bộ Notion..._`);
        const waitMessageId = waitMsgResponse?.result?.message_id;

        // Fetch active projects to context-match
        console.log('Fetching active projects...');
        const projects = await fetchProjects();

        // Run Gemini parsing
        console.log('Parsing with Gemini...');
        const parsedTask = await parseTaskInput(taskDescription, projects);
        console.log('Gemini Parsed Task Output:', JSON.stringify(parsedTask, null, 2));

        // Create page in Notion Tasks DB
        console.log('Adding task to Notion...');
        await addTask({
          name: parsedTask.name,
          priority: parsedTask.priority,
          estimate: parsedTask.estimate,
          dueDate: parsedTask.dueDate,
          projectId: parsedTask.projectId,
          checklist: parsedTask.checklist
        });

        // Find project name if matched
        const matchedProject = projects.find(p => p.id === parsedTask.projectId);
        const projectName = matchedProject ? matchedProject.name : 'Không có';

        // Prepare success text
        const successText = `🎯 *Đã tạo task thành công trên Notion!*\n\n*Task:* ${parsedTask.name}\n*Dự án:* ${projectName}\n*Độ ưu tiên:* ${parsedTask.priority}\n*Dự lượng:* ${parsedTask.estimate}h\n*Hạn chót:* ${parsedTask.dueDate}\n\n*Checklist đã tạo:*\n` + 
          parsedTask.checklist.map(item => `- [ ] ${item}`).join('\n');

        // Delete the loading message or edit it
        if (waitMessageId) {
          await editMessageText(chatId, waitMessageId, successText);
        } else {
          await sendMessage(chatId, successText);
        }
      }
    } catch (error: any) {
      console.error('Error handling message:', error);
      await sendMessage(chatId, `❌ Đã xảy ra lỗi: ${error.message}`);
    }

    return res.status(200).send('OK');
  }

  // Fallback for other update types
  res.status(200).send('OK');
});
