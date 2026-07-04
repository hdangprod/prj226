// Set up environments for offline testing before importing any config-dependent code
process.env.NODE_ENV = 'test';
process.env.QUEUE_MODE = 'sync';
process.env.TELEGRAM_BOT_TOKEN = 'mock-bot-token';
process.env.NOTION_API_KEY = 'mock-notion-key';
process.env.NOTION_AREAS_DB_ID = 'mock-areas-id';
process.env.NOTION_PROJECTS_DB_ID = 'mock-projects-id';
process.env.NOTION_DAILY_LOGS_DB_ID = 'mock-daily-logs-id';
process.env.NOTION_TASKS_DB_ID = 'mock-tasks-id';
process.env.NOTION_RESOURCES_DB_ID = 'mock-resources-id';
process.env.GEMINI_API_KEY = 'mock-gemini-key';

// Dynamic require to prevent TS import hoisting from running config validation too early
const { helloHttp } = require('../src/index');
const { sentMessages, clearSentMessages } = require('../src/tools/telegramClient');
const { loadSession, saveSession } = require('../src/tools/firestoreClient');

function mockRes() {
  const res: any = {
    statusCode: 200,
    sentContent: '',
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(content: any) {
      this.sentContent = content;
      return this;
    },
  };
  return res;
}

