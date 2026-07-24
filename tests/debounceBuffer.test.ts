/**
 * PRD MOD-07: Serverless Debounce Buffer — Integration Test Suite
 *
 * Tests cover all 4 PRD Acceptance Criteria (Section 4) plus fail-safe scenarios (Section 5).
 * Test numbering continues from existing suites (Tests 1-14 in localTest.ts, 15-21 in triageSkill.test.ts).
 *
 * Each test uses the same mock infrastructure as localTest.ts:
 *   - QUEUE_MODE=sync for synchronous execution
 *   - NODE_ENV=test for in-memory Redis/QStash/Telegram mocks
 */

// Set up test environment BEFORE any config-dependent imports
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
// Enable debounce buffer for tests
process.env.FEATURE_DEBOUNCE_BUFFER = 'ON';
process.env.DEBOUNCE_BUFFER_TIME_MS = '4000';

const { helloHttp } = require('../src/index');
const { sentMessages, clearSentMessages } = require('../src/tools/telegramClient');
const { resetMockState } = require('../src/tools/redisClient');
const { scheduledJobs, clearScheduledJobs } = require('../src/tools/qstashClient');
const { ingestMessage, processBuffer, isDebounceEnabled } = require('../src/sensors/debounceBuffer');
const {
  rpushBuffer,
  setBufferTime,
  getBufferTime,
  flushBuffer,
  getBufferLength,
  setTranscribingLock,
  clearTranscribingLock,
  isTranscribing,
} = require('../src/tools/redisClient');

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

function makeTextPayload(chatId: number, text: string, extras: any = {}) {
  return {
    message: {
      chat: { id: chatId },
      text,
      message_id: Math.floor(Math.random() * 100000),
      ...extras,
    },
  };
}

function makeVoicePayload(chatId: number, fileId: string) {
  return {
    message: {
      chat: { id: chatId },
      message_id: Math.floor(Math.random() * 100000),
      voice: {
        file_id: fileId,
        duration: 5,
        mime_type: 'audio/ogg',
      },
    },
  };
}

function makeReplyPayload(chatId: number, text: string, replyToMessageId: number) {
  return {
    message: {
      chat: { id: chatId },
      text,
      message_id: Math.floor(Math.random() * 100000),
      reply_to_message_id: replyToMessageId,
    },
  };
}

