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
  console.log('=== Starting Offline Integration Tests (Slice 1 & 2) ===\n');

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

  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  }

  console.log('=== All Offline Integration Tests passed successfully! ===');
}

runTests();
