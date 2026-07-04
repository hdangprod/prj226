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
  console.log('=== Starting Offline integration Tests (Slice 1) ===\n');

  try {
    // 1. Test Webhook webhook receipt of /start command
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

    console.log('HTTP Status Code:', resStart.statusCode);
    console.log('HTTP Response:', resStart.sentContent);
    console.log('Messages sent to Telegram:', JSON.stringify(sentMessages, null, 2));

    if (resStart.statusCode !== 200) {
      throw new Error(`Expected HTTP 200, got ${resStart.statusCode}`);
    }
    if (sentMessages.length !== 1) {
      throw new Error(`Expected 1 sent message, got ${sentMessages.length}`);
    }
    if (!sentMessages[0].text.includes('Chào Sếp! Tôi là Liam')) {
      throw new Error(`Expected welcome message, got "${sentMessages[0].text}"`);
    }
    console.log('✅ Test 1 passed successfully!\n');

    // 2. Test Global Error Reporting (Global Catch)
    console.log('--- Test 2: Global Error Catch & Notification ---');
    clearSentMessages();

    // Trigger post-chatId crash inside intentRouter
    const reqCrashAfterChatId: any = {
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
    const resCrashAfterChatId = mockRes();

    await helloHttp(reqCrashAfterChatId, resCrashAfterChatId);

    console.log('HTTP Status Code:', resCrashAfterChatId.statusCode);
    console.log('HTTP Response:', resCrashAfterChatId.sentContent);
    console.log('Messages sent to Telegram during post-chatId crash:', JSON.stringify(sentMessages, null, 2));

    if (sentMessages.length !== 1) {
      throw new Error(`Expected 1 sent message for error notification, got ${sentMessages.length}`);
    }
    if (!sentMessages[0].text.includes('Something went wrong')) {
      throw new Error(`Expected error message, got "${sentMessages[0].text}"`);
    }
    console.log('✅ Test 2 passed successfully!\n');

  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  }

  console.log('=== All Offline integration Tests passed successfully! ===');
}

runTests();
