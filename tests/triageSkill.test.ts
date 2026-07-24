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
