-- PRJ226 v3.0: Neon Serverless Postgres Schema
-- Liam AI Second Brain — 5-table relational + pgvector schema
-- Run: psql $DATABASE_URL -f src/db/schema.sql

-- ─── Extensions ───
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── 1. notes_staging ───────────────────────────────────────────────────────
-- Raw Notion notes upserted by OpenWiki Personal Brain or direct sync
CREATE TABLE IF NOT EXISTS notes_staging (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notion_page_id   TEXT UNIQUE NOT NULL,
  title            TEXT,
  raw_text         TEXT NOT NULL,
  embedding        vector(768),                    -- Gemini text-embedding-004
  synced_at        TIMESTAMPTZ DEFAULT now(),
  source           TEXT DEFAULT 'notion' CHECK (source IN ('notion', 'manual'))
);

CREATE INDEX IF NOT EXISTS idx_notes_staging_embedding
  ON notes_staging USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_notes_staging_synced_at
  ON notes_staging (synced_at DESC);

-- ─── 2. knowledge_wiki ──────────────────────────────────────────────────────
-- OKF Markdown synthesized by OpenWiki Personal Brain → GitHub Vault → indexed here
CREATE TABLE IF NOT EXISTS knowledge_wiki (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title            TEXT NOT NULL,
  content          TEXT NOT NULL,
  embedding        vector(768),
  github_path      TEXT UNIQUE,                    -- path in GitHub Vault repo
  content_hash     TEXT,                           -- SHA-256 hash for idempotency & token optimization
  tags             TEXT[],
  source_notion_id TEXT,                           -- back-reference to notion page
  synthesized_at   TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_wiki_embedding
  ON knowledge_wiki USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_knowledge_wiki_tags
  ON knowledge_wiki USING GIN (tags);

CREATE INDEX IF NOT EXISTS idx_knowledge_wiki_content_hash
  ON knowledge_wiki (content_hash);

-- ─── 3. tasks ───────────────────────────────────────────────────────────────
-- Project tasks with dependency graph and Notion page linkage
CREATE TABLE IF NOT EXISTS tasks (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  status           TEXT DEFAULT 'not_started'
                     CHECK (status IN ('not_started', 'in_progress', 'done', 'on_hold', 'archived')),
  priority         TEXT DEFAULT 'medium'
                     CHECK (priority IN ('high', 'medium', 'low')),
  estimate_hours   NUMERIC(4,2),
  scheduled_date   DATE,
  depends_on       UUID[],                         -- prerequisite task IDs
  project_id       UUID,
  notion_page_id   TEXT,                           -- read-only reference to Notion source
  description      TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_scheduled_date ON tasks (scheduled_date);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks (priority);

-- ─── 4. working_memory ──────────────────────────────────────────────────────
-- Session handoff state: last action → current → next
CREATE TABLE IF NOT EXISTS working_memory (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  last_action      TEXT,
  doing            TEXT,
  next_action      TEXT,
  snapshot_at      TIMESTAMPTZ DEFAULT now(),
  metadata         JSONB                           -- arbitrary context for recovery
);

CREATE INDEX IF NOT EXISTS idx_working_memory_snapshot_at
  ON working_memory (snapshot_at DESC);

-- ─── 5. habits ──────────────────────────────────────────────────────────────
-- Habit tracker for tennis / gym / health routines
CREATE TABLE IF NOT EXISTS habits (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  category         TEXT CHECK (category IN ('health', 'sport', 'learning', 'work', 'personal')),
  frequency        TEXT CHECK (frequency IN ('daily', 'weekly', 'custom')),
  last_logged      DATE,
  streak_days      INTEGER DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT now()
);
