-- PRJ226 Dev Database Seed
-- TARGETS prj226-brain-dev ONLY. NEVER run against prj226-brain-prod.
-- Wipes leftover test data and seeds a realistic demo dataset.

-- ─── 1. Wipe leftover test data ───
DELETE FROM tasks;
DELETE FROM pending_captures;
DELETE FROM note_chunks_cache;
DELETE FROM working_memory;
DELETE FROM processed_updates;
DELETE FROM raw_inbox_logs;
DELETE FROM pending_embeddings;
DELETE FROM pending_vector_deletions;

-- Rebuild FTS5 index from (now empty) note_chunks_cache.
-- FTS auto-sync triggers were dropped in migration 0003.
INSERT INTO note_chunks_fts(note_chunks_fts) VALUES('rebuild');

-- NOTE: system_state is intentionally preserved so the reconcile cron can
-- diff last_indexed_commit_sha and index notes pushed to hdangprod_wiki_dev.

-- ─── 2. Tasks ───
INSERT INTO tasks (id, name, status, priority, estimate_hours, scheduled_date, depends_on, description) VALUES
('t-001', 'Finalize PRJ226 product spec draft', 'not_started', 'high', 2.0, '2026-08-05', NULL, 'Complete the spec.md draft before review'),
('t-002', 'Reply to client feedback email', 'not_started', 'high', 0.5, '2026-08-05', NULL, 'Pending email about scope changes'),
('t-003', 'Fix search relevance bug on PRJ226', 'not_started', 'high', 1.5, '2026-08-05', NULL, 'Hybrid RRF search returns wrong ordering'),
('t-004', 'Morning workout session', 'not_started', 'low', 0.25, '2026-08-05', NULL, '30 min bodyweight circuit'),
('t-005', 'Buy groceries for the week', 'not_started', 'medium', 1.0, '2026-08-05', NULL, 'Plan 5 lunches'),
('t-006', 'Review PR #72 and approve', 'in_progress', 'high', 0.5, '2026-08-05', NULL, 'Inbox-organize related PR'),
('t-007', 'Prepare investor deck outline', 'not_started', 'high', 3.0, '2026-08-06', '["t-001"]', 'Blocked until spec finalized'),
('t-008', 'Tennis match with Minh', 'not_started', 'low', 2.0, '2026-08-07', NULL, 'Try rescheduling: "move tennis"'),
('t-009', 'Renew cloudflare domain subscription', 'not_started', 'medium', 0.5, '2026-08-08', NULL, 'Card expires end of month'),
('t-010', 'Write weekly report', 'done', 'medium', 1.0, '2026-08-04', NULL, 'Completed'),
('t-011', 'Backup Obsidian vault to GitHub', 'done', 'high', 0.25, '2026-08-04', NULL, 'Completed'),
('t-012', 'Plan Vietnam trip itinerary', 'not_started', 'medium', 1.0, '2026-08-12', NULL, 'Hanoi + Ha Long');

-- ─── 3. Inbox captures (needs_review = 1 → listed by /inbox as unprocessed) ───
INSERT INTO pending_captures (id, content, source, file_path, status, created_at) VALUES
('pc-001', 'Article idea: how to build a second brain with Cloudflare Workers', 'telegram', 'inbox/2026-08-05/090001.md', 'raw', CURRENT_TIMESTAMP),
('pc-002', 'Remember to check rental car prices for the Vietnam trip', 'telegram', 'inbox/2026-08-05/090002.md', 'raw', CURRENT_TIMESTAMP),
('pc-003', 'Research RAG and vector search best practices for 2026', 'telegram', 'inbox/2026-08-05/090003.md', 'raw', CURRENT_TIMESTAMP),
('pc-004', 'Book dentist appointment for next week', 'telegram', 'inbox/2026-08-05/090004.md', 'raw', CURRENT_TIMESTAMP),
('pc-005', 'Great quote from the book: consistency beats intensity over long periods', 'telegram', 'inbox/2026-08-05/090005.md', 'raw', CURRENT_TIMESTAMP),
('pc-006', 'Plan the AIOS 5-layer framework architecture diagram', 'telegram', 'inbox/2026-08-05/090006.md', 'raw', CURRENT_TIMESTAMP),
('pc-007', 'Try the new Obsidian graph view canvas for project mapping', 'telegram', 'inbox/2026-08-05/090007.md', 'raw', CURRENT_TIMESTAMP);

-- ─── 4. Working memory snapshot (feeds Session_Handoff & Daily Focus) ───
INSERT INTO working_memory (id, last_action, doing, next_action, metadata, snapshot_at) VALUES
('wm-001', 'Completed daily briefing setup', 'Working on search relevance bug (t-003)', 'Review PR #72 and approve', '{"streak_days": 12, "focus_score": 0.82}', CURRENT_TIMESTAMP);
