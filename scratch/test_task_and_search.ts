/**
 * Offline End-to-End Test Suite for PRJ226 Knowledge Search & Task Synthesis
 */
import { extractSearchKeywords } from '../src/lib/querySanitizer';

function runTestSuite() {
  console.log('=== Step 1: Testing Query Sanitizer on User Queries ===');

  const testCases = [
    { input: 'Do I have any note relates to PRJ226?', expectedTopic: 'PRJ226' },
    { input: 'Task - doing competitive research for PRJ226', expectedTopic: 'competitive research PRJ226' },
    { input: 'find notes about Cloudflare Workers', expectedTopic: 'Cloudflare Workers' },
  ];

  let passedCount = 0;
  for (const tc of testCases) {
    const { cleanTopic, ftsQuery } = extractSearchKeywords(tc.input);
    const pass = cleanTopic.toLowerCase() === tc.expectedTopic.toLowerCase();
    if (pass) {
      console.log(`✅ Passed: "${tc.input}" -> Clean Topic: "${cleanTopic}" (FTS: ${ftsQuery})`);
      passedCount++;
    } else {
      console.error(`❌ Failed: "${tc.input}" -> Expected "${tc.expectedTopic}", got "${cleanTopic}"`);
    }
  }

  console.log(`\n=== Test Summary: ${passedCount}/${testCases.length} Passed ===`);
  if (passedCount < testCases.length) {
    process.exit(1);
  }
}

runTestSuite();
