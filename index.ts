import * as functions from '@google-cloud/functions-framework';
import { taskService } from './src/services/taskService';
import { reportService } from './src/services/reportService';
import { telegramClient } from './src/telegram/client';
import { NotionSecondBrainClient } from './src/notion/client';

const notionClient = new NotionSecondBrainClient();

// Expose helloHttp as Google Cloud Functions HTTP webhook
functions.http('helloHttp', async (req: any, res: any) => {
  const body = req.body;

  // Log incoming body for debug/diagnostics
  console.log('Incoming Telegram Update:', JSON.stringify(body, null, 2));

  // 1. Handle Inline Keyboards (Callback Queries)
  if (body && body.callback_query) {
    const callbackQuery = body.callback_query;
    const callbackQueryId = callbackQuery.id;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const originalText = callbackQuery.message.text || '';
    const callbackData = callbackQuery.data;

    try {
      // Answer callback query immediately to dismiss loading state
      await telegramClient.answerCallbackQuery(callbackQueryId);

      if (callbackData.startsWith('complete_')) {
        const taskId = callbackData.replace('complete_', '');
        console.log(`Callback: completing task ${taskId}`);

        // Update task Status in Notion
        await notionClient.completeTask(taskId);

        // Edit original message text to show completion
        const updatedText = `✅ *Đã hoàn thành!*\n\n${originalText}`;
        await telegramClient.editMessageText(chatId, messageId, updatedText, {
          reply_markup: { inline_keyboard: [] } // remove inline buttons
        });

      } else if (callbackData.startsWith('defer_')) {
        const taskId = callbackData.replace('defer_', '');
        console.log(`Callback: deferring task ${taskId}`);

        // Execute task rollover logic (halve estimate, mark Done, clone for tomorrow)
        const rollover = await taskService.deferAndRolloverTask(taskId);

        // Update original message
        const updatedText = `⏳ *Đã hoãn & Rollover sang ngày mai*\n- Dự lượng gốc giảm còn: ${rollover.adjustedOriginalEstimate}h\n- Tiến trình: Hoàn thành ${rollover.checkedCount} checklist items.\n\n${originalText}`;
        await telegramClient.editMessageText(chatId, messageId, updatedText, {
          reply_markup: { inline_keyboard: [] }
        });

        // Send confirmation message about tomorrow's rollover task
        const confirmMsg = `🚀 *Rollover thành công!*\nĐã chuyển các việc chưa xong sang ngày mai (${rollover.tomorrowStr}):\n*Task:* [Rollover] ${rollover.originalTask.name}\n*Dự lượng:* ${rollover.adjustedOriginalEstimate}h\n*Checklist chuyển đi:* ${rollover.uncheckedCount} items dở dang.`;
        await telegramClient.sendMessage(chatId, confirmMsg);
      }

    } catch (error: any) {
      console.error('Error handling callback query:', error);
      await telegramClient.sendMessage(chatId, `❌ Có lỗi xảy ra khi xử lý nút bấm: ${error.message}`);
    }

    return res.status(200).send('OK');
  }

  // 2. Handle Text Messages
  if (body && body.message) {
    const message = body.message;
    const chatId = message.chat.id;
    const text = (message.text || '').trim();

    if (!text) {
      return res.status(200).send('OK');
    }

    try {
      // Command /start
      if (text.startsWith('/start')) {
        const welcome = `Chào Sếp! Tôi là Liam, trợ lý hiệu suất tối cao Second Brain của Sếp. 🧠

*Các lệnh được hỗ trợ:*
- Nhập text tự nhiên để *tạo task mới* (Ví dụ: \`Thiết kế UI mới cho dự án PRJ226 ngày mai, độ ưu tiên High, 2h\`).
- Gửi một đường link (URL) để *lưu trữ tài nguyên* (Ví dụ: \`https://example.com/notion-guide Tài liệu Notion API mới của Area Tech\`).
- \`/view_task\` hoặc \`/tasks\`: Xem danh sách task chưa hoàn thành hôm nay.
- \`/rescue\`: Gọi công cụ giải cứu sự trì hoãn (tìm task quan trọng và dễ làm nhất).
- \`/highlight <nội dung>\`: Nhập thành tựu/ghi chép ngày hôm nay (tự dịch sang tiếng Anh lưu Daily Log).
- \`/weekly_report\` hoặc \`/retro\`: Xem báo cáo hiệu suất tuần (Slippage Rate, Velocity, PM framework).`;
        await telegramClient.sendMessage(chatId, welcome);
        return res.status(200).send('OK');
      }

      // Command /view_task or /tasks
      if (text.startsWith('/view_task') || text.startsWith('/tasks')) {
        console.log('Fetching today\'s tasks...');
        const tasks = await notionClient.fetchTodayTasks();

        if (tasks.length === 0) {
          await telegramClient.sendMessage(chatId, `🎉 Hôm nay Sếp không còn task nào chưa hoàn thành! Tuyệt vời!`);
        } else {
          await telegramClient.sendMessage(chatId, `📋 *Danh sách task chưa hoàn thành hôm nay:*`);
          for (const task of tasks) {
            // Fetch project progress metrics if linked
            let projectInfo = 'Không có';
            if (task.projectId) {
              const proj = await notionClient.fetchActiveProjects();
              const matchedProj = proj.find(p => p.id === task.projectId);
              if (matchedProj) {
                const progress = await notionClient.fetchProjectTasksProgress(task.projectId);
                const progressPercent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
                projectInfo = `${matchedProj.name} (Tiến độ: ${progressPercent}%)`;
              }
            }

            const taskMsg = `*Nhiệm vụ:* ${task.name}\n*Dự án:* ${projectInfo}\n*Độ ưu tiên:* ${task.priority}\n*Dự lượng:* ${task.estimate}h\n*Hạn chót:* ${task.dueDate}`;
            
            const inlineKeyboard = {
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '✅ Complete', callback_data: `complete_${task.id}` },
                    { text: '⏳ Defer', callback_data: `defer_${task.id}` }
                  ]
                ]
              }
            };

            await telegramClient.sendMessage(chatId, taskMsg, inlineKeyboard);
          }
        }
        return res.status(200).send('OK');
      }

      // Command /rescue (Focus Rescue Engine)
      if (text.startsWith('/rescue')) {
        console.log('Running rescue engine...');
        const recommendedTask = await taskService.rescueTask();

        if (!recommendedTask) {
          await telegramClient.sendMessage(
            chatId,
            `💡 Không tìm thấy task quan trọng (High Priority) có thời lượng ngắn (≤ 30 phút) nào trong hôm nay. Sếp hãy chọn các task khác trong danh sách \`/view_task\` nhé!`
          );
        } else {
          const rescueMsg = `⚡ *FOCUS RESCUE ENGINE (CỨU VÃN TẬP TRUNG)* ⚡
Liam khuyên Sếp làm ngay task này để vượt qua sự trì hoãn:

*Nhiệm vụ:* ${recommendedTask.name}
*Độ ưu tiên:* ${recommendedTask.priority}
*Dự lượng:* ${recommendedTask.estimate}h (≤ 30 phút)

👉 Hãy bắt đầu ngay 25 phút Pomodoro tập trung cao độ, tắt hết thông báo đi nào Sếp!`;
          
          const inlineKeyboard = {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ Complete', callback_data: `complete_${recommendedTask.id}` },
                  { text: '⏳ Defer', callback_data: `defer_${recommendedTask.id}` }
                ]
              ]
            }
          };

          await telegramClient.sendMessage(chatId, rescueMsg, inlineKeyboard);
        }
        return res.status(200).send('OK');
      }

      // Command /weekly_report or /retro
      if (text.startsWith('/weekly_report') || text.startsWith('/retro')) {
        console.log('Compiling weekly retro report...');
        const waitMsgResponse = await telegramClient.sendMessage(chatId, `🤖 _Liam đang tổng hợp chỉ số hiệu suất tuần và phân tích PM framework..._`);
        const waitMessageId = waitMsgResponse?.result?.message_id;

        const reportMsg = await reportService.getWeeklyReportMessage();

        if (waitMessageId) {
          await telegramClient.editMessageText(chatId, waitMessageId, reportMsg);
        } else {
          await telegramClient.sendMessage(chatId, reportMsg);
        }
        return res.status(200).send('OK');
      }

      // Command /highlight <content>
      if (text.startsWith('/highlight')) {
        const highlightText = text.replace('/highlight', '').trim();
        if (!highlightText) {
          await telegramClient.sendMessage(chatId, `⚠️ Vui lòng nhập nội dung highlight sau lệnh. Ví dụ: \`/highlight Đóng gói thành công tính năng chatbot\``);
          return res.status(200).send('OK');
        }

        const waitMsgResponse = await telegramClient.sendMessage(chatId, `🤖 _Liam đang biên dịch sang tiếng Anh và đồng bộ Daily Log..._`);
        const waitMessageId = waitMsgResponse?.result?.message_id;

        const translated = await taskService.addDailyHighlight(highlightText);
        const confirmMsg = `✍️ *Đã ghi nhận highlight hôm nay vào Daily Log:*
- Tiếng Việt: "${highlightText}"
- Tiếng Anh (Lưu Notion): "${translated}"`;

        if (waitMessageId) {
          await telegramClient.editMessageText(chatId, waitMessageId, confirmMsg);
        } else {
          await telegramClient.sendMessage(chatId, confirmMsg);
        }
        return res.status(200).send('OK');
      }

      // 3. Handle Resource capturing (if message contains http/https link)
      const urlRegex = /(https?:\/\/[^\s]+)/gi;
      const urlMatches = text.match(urlRegex);
      
      if (urlMatches) {
        const url = urlMatches[0];
        console.log(`Detected URL: ${url}. Saving as resource...`);

        const waitMsgResponse = await telegramClient.sendMessage(chatId, `🤖 _Liam đang phân tích và sắp xếp tài liệu vào Resources theo Area..._`);
        const waitMessageId = waitMsgResponse?.result?.message_id;

        const resource = await taskService.saveResource(url, text);
        const resourceMsg = `📚 *Đã lưu tài nguyên tham khảo mới:*
- *Tên tài liệu:* ${resource.title}
- *Đường dẫn:* [Liên kết](${resource.url})
- *Phân loại (Area):* ${resource.areaName}`;

        if (waitMessageId) {
          await telegramClient.editMessageText(chatId, waitMessageId, resourceMsg, { disable_web_page_preview: true });
        } else {
          await telegramClient.sendMessage(chatId, resourceMsg, { disable_web_page_preview: true });
        }
        return res.status(200).send('OK');
      }

      // 4. Handle Raw Task text command
      console.log(`Processing raw text task creation: "${text}"`);
      const waitMsgResponse = await telegramClient.sendMessage(chatId, `🤖 _Liam đang phân tích yêu cầu công việc và lập checklist đồng bộ Notion..._`);
      const waitMessageId = waitMsgResponse?.result?.message_id;

      const task = await taskService.createTaskFromNaturalLanguage(text);

      const successMsg = `🎯 *Đã tạo task thành công trên Notion!*

*Nhiệm vụ:* ${task.taskName}
*Dự án:* ${task.projectName}
*Hạn chót:* ${task.dueDate}
*Độ ưu tiên:* ${task.priority}
*Dự lượng:* ${task.estimate}h

*Checklist hành động đã nạp:*
${task.checklistText}`;

      if (waitMessageId) {
        await telegramClient.editMessageText(chatId, waitMessageId, successMsg);
      } else {
        await telegramClient.sendMessage(chatId, successMsg);
      }

    } catch (error: any) {
      console.error('Error handling message update:', error);
      await telegramClient.sendMessage(chatId, `❌ Có lỗi xảy ra: ${error.message}`);
    }

    return res.status(200).send('OK');
  }

  // Fallback response for other webhook updates (e.g. edited_message, poll, etc.)
  res.status(200).send('OK');
});
