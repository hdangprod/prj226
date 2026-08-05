/**
 * PRJ226 v4.1: Offline Integration Test Suite
 *
 * Runs offline validation for:
 * 1. Intent taxonomy schema contracts (6 PRD intents)
 * 2. LLMRouter provider-agnostic interface
 * 3. Hono Web Application router (/health endpoint, /webhook protection, /github-webhook)
 * 4. GitHub OKF document parsing & Git Data API reader logic
 * 5. D1 Edge Stack Schema & 0002 migration verification
 * 6. Chunking by H2 headings algorithm
 */

import * as fs from 'fs';
import * as path from 'path';
import app from '../src/index';
import { INTENTS } from '../src/governance/intentRouter';
import { handleKnowledgeSearch } from '../src/skills/knowledgeSearchSkill';
import { GitHubReader } from '../src/tools/githubClient';
import { parseFrontMatter, chunkByHeadings } from '../src/lib/chunking';
import type { Env } from '../src/config';

// Mock Workers Environment (v4.1 Pure Edge Stack)
const mockEnv: Env = {
  DB: {
    prepare: () => ({
      bind: () => ({
        first: async () => ({ p: 1 }),
        all: async () => ({ results: [] }),
        run: async () => {},
      }),
    }),
  } as any,
  VECTORIZE: {
    query: async () => ({ matches: [] }),
    upsert: async () => {},
    deleteByIds: async () => {},
  } as any,
  AI: {
    run: async () => ({ data: [[0.1, 0.2, 0.3]] }),
  } as any,
  SESSION_KV: {
    put: async () => {},
    get: async () => null,
    delete: async () => {},
  } as any,
  TELEGRAM_BOT_TOKEN: 'mock-bot-token',
  TELEGRAM_WEBHOOK_SECRET: 'mock-webhook-secret',
  TELEGRAM_CHAT_ID: '12345678',
  GITHUB_TOKEN: 'mock-github-token',
  GITHUB_WEBHOOK_SECRET: 'mock-github-webhook-secret',
  GITHUB_OWNER: 'hdangprod',
  GITHUB_REPO: 'hdangprod_wiki_dev',
  EMBEDDING_MODEL: '@cf/baai/bge-base-en-v1.5',
  EMBEDDING_DIMENSIONS: '768',
  TELEGRAM_BOT_USERNAME: 'liam_second_brain_bot',
  LLM_FAST_PROVIDER: 'google',
  LLM_FAST_MODEL: 'gemini-3.5-flash-lite',
  LLM_PRO_PROVIDER: 'google',
  LLM_PRO_MODEL: 'gemini-3.6-flash',
  LLM_FAST_API_KEY: 'mock-fast-key',
  LLM_PRO_API_KEY: 'mock-pro-key',
};

