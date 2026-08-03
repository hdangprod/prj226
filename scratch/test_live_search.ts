import { extractSearchKeywords } from '../src/lib/querySanitizer';

const queries = [
  'Do I have any note relates to PRJ226?',
  'PRJ226',
  'Task - doing competitive research for PRJ226',
];

console.log('=== Query Sanitizer Verification ===');
for (const q of queries) {
  const { cleanTopic, ftsQuery } = extractSearchKeywords(q);
  console.log(`Original: "${q}"`);
  console.log(`Cleaned:  "${cleanTopic}"`);
  console.log(`FTS Query: "${ftsQuery}"\n`);
}
