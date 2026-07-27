# Context & Architecture Reference (AIOS Layer 2)

## 1. System Overview

PRJ226 (Liam) is an AI-Native Second Brain & Personal OS built on a serverless, zero-infrastructure-cost dual-speed architecture.

- **Hot Path (< 2s Latency)**: Real-time execution via Cloudflare Workers (Hono framework), Telegram Webhooks, and Neon Postgres (`pgvector`).
- **Cold Path (Nightly Batch)**: Deep knowledge synthesis using OpenWiki CLI running on GitHub Actions to convert Notion notes into Open Knowledge Format (OKF v0.1) Markdown files stored in a private GitHub Vault and indexed into Neon Postgres.

## 2. 5-Layer Closed-Loop System Architecture

```
[ Human Input: Telegram / Notion ]
               │
               ▼
       [ SENSOR LAYER ] ──(Cloudflare Workers Hono Proxy + Durable Objects Debounce)
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
       [ SKILLS LAYER ] ──(Daily_Focus, Task_Capture, Reschedule, Knowledge_Search, Rescue_Mode, Session_Handoff)
               │
               ▼
        [ TOOL LAYER ]  ──(Neon Postgres + Telegram API + GitHub API + Notion API)
```

## 3. Database Schemas (Neon Postgres)

### `notes_staging`
Stores raw Notion page text for fast real-time search.
- `id` (UUID, Primary Key)
- `notion_page_id` (TEXT, Unique)
- `title` (TEXT)
- `raw_text` (TEXT)
- `embedding` (vector(768), HNSW index `vector_cosine_ops`)
- `synced_at` (TIMESTAMPTZ)
- `source` (TEXT)

### `knowledge_wiki`
Stores OKF Markdown entries synthesized by OpenWiki Personal Brain.
- `id` (UUID, Primary Key)
- `title` (TEXT)
- `content` (TEXT)
- `embedding` (vector(768), HNSW index `vector_cosine_ops`)
- `github_path` (TEXT, Unique)
- `tags` (TEXT[])
- `synthesized_at` (TIMESTAMPTZ)

### `tasks`
Stores tasks with dependency graph.
- `id` (UUID, Primary Key)
- `name` (TEXT)
- `status` (TEXT: `not_started`, `in_progress`, `done`, `on_hold`, `archived`)
- `priority` (TEXT: `high`, `medium`, `low`)
- `estimate_hours` (NUMERIC)
- `scheduled_date` (DATE)
- `depends_on` (UUID[])
- `project_id` (UUID)
- `notion_page_id` (TEXT)
- `description` (TEXT)

### `working_memory`
Stores handoff snapshots between work sessions.
- `id` (UUID, Primary Key)
- `last_action` (TEXT)
- `doing` (TEXT)
- `next_action` (TEXT)
- `snapshot_at` (TIMESTAMPTZ)
- `metadata` (JSONB)

### `habits`
- `id` (UUID, Primary Key)
- `name` (TEXT)
- `category` (TEXT)
- `frequency` (TEXT)
- `last_logged` (DATE)
- `streak_days` (INTEGER)
