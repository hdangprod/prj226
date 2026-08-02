-- Migration 0004: Inbox Organize Lifecycle
-- Adds status tracking to pending_captures so inbox items persist after GitHub flush
-- and can be organized into permanent wiki notes.

-- Status lifecycle: 'raw' → 'flushed' → 'organized' → 'archived'
ALTER TABLE pending_captures ADD COLUMN status TEXT NOT NULL DEFAULT 'raw';

-- Final organized wiki path (e.g. wiki/architecture/zero-cold-start.md)
ALTER TABLE pending_captures ADD COLUMN organized_path TEXT;

-- Index for fast /inbox queries
CREATE INDEX IF NOT EXISTS idx_pending_captures_status ON pending_captures(status);