async function runDebounceTests() {
  console.log('=== Starting Debounce Buffer Integration Tests (MOD-07) ===\n');

  try {
    // ─── TEST 22: AC 4.1 — Standard Debounce (3 messages → 1 merged payload) ───
    console.log('--- Test 22: Standard Debounce — 3 messages batched into 1 merged payload ---');
    resetMockState();
    clearSentMessages();
    clearScheduledJobs();

    const chatId22 = 220001;
    const originalDateNow = Date.now;
    let mockTime = originalDateNow();

    try {
      Date.now = () => mockTime;

      // Message 1 at T=0s
      const payload1 = makeTextPayload(chatId22, 'Nhắc tôi');
      const result1 = await ingestMessage(payload1);
      if (result1 !== 'buffered') throw new Error(`Test 22 Failed: Expected 'buffered', got '${result1}'`);

      // Verify first message triggers typing indicator
      const chatActionMsg = sentMessages.find((m: any) => m.text === '__chat_action:typing');
      if (!chatActionMsg) throw new Error('Test 22 Failed: No typing indicator sent on first message');

      // Message 2 at T=1s
      mockTime += 1000;
      const payload2 = makeTextPayload(chatId22, 'mua sữa');
      await ingestMessage(payload2);

      // Message 3 at T=2s
      mockTime += 1000;
      const payload3 = makeTextPayload(chatId22, 'trên đường về nhà');
      await ingestMessage(payload3);

      // Verify 3 QStash jobs were scheduled (one per ingest)
      if (scheduledJobs.length !== 3) {
        throw new Error(`Test 22 Failed: Expected 3 scheduled jobs, got ${scheduledJobs.length}`);
      }

      // Verify buffer has 3 messages
      const bufLen = await getBufferLength(chatId22);
      if (bufLen !== 3) throw new Error(`Test 22 Failed: Expected buffer length 3, got ${bufLen}`);

      // Simulate T=4s: First QStash callback fires (scheduled at T=0 + 4s delay)
      // At T=4s, elapsed since last message (T=2) = 2s < 4s → silent exit
      mockTime += 2000; // Now at T=4s
      clearSentMessages();
      await processBuffer(chatId22);

      // Buffer should still exist (timer exited silently)
      const bufLen2 = await getBufferLength(chatId22);
      if (bufLen2 !== 3) throw new Error(`Test 22 Failed: Buffer should still exist after early timer, got length ${bufLen2}`);

      // Simulate T=6s: Third QStash callback fires (scheduled at T=2 + 4s delay)
      // At T=6s, elapsed since last message (T=2) = 4s >= 4s → flush!
      mockTime += 2000; // Now at T=6s
      await processBuffer(chatId22);

      // Verify merged payload was processed
      // sentMessages should now contain the intent router output
      // (which processes "Nhắc tôi\nmua sữa\ntrên đường về nhà")
      const bufLen3 = await getBufferLength(chatId22);
      if (bufLen3 !== 0) throw new Error(`Test 22 Failed: Buffer should be empty after flush, got length ${bufLen3}`);

      console.log('✅ Test 22 passed successfully!\n');
    } finally {
      Date.now = originalDateNow;
    }


    // ─── TEST 23: AC 4.2 — Debounce Interruption (Silent Exit) ───
    console.log('--- Test 23: Debounce Interruption — Timer 1 exits silently ---');
    resetMockState();
    clearSentMessages();
    clearScheduledJobs();

    const chatId23 = 230001;
    const origNow23 = Date.now;
    let time23 = origNow23();

    try {
      Date.now = () => time23;

      // Message 1 at T=0
      await ingestMessage(makeTextPayload(chatId23, 'Hello'));
      if (scheduledJobs.length !== 1) throw new Error('Test 23 Failed: Expected 1 scheduled job');

      // Message 2 at T=2s (within debounce window)
      time23 += 2000;
      await ingestMessage(makeTextPayload(chatId23, 'World'));
      if (scheduledJobs.length !== 2) throw new Error('Test 23 Failed: Expected 2 scheduled jobs');

      // Timer 1 fires at T=4s (scheduled at T=0 + 4s)
      // Elapsed since last message (T=2) = 2s < 4s → MUST exit silently
      time23 += 2000;
      clearSentMessages();
      await processBuffer(chatId23);

      // Buffer must still be intact
      const len = await getBufferLength(chatId23);
      if (len !== 2) throw new Error(`Test 23 Failed: Buffer should still have 2 messages, got ${len}`);

      // Timer 2 fires at T=6s (scheduled at T=2 + 4s)
      // Elapsed since last message (T=2) = 4s >= 4s → FLUSH
      time23 += 2000;
      await processBuffer(chatId23);

      const len2 = await getBufferLength(chatId23);
      if (len2 !== 0) throw new Error(`Test 23 Failed: Buffer should be empty after flush, got ${len2}`);

      console.log('✅ Test 23 passed successfully!\n');
    } finally {
      Date.now = origNow23;
    }


    // ─── TEST 24: AC 4.3 — Reply Bypass ───
    console.log('--- Test 24: Reply Bypass — reply_to_message_id skips debounce ---');
    resetMockState();
    clearSentMessages();
    clearScheduledJobs();

    const chatId24 = 240001;
    const reqReply: any = {
      path: '/webhook',
      body: makeReplyPayload(chatId24, '/start', 5001),
    };
    const resReply = mockRes();
    await helloHttp(reqReply, resReply);

    // Should have processed directly (no buffer involvement)
    if (scheduledJobs.length !== 0) {
      throw new Error(`Test 24 Failed: Reply should bypass debounce. Got ${scheduledJobs.length} scheduled jobs.`);
    }

    // Buffer should be empty
    const replyBufLen = await getBufferLength(chatId24);
    if (replyBufLen !== 0) {
      throw new Error(`Test 24 Failed: Buffer should be empty for reply bypass, got ${replyBufLen}`);
    }

    // Verify the message was actually processed (sentMessages should have /start response)
    if (sentMessages.length === 0) {
      throw new Error('Test 24 Failed: Reply message was not processed at all');
    }

    console.log('✅ Test 24 passed successfully!\n');


    // ─── TEST 25: AC 4.4 — Chat Action Trigger ───
    console.log('--- Test 25: Chat Action Trigger — typing indicator on first message ---');
    resetMockState();
    clearSentMessages();
    clearScheduledJobs();

    const chatId25 = 250001;
    const payload25 = makeTextPayload(chatId25, 'Lên kế hoạch cho tôi');
    await ingestMessage(payload25);

    // Check that sendChatAction('typing') was called
    const typingActions = sentMessages.filter((m: any) => m.text === '__chat_action:typing' && m.chatId === chatId25);
    if (typingActions.length !== 1) {
      throw new Error(`Test 25 Failed: Expected 1 typing action, got ${typingActions.length}. Messages: ${JSON.stringify(sentMessages)}`);
    }

    // Send a second message — should NOT trigger another typing action
    clearSentMessages();
    const payload25b = makeTextPayload(chatId25, 'cho tuần tới');
    await ingestMessage(payload25b);

    const typingActions2 = sentMessages.filter((m: any) => m.text === '__chat_action:typing');
    if (typingActions2.length !== 0) {
      throw new Error(`Test 25 Failed: Second message should NOT trigger typing. Got ${typingActions2.length} actions.`);
    }

    console.log('✅ Test 25 passed successfully!\n');


    // ─── TEST 26: ERR-02 — Spam Protection ───
    console.log('--- Test 26: Spam Protection — 16th message dropped ---');
    resetMockState();
    clearSentMessages();
    clearScheduledJobs();

    const chatId26 = 260001;
    const origNow26 = Date.now;
    let time26 = origNow26();

    try {
      Date.now = () => time26;

      // Push 15 messages (max buffer size)
      for (let i = 1; i <= 15; i++) {
        await ingestMessage(makeTextPayload(chatId26, `msg-${i}`));
      }

      // Verify buffer has exactly 15 messages
      const len15 = await getBufferLength(chatId26);
      if (len15 !== 15) throw new Error(`Test 26 Failed: Expected buffer length 15, got ${len15}`);

      // 16th message should be silently dropped
      clearSentMessages();
      const result16 = await ingestMessage(makeTextPayload(chatId26, 'msg-16-should-be-dropped'));
      if (result16 !== 'buffered') throw new Error(`Test 26 Failed: Expected 'buffered', got '${result16}'`);

      const len16 = await getBufferLength(chatId26);
      if (len16 !== 15) throw new Error(`Test 26 Failed: Buffer should still be 15 after spam drop, got ${len16}`);

      console.log('✅ Test 26 passed successfully!\n');
    } finally {
      Date.now = origNow26;
    }


    // ─── TEST 27: ERR-05 — Fail-Open Fallback ───
    console.log('--- Test 27: Fail-Open Fallback — Redis unavailable triggers direct dispatch ---');
    resetMockState();
    clearSentMessages();
    clearScheduledJobs();

    const chatId27 = 270001;
    // Simulate Redis failure by temporarily overriding isRedisAvailable
    const redisClient = require('../src/tools/redisClient');
    const originalIsAvailable = redisClient.isRedisAvailable;
    redisClient.isRedisAvailable = async () => false;

    try {
      const payload27 = makeTextPayload(chatId27, 'Emergency message');
      const result = await ingestMessage(payload27);

      if (result !== 'fallback') {
        throw new Error(`Test 27 Failed: Expected 'fallback' when Redis is down, got '${result}'`);
      }

      // No QStash jobs should be scheduled
      if (scheduledJobs.length !== 0) {
        throw new Error(`Test 27 Failed: No QStash jobs should be scheduled during fallback, got ${scheduledJobs.length}`);
      }

      // Verify through helloHttp that fallback dispatches directly
      clearSentMessages();
      const reqFallback: any = {
        path: '/webhook',
        body: makeTextPayload(chatId27, '/start'),
      };
      const resFallback = mockRes();
      await helloHttp(reqFallback, resFallback);

      // In fail-open mode, the /start command should still be processed
      if (sentMessages.length === 0) {
        throw new Error('Test 27 Failed: Fail-open should dispatch directly. No messages sent.');
      }

      console.log('✅ Test 27 passed successfully!\n');
    } finally {
      redisClient.isRedisAvailable = originalIsAvailable;
    }


    // ─── TEST 28: Voice Transcription Lock ───
    console.log('--- Test 28: Voice Transcription Lock — timer suppressed during STT ---');
    resetMockState();
    clearSentMessages();
    clearScheduledJobs();

    const chatId28 = 280001;

    // Ingest a voice note (mock transcription returns text with PRJ226)
    const voicePayload = makeVoicePayload(chatId28, 'voice-debounce-test');
    const voiceResult = await ingestMessage(voicePayload);

    if (voiceResult !== 'buffered') {
      throw new Error(`Test 28 Failed: Expected 'buffered', got '${voiceResult}'`);
    }

    // After transcription completes, lock should be cleared
    const stillTranscribing = await isTranscribing(chatId28);
    if (stillTranscribing) {
      throw new Error('Test 28 Failed: Transcription lock should be cleared after STT completes');
    }

    // Buffer should contain the transcribed text
    const bufLen28 = await getBufferLength(chatId28);
    if (bufLen28 !== 1) {
      throw new Error(`Test 28 Failed: Expected 1 message in buffer (transcribed text), got ${bufLen28}`);
    }

    // A QStash job should have been scheduled after transcription completed
    if (scheduledJobs.length !== 1) {
      throw new Error(`Test 28 Failed: Expected 1 QStash job after transcription, got ${scheduledJobs.length}`);
    }

    // Verify typing/record_voice action was sent
    const voiceAction = sentMessages.find((m: any) => m.text === '__chat_action:record_voice' && m.chatId === chatId28);
    if (!voiceAction) {
      throw new Error('Test 28 Failed: Expected record_voice chat action for voice note');
    }

    console.log('✅ Test 28 passed successfully!\n');


    // ─── TEST 29: Feature Flag Kill-Switch ───
    console.log('--- Test 29: Feature Flag — kill-switch disables debounce ---');
    resetMockState();
    clearSentMessages();
    clearScheduledJobs();

    const chatId29 = 290001;

    // Monkey-patch DEBOUNCE_CONFIG to simulate kill-switch OFF
    // (Config is cached at import time, so we must patch the object directly)
    const debounceConfig = require('../src/config').DEBOUNCE_CONFIG;
    const origFeatureFlag = debounceConfig.FEATURE_DEBOUNCE_BUFFER;

    // Use Object.defineProperty since DEBOUNCE_CONFIG is `as const`
    Object.defineProperty(debounceConfig, 'FEATURE_DEBOUNCE_BUFFER', {
      value: false,
      writable: true,
      configurable: true,
    });

    try {
      // Verify isDebounceEnabled returns false when kill-switch is off
      if (isDebounceEnabled(chatId29)) {
        throw new Error('Test 29 Failed: isDebounceEnabled should return false when kill-switch is off');
      }

      // Send a /start message through helloHttp — it should bypass debounce entirely
      const reqDisabled: any = {
        path: '/webhook',
        body: makeTextPayload(chatId29, '/start'),
      };
      const resDisabled = mockRes();
      await helloHttp(reqDisabled, resDisabled);

      // With debounce disabled, /start goes through dispatch(sync) → handleWorkerPayload → welcome message
      if (sentMessages.length === 0) {
        throw new Error('Test 29 Failed: /start message should have been processed directly');
      }
      if (!sentMessages[0].text.includes('Chào Sếp')) {
        throw new Error(`Test 29 Failed: Expected welcome message, got: "${sentMessages[0].text}"`);
      }

      // No QStash jobs should be scheduled
      if (scheduledJobs.length !== 0) {
        throw new Error(`Test 29 Failed: No QStash jobs when debounce is disabled, got ${scheduledJobs.length}`);
      }

      console.log('✅ Test 29 passed successfully!\n');
    } finally {
      // Restore original value
      Object.defineProperty(debounceConfig, 'FEATURE_DEBOUNCE_BUFFER', {
        value: origFeatureFlag,
        writable: true,
        configurable: true,
      });
    }

  } catch (error) {
    console.error('❌ Debounce Buffer test execution failed:', error);
    process.exit(1);
  }

  console.log('=== All Debounce Buffer Integration Tests passed successfully! ===');
  process.exit(0);
}

runDebounceTests();
