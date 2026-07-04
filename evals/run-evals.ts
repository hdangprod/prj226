import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
// Load environment variables for the live Gemini API key
dotenv.config();

// Enforce non-test environment to hit the live Gemini LITE model
process.env.NODE_ENV = 'evals';
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'mock';
process.env.NOTION_API_KEY = process.env.NOTION_API_KEY || 'mock';
process.env.NOTION_TASKS_DB_ID = process.env.NOTION_TASKS_DB_ID || 'mock';
process.env.NOTION_PROJECTS_DB_ID = process.env.NOTION_PROJECTS_DB_ID || 'mock';
process.env.NOTION_AREAS_DB_ID = process.env.NOTION_AREAS_DB_ID || 'mock';
process.env.NOTION_RESOURCES_DB_ID = process.env.NOTION_RESOURCES_DB_ID || 'mock';
process.env.NOTION_DAILY_LOGS_DB_ID = process.env.NOTION_DAILY_LOGS_DB_ID || 'mock';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'mock';

import { classifyIntent } from '../src/gemini/client';

interface TestCase {
  text: string;
  expectedIntent: string;
}

async function runEvals() {
  console.log('🚀 Starting Intent Routing Evaluation Suite...\n');

  const datasetPath = path.join(__dirname, 'golden-dataset.json');
  if (!fs.existsSync(datasetPath)) {
    console.error('❌ Golden dataset not found at:', datasetPath);
    process.exit(1);
  }

  const dataset: TestCase[] = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
  const total = dataset.length;
  console.log(`Loaded ${total} ground-truth test cases.\n`);

  let correctCount = 0;
  let falsePositives = 0;
  let falseNegatives = 0;

  // We process sequentially to avoid rate-limiting issues, though we could batch.
  for (let i = 0; i < total; i++) {
    const { text, expectedIntent } = dataset[i];
    process.stdout.write(`[${i + 1}/${total}] Evaluating: "${text.substring(0, 40)}${text.length > 40 ? '...' : ''}" `);

    let result;
    let attempts = 0;
    while (attempts < 3) {
      try {
        result = await classifyIntent(text);
        if (result.intent !== 'Unknown' || expectedIntent === 'Unknown') {
           break; // Success or genuine unknown
        } else {
           // classifyIntent caught an error internally and returned Unknown
           throw new Error("Internal classifyIntent error (likely 429)");
        }
      } catch (err) {
        attempts++;
        console.log(`\n   ⚠️ API Rate Limit / Error. Retrying in 60s... (${attempts}/3)`);
        await new Promise(resolve => setTimeout(resolve, 60000));
      }
    }
    
    if (!result) {
       result = { intent: 'Unknown', confidence_score: 0, reasoning: 'Failed after retries' };
    }

    if (result.intent === expectedIntent) {
      correctCount++;
      console.log(`✅ Passed (Got ${result.intent}, Conf: ${result.confidence_score}%)`);
    } else {
      console.log(`❌ Failed (Expected: ${expectedIntent}, Got: ${result.intent}, Conf: ${result.confidence_score}%)`);
      console.log(`   Reasoning: ${result.reasoning}`);
      
      if (expectedIntent === 'Unknown' && result.intent !== 'Unknown') falsePositives++;
      if (expectedIntent !== 'Unknown' && result.intent === 'Unknown') falseNegatives++;
    }
    
    // Strict throttle for live API calls to prevent 429 Too Many Requests
    await new Promise(resolve => setTimeout(resolve, 4500));
  }

  const accuracy = (correctCount / total) * 100;
  console.log('\n=========================================');
  console.log('🏆 Evaluation Complete');
  console.log('=========================================');
  console.log(`Total Cases: ${total}`);
  console.log(`Passed:      ${correctCount}`);
  console.log(`Failed:      ${total - correctCount}`);
  console.log(`Accuracy:    ${accuracy.toFixed(2)}%`);
  console.log(`False Positives: ${falsePositives}`);
  console.log(`False Negatives: ${falseNegatives}`);
  console.log('=========================================\n');

  // Hard-locked accuracy threshold: >= 95%
  if (accuracy >= 95) {
    console.log('✅ Status: PASSED (Met >= 95% threshold)');
    process.exit(0);
  } else {
    console.error(`❌ Status: FAILED (Accuracy ${accuracy.toFixed(2)}% is below 95% threshold)`);
    process.exit(1);
  }
}

runEvals();
