---
title: "Spec: PRJ226 v4.1 AI-Native Second Brain Architecture & Obsidian Edge Stack (Liam)"
version: 4.1.0
date: 2026-07-31
type: specification
---

# Spec: PRJ226 v4.1 AI-Native Second Brain Architecture & Obsidian Edge Stack (Liam)

## Objective
Serverless, zero-infrastructure-cost ($0/month 100% Free Tier) AI-Native Second Brain Orchestrator & Conversational Assistant built with TypeScript (v5.3.3) for Cloudflare Workers. Orchestrates an Obsidian local vault (Single Source of Truth) backed by a GitHub private repository (`hdangprod/hdangprod_wiki`) and Cloudflare D1 + Vectorize + Workers AI.

## Tech Stack
- **Language**: TypeScript (v5.3.3)
- **Runtime**: Cloudflare Workers (Hono framework v4.7.0 — 100% Free Tier)
- **Database & Cache**: Cloudflare D1 (`DB` - SQLite at Edge for metadata, tasks, working memory, note_chunks_cache, FTS5)
- **Vector Search**: Cloudflare Vectorize (`VECTORIZE` - 768-dim cosine index for note chunks)
- **AI & Audio Engine**: Cloudflare Workers AI (`AI` - `@cf/baai/bge-base-en-v1.5` for 768-dim embeddings, `@cf/openai/whisper-large-v3-turbo` for voice transcription)
- **LLM Synthesis & Routing**: Vercel AI SDK (`ai` + `@ai-sdk/google`) for model-agnostic intent classification and response generation
- **Queuing & Debounce**: Cloudflare KV (`SESSION_KV`) 4-second sliding window buffer + `ctx.waitUntil()` async execution
- **Git Sync Engine**: GitHub Git Data API (`POST /git/blobs` -> `POST /git/trees` -> `POST /git/commits` -> `PATCH /git/refs`) for batched commits (5-min Cron Trigger)
- **Human Interface**: Obsidian Local Vault (Markdown `.md`) + Telegram Bot (`liam_second_brain_bot`)

## Database Schema (Cloudflare D1: `migrations/0002_v4_edge_stack.sql`)
- **`processed_updates`**: Global idempotency table (`update_id` BIGINT PK).
- **`pending_captures`**: Staging queue for rapid Telegram captures (`id`, `content`, `source`, `file_path`, `created_at`).
- **`note_chunks_cache`**: Read-through Markdown content & chunk metadata cache (`id`, `github_path`, `chunk_index`, `title`, `content`, `content_hash`, `tags`, `updated_at`).
- **`note_chunks_fts`**: FTS5 Virtual Table automatically synchronized with `note_chunks_cache` via triggers (`chunks_ai`, `chunks_ad`, `chunks_au`).
- **`tasks`**: Tasks with dependency graph, scheduled dates, and priorities (`id`, `name`, `status`, `priority`, `estimate_hours`, `scheduled_date`, `depends_on`, `description`).
- **`working_memory`**: Session state snapshots (`id`, `last_action`, `doing`, `next_action`, `metadata`, `snapshot_at`).

## Architecture: 4-Layer Closed-Loop System

```
[ Telegram Webhook (Text/Voice) / GitHub Push Webhook ]
                       │
                       ▼
               [ SENSOR LAYER ] ──(Cloudflare Workers / Hono / KV Debounce / Whisper AI)
                       │
                       ▼
             [ GOVERNANCE LAYER ] ──(Vercel AI SDK Intent Router + Auto-Capture + HITL)
                       │
              ┌────────┴────────────────────────┐
              ▼                                 ▼
      [ HOT PATH: Query ]             [ FAST INGESTION & COLD PATH ]
        ├── D1 Content Cache            ├── D1 pending_captures
        ├── Vectorize ANN Search        ├── 5-min Cron Batch Commit (Git Data API)
        └── D1 FTS5 Keyword Search      └── GitHub Vault Sync (hdangprod_wiki)
              └────────┬────────────────────────┘
                       ▼
               [ SKILLS LAYER ] ──(6 Intents: Daily_Focus, Task_Capture, Reschedule, Knowledge_Search, Rescue_Mode, Session_Handoff)
                       │
                       ▼
                [ TOOL LAYER ]  ──(D1Client + VectorizeClient + GitBatchClient + GitHubReader + Telegram API)
```

### 1. Sensor Layer (`src/sensors/`)
- `telegramWebhook.ts`: Webhook receiver with < 50ms typing indicator ack, Whisper voice transcription via Workers AI, and 4-second KV debounce buffering before intent routing.

### 2. Governance Layer (`src/governance/`)
- `intentRouter.ts`: Evaluates intent across 6 categories using LLMRouter. Confidence ≥ 95% dispatches to Skill. Confidence < 95% auto-captures thought to `pending_captures` AND presents HITL clarification keyboard with Obsidian deep link.

### 3. LLM Router & Embeddings (`src/router/`, `src/lib/`)
- `llmRouter.ts`: Dynamic model router for fast structured extraction and pro synthesis via Vercel AI SDK (`@ai-sdk/google`).
- `embeddings.ts`: Workers AI `@cf/baai/bge-base-en-v1.5` 768-dim embedding generator + SHA-256 content hash namespacing.
- `chunking.ts`: Markdown H2 heading chunker.
- `hybridSearch.ts`: RRF (Reciprocal Rank Fusion, K=60) hybrid search across Vectorize ANN (weight 0.7) and D1 FTS5 (weight 0.3).

### 4. Tool Layer (`src/tools/`)
- `d1Client.ts`: Cloudflare D1 prepared statement client with exponential backoff & jitter.
- `vectorizeClient.ts`: Cloudflare Vectorize upsert/delete client (100-item batching).
- `gitBatchClient.ts`: GitHub Git Data API batch commit engine (flushes `pending_captures` to GitHub in 1 commit).
- `githubClient.ts`: GitHub Git Data API blob reader (`GitHubReader`) and OKF document parser.
- `telegramClient.ts`: Telegram Bot API wrapper.

### 5. Indexer (`src/indexers/`)
- `vaultIndexer.ts`: GitHub push webhook handler (`POST /github-webhook`) verifying HMAC-SHA256 signatures, diffing chunk content hashes, and upserting into D1 `note_chunks_cache` + Vectorize.

### 6. Skills Layer (`src/skills/`)
- `dailyFocusSkill.ts`: Synthesizes actionable tasks + working memory for daily focus briefings.
- `taskCaptureSkill.ts`: Natural language task extraction to D1 `tasks` table + Obsidian deep link button.
- `rescheduleSkill.ts`: Dependency-aware task rescheduling with conflict warnings.
- `knowledgeSearchSkill.ts`: Zero GitHub API call hot-path search reading directly from D1 `note_chunks_cache` + Obsidian deep link buttons.
- `rescueModeSkill.ts`: Quick-win task filter (estimate ≤ 0.5h).
- `sessionHandoffSkill.ts`: Session working memory snapshot recorder.

---

## Verification & Commands
- **Build**: `npm run build` (`wrangler build`)
- **Typecheck**: `npm run typecheck` (`tsc --noEmit`)
- **Test Harness**: `npm test` (Runs 22 offline integration tests)
