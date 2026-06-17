import { addTaskFromText, planWeekDraft, bulkCreateTasks } from '../src/services/taskService';
import { generateWeeklyReport } from '../src/services/reportService';

async function runTests() {
  console.log('=== Starting Local Mock Tests ===\n');
  const today = new Date().toISOString().split('T')[0];

  try {
    // 1. Test Single Task Parsing (FR-1)
    console.log('--- Test 1: Single Task Parsing (FR-1) ---');
    const taskId = await addTaskFromText(
      'Làm giao diện đăng nhập cho dự án PRJ226 vào ngày mai, priority High, 2 hours',
      today
    );
    console.log('Created Task ID:', taskId, '\n');

    // 2. Test Weekly Plan Preview (FR-7)
    console.log('--- Test 2: Weekly Plan Preview (FR-7) ---');
    const drafts = await planWeekDraft(
      'Tuần này tôi cần làm 2 việc cho PRJ226: 1 là viết API cho user login (mất tầm 3h, High), 2 là viết document cho API đó (mất 1h, Low).',
      today
    );
    console.log('Parsed Draft Tasks:', JSON.stringify(drafts, null, 2), '\n');

    // 3. Test Generate Weekly Report (FR-6)
    console.log('--- Test 3: Generate Weekly Report (FR-6) ---');
    const report = await generateWeeklyReport();
    console.log('Report:\n', report, '\n');

  } catch (error) {
    console.error('Error during local tests:', error);
  }

  console.log('=== Local Tests Complete ===');
}

runTests();
