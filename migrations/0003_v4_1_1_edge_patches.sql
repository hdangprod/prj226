-- PRJ226 v4.1.1 Edge Stack Hardening Migration

-- 1. System State (Tracks last_indexed_commit_sha for reconciliation cron)
CREATE TABLE IF NOT EXISTS system_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Pending Vector Deletions Queue (Stages failed Vectorize deleteByIds operations)
CREATE TABLE IF NOT EXISTS pending_vector_deletions (
    id TEXT PRIMARY KEY,
    vector_id TEXT NOT NULL,
    github_path TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Pending Embeddings Queue (Stages Workers AI quota-exceeded chunks for retry)
CREATE TABLE IF NOT EXISTS pending_embeddings (
    chunk_id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    github_path TEXT NOT NULL,
    status TEXT DEFAULT 'quota_deferred',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Raw Inbox Logs (Durable synchronous webhook acking before background execution)
CREATE TABLE IF NOT EXISTS raw_inbox_logs (
    update_id BIGINT PRIMARY KEY,
    payload TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. Drop FTS5 Auto-Sync Triggers (Eliminates write lock contention & CPU timeouts)
DROP TRIGGER IF EXISTS chunks_ai;
DROP TRIGGER IF EXISTS chunks_ad;
DROP TRIGGER IF EXISTS chunks_au;

-- 6. Add Index on pending_captures(file_path) for 1:1 path lookup
CREATE INDEX IF NOT EXISTS idx_pending_captures_file_path ON pending_captures(file_path);