async function runTests() {
  console.log('=== Starting Offline Integration Tests (Slice 1-5) ===\n');

  try {
    // ─── SLICE 1 TESTS ───
    console.log('--- Test 1: Receiving /start command ---');
    clearSentMessages();
    
    const reqStart: any = {
      path: '/webhook',
      body: {
        message: {
          chat: { id: 999999 },
          text: '/start',
          message_id: 1001,
        },
      },
    };
    const resStart = mockRes();
    await helloHttp(reqStart, resStart);

    if (sentMessages.length !== 1 || !sentMessages[0].text.includes('Chào Sếp! Tôi là Liam')) {
      throw new Error(`Test 1 Failed: Welcome message not received. Sent: ${JSON.stringify(sentMessages)}`);
    }
    console.log('✅ Test 1 passed successfully!\n');

    console.log('--- Test 2: Global Error Catch & Notification ---');
    clearSentMessages();
    const reqCrash: any = {
      path: '/worker',
      body: {
        message: {
          chat: { id: 999999 },
          get text() {
            throw new Error('Simulated prompt evaluation timeout');
          },
          message_id: 1002,
        },
      },
    };
    const resCrash = mockRes();
    await helloHttp(reqCrash, resCrash);

    if (sentMessages.length !== 1 || !sentMessages[0].text.includes('Something went wrong')) {
      throw new Error(`Test 2 Failed: Error notification not received. Sent: ${JSON.stringify(sentMessages)}`);
    }
    console.log('✅ Test 2 passed successfully!\n');


    // ─── SLICE 2 TESTS ───
    console.log('--- Test 3: Autonomous Task Capture (Text with project PRJ226) ---');
    clearSentMessages();
    const reqTaskAuto: any = {
      path: '/webhook',
      body: {
        message: {
          chat: { id: 999999 },
          text: 'Làm giao diện đăng nhập cho dự án PRJ226',
          message_id: 1003,
        },
      },
    };
    const resTaskAuto = mockRes();
    await helloHttp(reqTaskAuto, resTaskAuto);

    console.log('Messages sent:', JSON.stringify(sentMessages, null, 2));
    // Expect 2 messages: "Đang phân tích task..." and "Task created and linked to project!"
    if (sentMessages.length !== 2) {
      throw new Error(`Test 3 Failed: Expected 2 messages, got ${sentMessages.length}`);
    }
    if (!sentMessages[1].text.includes('Task created')) {
      throw new Error(`Test 3 Failed: Expected confirmation text "Task created", got "${sentMessages[1].text}"`);
    }
    console.log('✅ Test 3 passed successfully!\n');


    console.log('--- Test 4: Task Capture with Project Selection Prompt ---');
    clearSentMessages();
    const reqTaskSelection: any = {
      path: '/webhook',
      body: {
        message: {
          chat: { id: 999999 },
          text: 'Làm tài liệu API', // No project name matching PRJ226
          message_id: 1004,
        },
      },
    };
    const resTaskSelection = mockRes();
    await helloHttp(reqTaskSelection, resTaskSelection);

    console.log('Messages sent:', JSON.stringify(sentMessages, null, 2));
    if (sentMessages.length !== 2) {
      throw new Error(`Test 4 Failed: Expected 2 messages, got ${sentMessages.length}`);
    }
    if (!sentMessages[1].text.includes('Vui lòng chọn Project')) {
      throw new Error(`Test 4 Failed: Expected project selection prompt, got "${sentMessages[1].text}"`);
    }

    // Verify session was persisted under state AWAITING_PROJECT_SELECTION
    const session = await loadSession(999999);
    if (!session || session.state !== 'AWAITING_PROJECT_SELECTION') {
      throw new Error(`Test 4 Failed: Session state should be AWAITING_PROJECT_SELECTION, got ${JSON.stringify(session)}`);
    }
    console.log('✅ Test 4 passed successfully!\n');


    console.log('--- Test 5: Confirming Project Selection Callback ---');
    clearSentMessages();
    const reqCallback: any = {
      path: '/webhook',
      body: {
        callback_query: {
          id: 'cb-123',
          message: {
            chat: { id: 999999 },
            message_id: 1005,
          },
          data: 'addtask_proj:mock-proj-id',
        },
      },
    };
    const resCallback = mockRes();
    await helloHttp(reqCallback, resCallback);

    console.log('Messages sent:', JSON.stringify(sentMessages, null, 2));
    if (sentMessages.length !== 1) {
      throw new Error(`Test 5 Failed: Expected 1 message (edited confirmation), got ${sentMessages.length}`);
    }
    if (!sentMessages[0].text.includes('Task created')) {
      throw new Error(`Test 5 Failed: Expected editMessageText confirmation, got "${sentMessages[0].text}"`);
    }

    // Verify session has been deleted post-creation
    const sessionPost = await loadSession(999999);
    if (sessionPost !== null) {
      throw new Error(`Test 5 Failed: Session should be deleted, but still exists: ${JSON.stringify(sessionPost)}`);
    }
    console.log('✅ Test 5 passed successfully!\n');


    console.log('--- Test 6: Timestamp-based Session Expiration (5-minute TTL) ---');
    // Save a custom session
    await saveSession(888888, { state: 'AWAITING_PROJECT_NAME' });
    
    // Artificially modify the mock session to make it old
    const mockSessionsMap = require('../src/tools/firestoreClient').loadSession; 
    // We can just manipulate the session in memory. In firestoreClient, the mockSessions is an internal map.
    // Let's retrieve and modify it. Since the file is written, let's load it and make sure it has expired.
    // To do this, let's look at what mockSessions is: it's stored inside firestoreClient.ts.
    // Let's set the time back:
    const mockSessionsInternal = require('../src/tools/firestoreClient');
    // Wait, the map itself is not exported, but we can call saveSession which registers it with new Date().toISOString().
    // If we want to test expiration, we can mock Date.now inside our test, or we can wait, or we can check loadSession.
    // Since loadSession uses the updatedAt in mockSessions, if we can change system clock or mock the updatedAt string inside mockSessions:
    // How can we access mockSessions? It is an internal variable. But we can modify firestoreClient to export the mock maps in test mode!
    // Or we can just mock Date.now. Let's look at mock Date.now:
    const originalDateNow = Date.now;
    try {
      // 1. Create a session now
      await saveSession(888888, { state: 'AWAITING_PROJECT_NAME' });
      
      // 2. Mock Date.now to be 6 minutes in the future
      Date.now = () => originalDateNow() + 6 * 60 * 1000;
      
      const expiredSession = await loadSession(888888);
      if (expiredSession !== null) {
        throw new Error(`Test 6 Failed: Session did not expire. Session content: ${JSON.stringify(expiredSession)}`);
      }
      console.log('✅ Test 6 passed successfully!\n');
    } finally {
      Date.now = originalDateNow;
    }

    // ─── SLICE 3 TESTS ───
    console.log('--- Test 7: Voice Note Filler Word Stripping ---');
    const { stripFillerWords } = require('../src/sensors/voiceProcessor');
    const fillerInput = 'ờ uhm tôi cần làm giao diện đăng nhập cho PRJ226 à trước thứ 6';
    const fillerOutput = stripFillerWords(fillerInput);
    console.log(`[Test 7] Input:  "${fillerInput}"`);
    console.log(`[Test 7] Output: "${fillerOutput}"`);

    // The cleaned text should NOT contain filler words
    if (fillerOutput.includes(' ờ ') || fillerOutput.includes(' uhm ') || fillerOutput.startsWith('ờ ')) {
      throw new Error(`Test 7 Failed: Filler words still present in output: "${fillerOutput}"`);
    }
    // The cleaned text SHOULD still contain the essential content
    if (!fillerOutput.includes('PRJ226') || !fillerOutput.includes('giao diện đăng nhập')) {
      throw new Error(`Test 7 Failed: Essential content was stripped: "${fillerOutput}"`);
    }
    console.log('✅ Test 7 passed successfully!\n');


    console.log('--- Test 8: Voice Note End-to-End Task Capture ---');
    clearSentMessages();
    const reqVoice: any = {
      path: '/webhook',
      body: {
        message: {
          chat: { id: 999999 },
          message_id: 1008,
          voice: {
            file_id: 'voice-file-abc123',
            duration: 5,
            mime_type: 'audio/ogg',
          },
        },
      },
    };
    const resVoice = mockRes();
    await helloHttp(reqVoice, resVoice);

    console.log('Messages sent:', JSON.stringify(sentMessages, null, 2));
    // Expect: (1) "Đang nghe voice note..." (2) "Liam nghe được: <transcription>" (3) "Đang phân tích task..." (4) "Task created..."
    if (sentMessages.length < 3) {
      throw new Error(`Test 8 Failed: Expected at least 3 messages (voice ack + transcription + task flow), got ${sentMessages.length}`);
    }
    if (!sentMessages[0].text.includes('voice note')) {
      throw new Error(`Test 8 Failed: First message should acknowledge voice note, got: "${sentMessages[0].text}"`);
    }
    if (!sentMessages[1].text.includes('Liam nghe')) {
      throw new Error(`Test 8 Failed: Second message should show transcription, got: "${sentMessages[1].text}"`);
    }
    // The voice mock returns text containing PRJ226, which triggers autonomous task capture
    const lastMsg = sentMessages[sentMessages.length - 1];
    if (!lastMsg.text.includes('Task created')) {
      throw new Error(`Test 8 Failed: Final message should confirm task creation, got: "${lastMsg.text}"`);
    }
    console.log('✅ Test 8 passed successfully!\n');

    // ─── SLICE 4 TESTS ───
    console.log('--- Test 9: Low-Confidence Intent Triggers HITL Keyboard ---');
    clearSentMessages();
    const reqAmbiguous: any = {
      path: '/webhook',
      body: {
        message: {
          chat: { id: 999999 },
          text: 'có thể cần viết email cho khách hàng',
          message_id: 1009,
        },
      },
    };
    const resAmbiguous = mockRes();
    await helloHttp(reqAmbiguous, resAmbiguous);

    console.log('Messages sent:', JSON.stringify(sentMessages, null, 2));
    // Should produce exactly 1 message: the HITL clarification with inline keyboard
    if (sentMessages.length !== 1) {
      throw new Error(`Test 9 Failed: Expected 1 HITL message, got ${sentMessages.length}`);
    }
    if (!sentMessages[0].text.includes('chưa chắc chắn')) {
      throw new Error(`Test 9 Failed: HITL message should mention uncertainty, got: "${sentMessages[0].text}"`);
    }
    // Verify inline keyboard has intent options + cancel button
    const hitlKeyboard = sentMessages[0].replyMarkup?.inline_keyboard;
    if (!hitlKeyboard || hitlKeyboard.length < 3) {
      throw new Error(`Test 9 Failed: Expected at least 3 keyboard rows (intents + cancel), got ${hitlKeyboard?.length}`);
    }
    // Last button must be the cancel button
    const lastRow = hitlKeyboard[hitlKeyboard.length - 1];
    if (!lastRow[0] || lastRow[0].callback_data !== 'hitl_cancel') {
      throw new Error(`Test 9 Failed: Last keyboard row should be cancel button, got: ${JSON.stringify(lastRow)}`);
    }

    // Verify session was persisted
    const hitlSession = await loadSession(999999);
    if (!hitlSession || hitlSession.state !== 'AWAITING_HITL_CONFIRMATION') {
      throw new Error(`Test 9 Failed: Session should be AWAITING_HITL_CONFIRMATION, got: ${JSON.stringify(hitlSession)}`);
    }
    console.log('✅ Test 9 passed successfully!\n');


    console.log('--- Test 10: HITL Confirm Callback Routes Intent ---');
    clearSentMessages();
    const reqHitlConfirm: any = {
      path: '/webhook',
      body: {
        callback_query: {
          id: 'cb-hitl-confirm',
          message: {
            chat: { id: 999999 },
            message_id: 1010,
          },
          data: 'hitl_confirm:Add Task',
        },
      },
    };
    const resHitlConfirm = mockRes();
    await helloHttp(reqHitlConfirm, resHitlConfirm);

    console.log('Messages sent:', JSON.stringify(sentMessages, null, 2));
    // Should produce messages: editMessageText confirmation + task flow messages
    if (sentMessages.length < 2) {
      throw new Error(`Test 10 Failed: Expected at least 2 messages (confirm + task), got ${sentMessages.length}`);
    }
    if (!sentMessages[0].text.includes('Đã xác nhận')) {
      throw new Error(`Test 10 Failed: First message should confirm intent, got: "${sentMessages[0].text}"`);
    }

    // Verify the HITL session was consumed and replaced by a task flow session
    // (because the text has no project match, it enters AWAITING_PROJECT_SELECTION)
    const postHitlSession = await loadSession(999999);
    if (!postHitlSession || postHitlSession.state === 'AWAITING_HITL_CONFIRMATION') {
      throw new Error(`Test 10 Failed: HITL session should be consumed and replaced by task flow, got: ${JSON.stringify(postHitlSession)}`);
    }
    if (postHitlSession.state !== 'AWAITING_PROJECT_SELECTION') {
      throw new Error(`Test 10 Failed: Expected AWAITING_PROJECT_SELECTION after confirm routing, got: ${postHitlSession.state}`);
    }
    // Clean up for next test
    const { deleteSession } = require('../src/tools/firestoreClient');
    await deleteSession(999999);
    console.log('✅ Test 10 passed successfully!\n');


    console.log('--- Test 11: HITL Cancel Callback Clears Session ---');
    // First, create a fresh HITL session for a different chat
    await saveSession(777777, {
      state: 'AWAITING_HITL_CONFIRMATION',
      originalText: 'test cancel intent',
      classifiedIntent: 'Rescue',
      confidenceScore: 60,
      reasoning: 'Test reasoning',
    });
    clearSentMessages();
    const reqHitlCancel: any = {
      path: '/webhook',
      body: {
        callback_query: {
          id: 'cb-hitl-cancel',
          message: {
            chat: { id: 777777 },
            message_id: 1011,
          },
          data: 'hitl_cancel',
        },
      },
    };
    const resHitlCancel = mockRes();
    await helloHttp(reqHitlCancel, resHitlCancel);

    console.log('Messages sent:', JSON.stringify(sentMessages, null, 2));
    // Should produce editMessageText with "Cancelled."
    if (sentMessages.length !== 1) {
      throw new Error(`Test 11 Failed: Expected 1 message (cancelled), got ${sentMessages.length}`);
    }
    if (!sentMessages[0].text.includes('Cancelled')) {
      throw new Error(`Test 11 Failed: Message should say Cancelled, got: "${sentMessages[0].text}"`);
    }

    // Verify session was deleted
    const cancelledSession = await loadSession(777777);
    if (cancelledSession !== null) {
      throw new Error(`Test 11 Failed: Session should be deleted after cancel, got: ${JSON.stringify(cancelledSession)}`);
    }
    console.log('✅ Test 11 passed successfully!\n');

    // ─── SLICE 5 TESTS ───
    console.log('--- Test 12: Weekly Planning Triggers Draft ---');
    clearSentMessages();
    const reqWeekly: any = {
      path: '/webhook',
      body: {
        message: {
          chat: { id: 111222 },
          text: 'lên kế hoạch tuần này nhé',
          message_id: 1012,
        },
      },
    };
    const resWeekly = mockRes();
    await helloHttp(reqWeekly, resWeekly);

    console.log('Messages sent:', JSON.stringify(sentMessages, null, 2));
    if (sentMessages.length < 2) {
      throw new Error(`Test 12 Failed: Expected analyzing message + preview message, got ${sentMessages.length}`);
    }
    if (!sentMessages[0].text.includes('tối ưu hóa')) {
      throw new Error(`Test 12 Failed: First message should be analyzing prompt, got: "${sentMessages[0].text}"`);
    }
    if (!sentMessages[1].text.includes('Bản nháp lịch trình tuần')) {
      throw new Error(`Test 12 Failed: Second message should be draft preview, got: "${sentMessages[1].text}"`);
    }

    const weeklyKeyboard = sentMessages[1].replyMarkup?.inline_keyboard;
    if (!weeklyKeyboard || weeklyKeyboard.length < 2) {
      throw new Error(`Test 12 Failed: Expected 2 buttons (Approve, Cancel), got ${weeklyKeyboard?.length}`);
    }
    
    // Extract draftId from the callback data
    const approveCallbackData = weeklyKeyboard[0][0].callback_data;
    const draftId = approveCallbackData.split(':')[1];
    if (!draftId) {
      throw new Error(`Test 12 Failed: Could not extract draftId from callback_data: ${approveCallbackData}`);
    }
    
    const { loadDraft } = require('../src/tools/firestoreClient');
    const draft = await loadDraft(draftId);
    if (!draft || draft.length === 0) {
      throw new Error(`Test 12 Failed: Draft not saved to Firestore`);
    }
    console.log('✅ Test 12 passed successfully!\n');


    console.log('--- Test 13: Weekly Planning Cancel Callback ---');
    clearSentMessages();
    const reqWeeklyCancel: any = {
      path: '/webhook',
      body: {
        callback_query: {
          id: 'cb-weekly-cancel',
          message: {
            chat: { id: 111222 },
            message_id: 1013,
          },
          data: `weekly_cancel:${draftId}`,
        },
      },
    };
    const resWeeklyCancel = mockRes();
    await helloHttp(reqWeeklyCancel, resWeeklyCancel);

    console.log('Messages sent:', JSON.stringify(sentMessages, null, 2));
    if (sentMessages.length !== 1) {
      throw new Error(`Test 13 Failed: Expected 1 message (cancelled), got ${sentMessages.length}`);
    }
    
    const draftAfterCancel = await loadDraft(draftId);
    if (draftAfterCancel !== null) {
      throw new Error(`Test 13 Failed: Draft should be deleted after cancel`);
    }
    console.log('✅ Test 13 passed successfully!\n');


    console.log('--- Test 14: Weekly Planning Approve Callback ---');
    // First, recreate a draft for testing approval
    const testDraftId = 'test-draft-999';
    const { saveDraft } = require('../src/tools/firestoreClient');
    await saveDraft(testDraftId, draft); // re-use the draft from test 12
    
    clearSentMessages();
    const reqWeeklyApprove: any = {
      path: '/webhook',
      body: {
        callback_query: {
          id: 'cb-weekly-approve',
          message: {
            chat: { id: 111222 },
            message_id: 1014,
          },
          data: `weekly_approve:${testDraftId}`,
        },
      },
    };
    const resWeeklyApprove = mockRes();
    await helloHttp(reqWeeklyApprove, resWeeklyApprove);

    console.log('Messages sent:', JSON.stringify(sentMessages, null, 2));
    if (sentMessages.length !== 1) {
      throw new Error(`Test 14 Failed: Expected 1 message (success), got ${sentMessages.length}`);
    }
    if (!sentMessages[0].text.includes('Đã đồng bộ thành công')) {
      throw new Error(`Test 14 Failed: Message should confirm sync, got: "${sentMessages[0].text}"`);
    }
    
    const draftAfterApprove = await loadDraft(testDraftId);
    if (draftAfterApprove !== null) {
      throw new Error(`Test 14 Failed: Draft should be deleted after approval`);
    }
    console.log('✅ Test 14 passed successfully!\n');

  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  }

  console.log('=== All Offline Integration Tests passed successfully! ===');
}

runTests();
