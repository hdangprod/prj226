-- PRJ226 v4.1: D1 Edge Stack Schema
-- Cloudflare D1 (SQLite at Edge) — replaces Neon Postgres

-- 1. Global Idempotency (Prevents duplicate processing & token burn)
CREATE TABLE IF NOT EXISTS processed_updates (
    update_id BIGINT PRIMARY KEY,
    processed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Fast Ingestion Staging Queue (Hot Path Telegram Capture)
CREATE TABLE IF NOT EXISTS pending_captures (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    source TEXT DEFAULT 'telegram',
    file_path TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Read-Through Content & Metadata Cache (For Instant Hot Path Query)
CREATE TABLE IF NOT EXISTS note_chunks_cache (
    id TEXT PRIMARY KEY,
    github_path TEXT NOT NULL,
    chunk_index INTEGER DEFAULT 0,
    title TEXT,
    content TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    tags TEXT,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chunks_path ON note_chunks_cache(github_path);
CREATE INDEX IF NOT EXISTS idx_chunks_hash ON note_chunks_cache(content_hash);

-- FTS5 Virtual Table for Hybrid Search
CREATE VIRTUAL TABLE IF NOT EXISTS note_chunks_fts USING fts5(
    id,
    title,
    content,
    content='note_chunks_cache',
    content_rowid='rowid'
);

-- Triggers to keep FTS5 automatically in sync with note_chunks_cache
CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON note_chunks_cache BEGIN
  INSERT INTO note_chunks_fts(rowid, id, title, content) VALUES (new.rowid, new.id, new.title, new.content);
END;

CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON note_chunks_cache BEGIN
  INSERT INTO note_chunks_fts(note_chunks_fts, rowid, id, title, content) VALUES('delete', old.rowid, old.id, old.title, old.content);
END;

CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON note_chunks_cache BEGIN
  INSERT INTO note_chunks_fts(note_chunks_fts, rowid, id, title, content) VALUES('delete', old.rowid, old.id, old.title, old.content);
  INSERT INTO note_chunks_fts(rowid, id, title, content) VALUES (new.rowid, new.id, new.title, new.content);
END;

-- 4. Tasks & Working Memory
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'not_started',
    priority TEXT DEFAULT 'medium',
    estimate_hours REAL,
    scheduled_date DATE,
    depends_on TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS working_memory (
    id TEXT PRIMARY KEY,
    last_action TEXT,
    doing TEXT,
    next_action TEXT,
    metadata TEXT,
    snapshot_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
