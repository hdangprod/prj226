import { sendMessage, editMessageText } from '../tools/telegramClient';
import { triageLockTool } from '../tools/triageLockTool';
import { TRIAGE_CONFIG } from '../config';
import { parseTaskInput } from '../tools/geminiClient';
import { findProjectByName, fetchActiveProjects, createTask, getOrCreateDailyLog } from '../tools/notionClient';

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

export interface TriageInboxItem {
  id: string;
  title: string;
}

// In-memory mock inbox store for demonstration/test harness when Notion API inbox is queried
let mockInboxItems: TriageInboxItem[] = [
  { id: 'inbox-page-1', title: '🔹 Task A: Triển khai MOD-08' },
  { id: 'inbox-page-2', title: '🔹 Task B: Setup Cloud Run Worker' },
  { id: 'inbox-page-3', title: '🔹 Task C: Review Notion Database Schema' },
];

export function setMockInboxItems(items: TriageInboxItem[]): void {
  mockInboxItems = items;
}

/**
 * Stage 1: Bubble Flush
 * Flushes up to 5 oldest items from Inbox Tray as independent message bubbles.
 */
export async function flushInbox(chatId: string | number): Promise<void> {
  if (!TRIAGE_CONFIG.FEATURE_TRIAGE_MODE) {
    await sendMessage(chatId, '⚠️ Chế độ Dọn dẹp Inbox đang bảo trì.');
    return;
  }

  if (mockInboxItems.length === 0) {
    await sendMessage(chatId, '🎉 Inbox Zero! Không có item nào cần dọn dẹp.');
    return;
  }

  const itemsToFlush = mockInboxItems.slice(0, 5);
  await sendMessage(chatId, `🧹 <b>Bắt đầu Triage (${itemsToFlush.length} items):</b>`);

  for (const item of itemsToFlush) {
    const sentMsg = await sendMessage(
      chatId,
      `📥 <b>[INBOX ITEM]</b>\n<s>${item.title}</s>\n\n<i>Bấm Reply vào tin nhắn này để phân loại task!</i>`
    );

    if (sentMsg?.message_id) {
      // Set Hard Lock mapping Telegram Message ID -> Notion Page ID (TTL 600s)
      triageLockTool.setHardLock(chatId, sentMsg.message_id, item.id, TRIAGE_CONFIG.REDIS_TTL_HARD_LOCK);
    }

    // Throttle delay 300ms to prevent Telegram API rate limits (ERR-429)
    await delay(TRIAGE_CONFIG.THROTTLE_MSG_DELAY_MS);
  }
}

/**
 * Stage 2 & 3: Smart Context Routing & Dynamic Validation
 * Handles user input targeting a Triage Bubble or active Soft Lock session.
 */
export async function handleTriageInput(
  chatId: string | number,
  userText: string,
  replyToMessageId: number | undefined,
  targetNotionPageId: string
): Promise<void> {
  // Stale UI Degradation Check (AC 4.3)
  if (replyToMessageId) {
    const hardLockPageId = triageLockTool.getHardLock(chatId, replyToMessageId);
    if (!hardLockPageId && !triageLockTool.getSoftLock(chatId)) {
      await sendMessage(chatId, '⚠️ Quá hạn dọn dẹp phiên.');
      try {
        await editMessageText(chatId, replyToMessageId, `<s>[INBOX ITEM]</s>\n\n<b>*[⏳ QUÁ HẠN PHIÊN]*</b>`);
      } catch (e) {
        // Ignore Telegram edit error if message too old
      }
      return;
    }
  }

  // ERR-RACE: Distributed Lock via SETNX
  const lockAcquired = triageLockTool.acquireDistributedLock(targetNotionPageId, 10);
  if (!lockAcquired) {
    await sendMessage(chatId, '⚠️ Đang xử lý item này ở luồng khác. Vui lòng chờ.');
    return;
  }

  try {
    // ERR-LOOP Defense: Check Turn Counter
    const turnCount = triageLockTool.incrementTurn(chatId);
    if (turnCount > 3) {
      triageLockTool.deleteSoftLock(chatId);
      await sendMessage(chatId, '⚠️ Lệnh quá phức tạp. Hủy luồng Triage, vui lòng reply lại.');
      return;
    }

    // Parse natural language input using Gemini LITE
    const currentIso = new Date().toISOString();
    const parsedInput = await parseTaskInput(userText, currentIso);

    // Schema Contract Validation: Check required fields
    const hasProject = Boolean(parsedInput.projectName);

    if (!hasProject) {
      // Incomplete schema: Set Soft Lock and ask AI clarification question
      triageLockTool.setSoftLock(chatId, targetNotionPageId, TRIAGE_CONFIG.REDIS_TTL_SOFT_LOCK);

      const aiMsg = await sendMessage(
        chatId,
        `❓ Task "<b>${parsedInput.name}</b>" thuộc Dự án nào thưa Sếp?\n<i>(Gõ bồi tên dự án hoặc Reply tin nhắn này)</i>`
      );

      if (aiMsg?.message_id) {
        // Recursive Dynamic Tree Expansion (AC 4.4): Register AI message ID in Hard Lock map
        triageLockTool.setHardLock(chatId, aiMsg.message_id, targetNotionPageId, TRIAGE_CONFIG.REDIS_TTL_HARD_LOCK);
      }
      return;
    }

    // Complete schema: Execute Task creation in Notion
    let matchedProj = await findProjectByName(parsedInput.projectName!);
    let projectId = matchedProj?.id;

    if (!projectId) {
      const activeProjects = await fetchActiveProjects();
      if (activeProjects.length > 0) {
        projectId = activeProjects[0].id;
      }
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const dailyLog = await getOrCreateDailyLog(todayStr);
    const taskId = await createTask(parsedInput, projectId, dailyLog.id);

    // Remove from mock inbox store if present
    mockInboxItems = mockInboxItems.filter((item) => item.id !== targetNotionPageId);

    // Stage 4: Garbage Collection & UI Closure
    triageLockTool.deleteSoftLock(chatId);

    await sendMessage(chatId, `✅ <b>[TẠO TASK THÀNH CÔNG]</b>\nTask: <b>${parsedInput.name}</b>\nDự án: <b>${parsedInput.projectName}</b>`);

    if (replyToMessageId) {
      try {
        await editMessageText(
          chatId,
          replyToMessageId,
          `<s>📥 [INBOX ITEM] ${parsedInput.name}</s>\n\n<b>*[✅ ĐÃ CHUYỂN THÀNH TASK]*</b>`
        );
      } catch (e) {
        // Ignore edit error if message cannot be edited
      }
    }
  } finally {
    triageLockTool.releaseDistributedLock(targetNotionPageId);
  }
}
