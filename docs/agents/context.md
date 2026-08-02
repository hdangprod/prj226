# Context & Architecture Reference (AIOS Layer 2)

## 1. System Overview

PRJ226 (Liam v4.1) is an AI-Native Second Brain & Personal OS built on a serverless, zero-infrastructure-cost Cloudflare Edge Stack + Obsidian Vault architecture.

- **Obsidian Local Vault (SOT)**: Human reading, writing, and thinking in plain Markdown (`.md`).
- **GitHub Cold Storage Backup (`hdangprod/hdangprod_wiki`)**: Canonical remote repository.
- **Fast Ingestion Staging**: Telegram captures write to D1 `pending_captures` (< 50ms).
- **Batched Git Sync**: 5-minute Cron Trigger bundles pending captures into 1 Git commit via GitHub Git Data API.
- **Edge Read-Through Cache**: GitHub push webhooks update Cloudflare Vectorize (768-dim) and Cloudflare D1 (`note_chunks_cache` + FTS5). Hot path queries hit Edge Cache in < 25ms with 0 GitHub API reads.

## 2. 5-Layer Closed-Loop System Architecture

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
               [ SKILLS LAYER ] ──(7 Intents: Daily_Focus, Task_Capture, Reschedule, Knowledge_Search, Rescue_Mode, Session_Handoff, Inbox_Organize)
                       │
                       ▼
                [ TOOL LAYER ]  ──(D1Client + VectorizeClient + GitBatchClient + GitHubReader + Telegram API)
```

## 3. Database Schemas (Cloudflare D1: `migrations/0002_v4_edge_stack.sql` & `migrations/0004_inbox_organize.sql`)

### `processed_updates`
- `update_id` (BIGINT, Primary Key)
- `processed_at` (TIMESTAMPTZ)

### `pending_captures`
- `id` (TEXT, Primary Key)
- `content` (TEXT)
- `source` (TEXT)
- `file_path` (TEXT)
- `status` (TEXT - `'raw'`, `'flushed'`, `'organized'`, `'archived'`)
- `organized_path` (TEXT - e.g. `wiki/architecture/zero-cold-start.md`)
- `created_at` (TIMESTAMPTZ)

### `note_chunks_cache`
- `id` (TEXT, Primary Key - SHA-256 of `github_path:chunk_index`)
- `github_path` (TEXT)
- `chunk_index` (INTEGER)
- `title` (TEXT)
- `content` (TEXT)
- `content_hash` (TEXT - SHA-256 of `content:EMBEDDING_MODEL`)
- `tags` (TEXT)
- `updated_at` (TIMESTAMPTZ)

### `note_chunks_fts` (FTS5 Virtual Table)
- Synchronized with `note_chunks_cache` via triggers (`chunks_ai`, `chunks_ad`, `chunks_au`).

### `tasks`
- `id` (TEXT, Primary Key)
- `name` (TEXT)
- `status` (TEXT: `not_started`, `in_progress`, `done`, `on_hold`, `archived`)
- `priority` (TEXT: `high`, `medium`, `low`)
- `estimate_hours` (REAL)
- `scheduled_date` (DATE)
- `depends_on` (TEXT - JSON array of task IDs)
- `description` (TEXT)

### `working_memory`
- `id` (TEXT, Primary Key)
- `last_action` (TEXT)
- `doing` (TEXT)
- `next_action` (TEXT)
- `metadata` (TEXT - JSON string)
- `snapshot_at` (TIMESTAMPTZ)
