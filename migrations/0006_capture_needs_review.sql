-- Migration 0006: Inbox Needs-Review Flag
-- Distinguishes captures that were NOT successfully handled (shown in /inbox)
-- from successfully processed prompts (hidden from inbox, still archived to GitHub).
--
-- needs_review = 1  → unprocessed / low-confidence (HITL) / failed prompts → shown in /inbox
-- needs_review = 0  → successfully dispatched by a skill → hidden from /inbox

ALTER TABLE pending_captures ADD COLUMN needs_review INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_pending_captures_needs_review ON pending_captures(needs_review);