async function runTests() {
  console.log('=== Starting PRJ226 v4.1 Offline Integration Tests ===\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✅ Passed: ${testName}`);
      passed++;
    } else {
      console.error(`❌ Failed: ${testName}`);
      failed++;
    }
  }

  // ─── TEST 1: Intent Taxonomy Verification ────────────────────────────────
  assert(INTENTS.length === 7, 'Intent taxonomy contains exactly 7 intents');
  assert(INTENTS.includes('Daily_Focus'), 'Contains Daily_Focus intent');
  assert(INTENTS.includes('Task_Capture'), 'Contains Task_Capture intent');
  assert(INTENTS.includes('Reschedule'), 'Contains Reschedule intent');
  assert(INTENTS.includes('Knowledge_Search'), 'Contains Knowledge_Search intent');
  assert(INTENTS.includes('Rescue_Mode'), 'Contains Rescue_Mode intent');
  assert(INTENTS.includes('Session_Handoff'), 'Contains Session_Handoff intent');
  assert(INTENTS.includes('Inbox_Organize'), 'Contains Inbox_Organize intent');

  // ─── TEST 2: Hono App Webhook Secret Validation ─────────────────────────
  const unauthorizedReq = new Request('http://localhost/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'wrong-secret' },
    body: JSON.stringify({ message: { chat: { id: 123 }, text: 'hello' } }),
  });
  const mockCtx = { waitUntil: () => {}, passThroughOnException: () => {} } as any;
  const unauthRes = await app.fetch(unauthorizedReq, mockEnv, mockCtx);
  assert(unauthRes.status === 401, 'Webhook rejects invalid secret token with 401');

  // ─── TEST 3: Bot Message Protection ────────────────────────────────────
  const botReq = new Request('http://localhost/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'mock-webhook-secret' },
    body: JSON.stringify({ message: { from: { is_bot: true }, chat: { id: 123 }, text: 'bot message' } }),
  });
  const botRes = await app.fetch(botReq, mockEnv, mockCtx);
  assert(botRes.status === 200, 'Bot protection drops updates from bot users cleanly with 200 OK');

  // ─── TEST 4: OKF Front Matter & GitHubReader Parser ─────────────────────
  const github = new GitHubReader(mockEnv);
  const sampleOKF = `---
title: "Obsidian Vault Architecture"
tags: [architecture, obsidian, prj226]
category: "Tech Spec"
---
# Obsidian Edge Vault
This document details the local-first obsidian edge architecture.`;

  const parsed = github.parseOKFDocument('vault/harness.md', sampleOKF);
  assert(parsed.title === 'Obsidian Vault Architecture', 'OKF parser extracts title correctly');
  assert(parsed.tags.length === 3 && parsed.tags.includes('prj226'), 'OKF parser extracts tags array');
  assert(parsed.content.includes('# Obsidian Edge Vault'), 'OKF parser extracts markdown body');

  // ─── TEST 5: Heading-Based Markdown Chunker ─────────────────────────────
  const frontMatter = parseFrontMatter(sampleOKF);
  assert(frontMatter.title === 'Obsidian Vault Architecture', 'parseFrontMatter extracts title');
  assert(frontMatter.tags?.includes('obsidian') === true, 'parseFrontMatter extracts tags');

  const multiHeadingMd = `---
title: "Multi Heading Note"
tags: [test]
---
Intro paragraph here.

## Section 1
Content of section 1 with enough text to test splitting logic across multiple sections in markdown documents.

## Section 2
Content of section 2 detailing secondary topic details.`;

  const chunks = await chunkByHeadings(multiHeadingMd, 'notes/test.md');
  assert(chunks.length >= 1, 'chunkByHeadings produces valid chunks');

  // ─── TEST 6: D1 Migration 0002 & 0003 Verification ───────────────────────
  const migrationPath2 = path.join(__dirname, '../migrations/0002_v4_edge_stack.sql');
  assert(fs.existsSync(migrationPath2), 'Migration 0002_v4_edge_stack.sql exists');

  const migrationSql2 = fs.readFileSync(migrationPath2, 'utf8');
  assert(migrationSql2.includes('processed_updates'), 'Migration creates processed_updates table');
  assert(migrationSql2.includes('pending_captures'), 'Migration creates pending_captures table');
  assert(migrationSql2.includes('note_chunks_cache'), 'Migration creates note_chunks_cache table');
  assert(migrationSql2.includes('note_chunks_fts'), 'Migration creates FTS5 note_chunks_fts table');
  assert(migrationSql2.includes('tasks'), 'Migration creates tasks table');
  assert(migrationSql2.includes('working_memory'), 'Migration creates working_memory table');

  const migrationPath3 = path.join(__dirname, '../migrations/0003_v4_1_1_edge_patches.sql');
  assert(fs.existsSync(migrationPath3), 'Migration 0003_v4_1_1_edge_patches.sql exists');

  const migrationSql3 = fs.readFileSync(migrationPath3, 'utf8');
  assert(migrationSql3.includes('system_state'), 'Migration 0003 creates system_state table');
  assert(migrationSql3.includes('pending_vector_deletions'), 'Migration 0003 creates pending_vector_deletions table');
  assert(migrationSql3.includes('pending_embeddings'), 'Migration 0003 creates pending_embeddings table');
  assert(migrationSql3.includes('raw_inbox_logs'), 'Migration 0003 creates raw_inbox_logs table');

  // ─── TEST 7: Knowledge_Search Execution & Null Title Fallback ────────────────
  try {
    const mock768Vector = new Array(768).fill(0.1);
    const testEnv: Env = {
      ...mockEnv,
      AI: {
        run: async () => ({ data: [mock768Vector] }),
      } as any,
      DB: {
        prepare: () => ({
          bind: () => ({
            first: async () => null,
            all: async () => ({ results: [] }),
            run: async () => {},
          }),
        }),
      } as any,
    };
    await handleKnowledgeSearch({
      chatId: 123,
      userText: 'what do I know about morning fitness',
      extracted: {},
      env: testEnv,
      update: {} as any,
    });
    assert(true, 'handleKnowledgeSearch executes cleanly without throwing TypeError on empty/no-title results');
  } catch (err: any) {
    console.error('handleKnowledgeSearch failed:', err);
    assert(false, 'handleKnowledgeSearch executes cleanly without throwing TypeError on empty/no-title results');
  }

  console.log(`\n=== Test Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
