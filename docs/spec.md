---
title: "Spec: PRJ226 v3.0 AI-Native Second Brain Architecture & Dual-Speed Personal Assistant (Liam)"
version: 3.0.0
date: 2026-07-27
type: specification
---

# Spec: PRJ226 v3.0 AI-Native Second Brain Architecture & Dual-Speed Personal Assistant (Liam)

## Objective
Serverless conversational productivity assistant built with TypeScript (v5.3.3) for Cloudflare Workers and Neon Serverless Postgres (`pgvector`). Orchestrates a Notion Second Brain and OpenWiki Personal Knowledge Vault using a model-agnostic LLM router (Vercel AI SDK).

## Tech Stack
- **Language**: TypeScript (v5.3.3)
- **Runtime**: Cloudflare Workers (Hono framework v4.7.0 — 100% Free Tier)
- **Database**: Neon Serverless Postgres (`pgvector` HNSW cosine similarity search)
- **Queuing & Session**: Cloudflare KV (`SESSION_KV`, `FALLBACK_KV`) + `ctx.waitUntil()` async execution (0$ cost)
- **LLM Layer**: Vercel AI SDK (`ai` package) with dynamic env-driven model routing (`google`, `openai`, `anthropic`)
- **Cold Path**: OpenWiki Personal Brain (GitHub Actions every 6 hours with SHA-256 content hash idempotency)

## Database Schema (Neon Postgres)
- **`notes_staging`**: Fast-sync raw Notion notes with 768-dim vector embeddings (HNSW `vector_cosine_ops`).
- **`knowledge_wiki`**: OKF Markdown entries synthesized by OpenWiki Personal Brain (HNSW `vector_cosine_ops`).
- **`tasks`**: Project tasks with dependency graph (`depends_on` UUID arrays), scheduled dates, and priorities.
- **`working_memory`**: Handoff context state (`last_action`, `doing`, `next_action`, `metadata`).
- **`habits`**: Habit tracking log.

## Architecture: 4-Layer Closed-Loop System

```
[ Telegram Webhook / Notion Event ]
               │
               ▼
       [ SENSOR LAYER ] ──(Cloudflare Workers / Hono / Durable Objects)
               │
               ▼
     [ GOVERNANCE LAYER ] ──(Vercel AI SDK Intent Router + HITL DO)
               │
      ┌────────┴────────────────────────┐
      ▼                                 ▼
[ HOT PATH: Real-Time ]       [ COLD PATH: Nightly Batch ]
  ├── Staging Notes             ├── OpenWiki CLI Engine
  ├── Tasks & Dependencies      ├── OKF Markdown Synthesis
  └── Working Memory Handoff    └── GitHub Vault Storage
      └────────┬────────────────────────┘
               ▼
       [ SKILLS LAYER ] ──(6 Intents: Daily_Focus, Task_Capture, Reschedule, Knowledge_Search, Rescue_Mode, Session_Handoff)
               │
               ▼
        [ TOOL LAYER ]  ──(Neon Postgres HTTP Driver + Telegram API + GitHub API)
```

### 1. Sensor Layer (`src/sensors/`)
Ingests Telegram update signals and Notion updates.
- `telegramWebhook.ts`: Webhook receiver returning HTTP 200 OK instantly with < 50ms `typing` indicator acknowledgement.
- `debounceBuffer.ts`: Cloudflare Durable Object providing a 4-second sliding window debounce buffer.
- `notionFastSync.ts`: Cloudflare Cron Trigger (every 1 min) polling Notion for recent updates and upserting into `notes_staging`.

### 2. Governance Layer (`src/governance/`)
Probabilistic routing and session state management.
- `intentRouter.ts`: Evaluates intent across 6 PRD categories using LLMRouter. Routes score ≥ 95% to Skills, and score < 95% to HITL.
- `hitlManager.ts`: Manages Human-In-The-Loop interactive inline keyboards on Telegram backed by `HitlSession` Durable Object.

### 3. LLM Router Layer (`src/router/`)
- `llmRouter.ts`: Provider-agnostic abstraction wrapping Vercel AI SDK (`ai`). Model choices (`LLM_FAST_PROVIDER`, `LLM_PRO_PROVIDER`) driven 100% by environment variables.

### 4. Tool Layer (`src/tools/`)
Deterministic API clients without AI reasoning.
- `neonClient.ts`: Neon HTTP serverless driver wrapper with stored procedures (`process_telegram_action`, `get_actionable_tasks`, `get_rescue_tasks`, `hybrid_search`).
- `telegramClient.ts`: Cloudflare Workers-native Telegram Bot API wrapper (HTML parse mode).
- `notionClient.ts`: Cloudflare Workers-native read-only Notion REST API client.
- `githubClient.ts`: OKF GitHub Vault document parser and API client.

### 5. Skills Layer (`src/skills/`)
Stateful multi-tool workflow orchestration.
- `dailyFocusSkill.ts`: Synthesizes actionable tasks + working memory for daily briefings.
- `taskCaptureSkill.ts`: Natural language task extraction and commit.
- `rescheduleSkill.ts`: Dependency-aware task rescheduling with conflict warnings.
- `knowledgeSearchSkill.ts`: Reciprocal Rank Fusion (RRF) Hybrid RAG search across `notes_staging` and `knowledge_wiki`.
- `rescueModeSkill.ts`: Quick-win low-energy task filter (estimate ≤ 0.5h).
- `sessionHandoffSkill.ts`: End-of-day working memory snapshot recorder.

---

## Verification & Commands
- **Build**: `npm run build` (`wrangler build`)
- **Typecheck**: `npm run typecheck` (`tsc --noEmit`)
- **Test Harness**: `npm test` (Runs offline integration test suite)
- **Evaluation Suite**: `npm run evals` (Ground-truth dataset accuracy check ≥ 95%)
