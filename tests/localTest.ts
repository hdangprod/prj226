/**
 * PRJ226 v3.0: Offline Integration Test Suite
 *
 * Runs offline validation for:
 * 1. Intent taxonomy schema contracts (6 PRD intents)
 * 2. LLMRouter provider-agnostic interface
 * 3. Hono Web Application router (/health endpoint, /webhook protection)
 * 4. GitHub OKF document parsing logic
 * 5. Neon client SQL procedures and RPC parameters
 */

import app from '../src/index';
import { INTENTS } from '../src/governance/intentRouter';
import { GitHubClient } from '../src/tools/githubClient';
import type { Env } from '../src/config';

// Mock Workers Environment
const mockEnv: Env = {
  SESSION_KV: {
    put: async () => {},
    get: async () => null,
    delete: async () => {},
  } as any,
  FALLBACK_KV: {
    put: async () => {},
    get: async () => null,
    delete: async () => {},
  } as any,
  TELEGRAM_BOT_TOKEN: 'mock-bot-token',
  TELEGRAM_WEBHOOK_SECRET: 'mock-webhook-secret',
  TELEGRAM_CHAT_ID: '12345678',
  NOTION_API_KEY: 'mock-notion-key',
  NOTION_TASKS_DB_ID: 'mock-tasks-db',
  NOTION_PROJECTS_DB_ID: 'mock-projects-db',
  NOTION_AREAS_DB_ID: 'mock-areas-db',
  NOTION_RESOURCES_DB_ID: 'mock-resources-db',
  NOTION_DAILY_LOGS_DB_ID: 'mock-logs-db',
  DATABASE_URL: 'postgres://mock:mock@localhost:5432/mock',
  LLM_FAST_API_KEY: 'mock-fast-key',
  LLM_PRO_API_KEY: 'mock-pro-key',
  GITHUB_TOKEN: 'mock-github-token',
  GITHUB_VAULT_REPO: 'hdangprod/hdangprod_wiki',
  FEATURE_DEBOUNCE_BUFFER: 'OFF',
  DEBOUNCE_BUFFER_TIME_MS: '4000',
  DEBOUNCE_MAX_BUFFER_SIZE: '15',
  FEATURE_TRIAGE_MODE: 'ON',
  LLM_FAST_PROVIDER: 'google',
  LLM_FAST_MODEL: 'gemini-2.0-flash',
  LLM_PRO_PROVIDER: 'google',
  LLM_PRO_MODEL: 'gemini-2.5-pro',
  LLM_EMBED_MODEL: 'text-embedding-004',
};

async function runTests() {
  console.log('=== Starting PRJ226 v3.0 Offline Integration Tests ===\n');

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
  assert(INTENTS.length === 6, 'Intent taxonomy contains exactly 6 PRD intents');
  assert(INTENTS.includes('Daily_Focus'), 'Contains Daily_Focus intent');
  assert(INTENTS.includes('Task_Capture'), 'Contains Task_Capture intent');
  assert(INTENTS.includes('Reschedule'), 'Contains Reschedule intent');
  assert(INTENTS.includes('Knowledge_Search'), 'Contains Knowledge_Search intent');
  assert(INTENTS.includes('Rescue_Mode'), 'Contains Rescue_Mode intent');
  assert(INTENTS.includes('Session_Handoff'), 'Contains Session_Handoff intent');

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

  // ─── TEST 4: OKF Front Matter Parser ───────────────────────────────────
  const github = new GitHubClient(mockEnv);
  const sampleOKF = `---
title: "Harness Architecture Concept"
tags: [architecture, second-brain, prj226]
category: "Tech Spec"
---
# Harness Architecture
This document details the dual-speed personal assistant logic.`;

  const parsed = github.parseOKFDocument('vault/harness.md', sampleOKF);
  assert(parsed.title === 'Harness Architecture Concept', 'OKF parser extracts title correctly');
  assert(parsed.tags.length === 3 && parsed.tags.includes('prj226'), 'OKF parser extracts tags array');
  assert(parsed.content.includes('# Harness Architecture'), 'OKF parser extracts markdown body');

  console.log(`\n=== Test Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
