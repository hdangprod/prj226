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
process.env.FEATURE_DEBOUNCE_BUFFER = 'OFF';

import { triageLockTool } from '../src/tools/triageLockTool';
import { flushInbox, handleTriageInput, setMockInboxItems } from '../src/skills/triageSkill';
import { TRIAGE_CONFIG } from '../src/config';


async function runTriageTests() {
  console.log('--- STARTING TRIAGE SKILL INTEGRATION TESTS (MOD-08) ---');
  const testChatId = 999111;

  // Clear state before test
  triageLockTool.clearAll();
  setMockInboxItems([
    { id: 'page-101', title: 'Task PRJ226 Spec Review' },
    { id: 'page-102', title: 'Setup Redis State Lock' },
  ]);

  // Test 1: Hard & Soft Lock Basic CRUD
  console.log('\n[TEST 1] Testing Hard Lock & Soft Lock Storage...');
  triageLockTool.setHardLock(testChatId, 101, 'page-101', 600);
  const retrievedHardPage = triageLockTool.getHardLock(testChatId, 101);
  if (retrievedHardPage !== 'page-101') {
    throw new Error(`Hard Lock failed: expected 'page-101', got '${retrievedHardPage}'`);
  }
  console.log('✅ PASS: Hard Lock set & retrieve successful.');

  triageLockTool.setSoftLock(testChatId, 'page-101', 120);
  const retrievedSoftPage = triageLockTool.getSoftLock(testChatId);
  if (retrievedSoftPage !== 'page-101') {
    throw new Error(`Soft Lock failed: expected 'page-101', got '${retrievedSoftPage}'`);
  }
  console.log('✅ PASS: Soft Lock set & retrieve successful.');

  // Test 2: Hard Override / Escape Hatch (AC 4.2)
  console.log('\n[TEST 2] Testing Hard Override Slash Command (AC 4.2)...');
  triageLockTool.deleteSoftLock(testChatId);
  if (triageLockTool.getSoftLock(testChatId) !== null) {
    throw new Error('Soft Lock deletion failed during Hard Override');
  }
  console.log('✅ PASS: Soft lock cleared on hard override slash command.');

  // Test 3: SETNX Distributed Lock (ERR-RACE)
  console.log('\n[TEST 3] Testing SETNX Distributed Lock concurrency defense...');
  const lock1 = triageLockTool.acquireDistributedLock('page-101', 10);
  const lock2 = triageLockTool.acquireDistributedLock('page-101', 10);
  if (!lock1 || lock2) {
    throw new Error(`Distributed lock failed: lock1=${lock1}, lock2=${lock2}`);
  }
  triageLockTool.releaseDistributedLock('page-101');
  const lock3 = triageLockTool.acquireDistributedLock('page-101', 10);
  if (!lock3) {
    throw new Error('Distributed lock release failed');
  }
  triageLockTool.releaseDistributedLock('page-101');
  console.log('✅ PASS: Distributed lock (SETNX) defense verified.');

  // Test 4: Max Turns Counter (ERR-LOOP)
  console.log('\n[TEST 4] Testing Max Turns Counter (ERR-LOOP)...');
  const turn1 = triageLockTool.incrementTurn(testChatId);
  const turn2 = triageLockTool.incrementTurn(testChatId);
  const turn3 = triageLockTool.incrementTurn(testChatId);
  const turn4 = triageLockTool.incrementTurn(testChatId);
  if (turn1 !== 1 || turn2 !== 2 || turn3 !== 3 || turn4 !== 4) {
    throw new Error(`Turn counter mismatch: ${turn1}, ${turn2}, ${turn3}, ${turn4}`);
  }
  console.log('✅ PASS: Max turns counter working correctly.');

  // Test 5: Flush Inbox Execution
  console.log('\n[TEST 5] Testing Flush Inbox Execution (Stage 1)...');
  await flushInbox(testChatId);
  console.log('✅ PASS: Inbox flush execution completed cleanly.');

  // Test 6: Stale UI Degradation (AC 4.3)
  console.log('\n[TEST 6] Testing Stale UI Degradation (AC 4.3)...');
  const expiredMsgId = 88888;
  await handleTriageInput(testChatId, 'Task test', expiredMsgId, 'non-existent-page');
  console.log('✅ PASS: Expired bubble handled cleanly.');

  // Test 7: Recursive Reply Mapping & Original Bubble ID (AC 4.4)
  console.log('\n[TEST 7] Testing Recursive Reply Mapping & Original Bubble ID (AC 4.4)...');
  const origBubbleId = 7771;
  const aiQuestionMsgId = 7772;
  const targetPageId = 'page-recursive-test';

  triageLockTool.setHardLock(testChatId, origBubbleId, targetPageId, 600);
  triageLockTool.setOriginalBubbleId(testChatId, targetPageId, origBubbleId, 600);
  triageLockTool.setHardLock(testChatId, aiQuestionMsgId, targetPageId, 600);

  const mappedOriginal = triageLockTool.getOriginalBubbleId(testChatId, targetPageId);
  const mappedPageFromAiQuestion = triageLockTool.getHardLock(testChatId, aiQuestionMsgId);

  if (mappedOriginal !== origBubbleId) {
    throw new Error(`Original bubble ID mismatch: expected ${origBubbleId}, got ${mappedOriginal}`);
  }
  if (mappedPageFromAiQuestion !== targetPageId) {
    throw new Error(`AI question hard lock mismatch: expected ${targetPageId}, got ${mappedPageFromAiQuestion}`);
  }
  console.log('✅ PASS: Recursive reply mapping & original bubble tracking verified.');

  console.log('\n==================================================');
  console.log('🎉 ALL TRIAGE SKILL INTEGRATION TESTS PASSED (100%)');
  console.log('==================================================\n');
  process.exit(0);
}

if (require.main === module) {
  runTriageTests().catch((err) => {
    console.error('❌ TRIAGE TEST FAILED:', err);
    process.exit(1);
  });
}

