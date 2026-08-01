# Plan: PRJ226 v4.1.1 Edge Stack Hardening & Strict Dev/Prod Isolation (#59)

## 1. Goal
Harden PRJ226 v4.1 across 10 operational blind spots and establish strict isolation between development/testing resources (`prj226-brain-dev`, `hdangprod_wiki_dev`) and production resources (`prj226-brain-prod`, `hdangprod_wiki_prod`).

## 2. Proposed Changes
- **Database & Schemas**: Create `0003_v4_1_1_edge_patches.sql` migration, drop FTS5 auto-triggers to eliminate write contention, add `raw_inbox_logs`, `pending_vector_deletions`, `pending_embeddings`, and `system_state` tables.
- **Tools & Core Pipeline**: Implement `bulkUpsertNoteChunksAndFts()`, dynamic Git tree re-basing, durable synchronous webhook logging, R2 voice audio archival, and single-model vector consistency.
- **Reconciliation & Config**: Create `reconciler.ts` hourly cron handler, configure `.gitattributes` for mobile sync, and configure `wrangler.toml` for `_dev` vs `_prod` environments.

## 3. Verification Plan
- `npm test`: 27 passing tests.
- `npm run build`: 0 compilation errors.
