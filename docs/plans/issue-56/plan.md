# Implementation Plan - Issue #56: PRJ226 v4.1 Obsidian Edge Stack Migration

## Goal
Migrate PRJ226 from Notion API + Neon Postgres to pure Cloudflare Edge Stack (D1 + Vectorize + Workers AI) with Obsidian local vault as Single Source of Truth, achieving $0/month infrastructure cost, sub-25ms hot path retrieval, and zero merge conflicts.

## Proposed Changes

### Phase 1: Cleanup & Setup
- Remove Notion and Neon drivers (`@notionhq/client`, `@neondatabase/serverless`).
- Update `package.json`, `wrangler.toml`, and `src/config.ts`.
- Add D1 schema `migrations/0002_v4_edge_stack.sql`.

### Phase 2: Core Tooling & Libraries
- Create `src/tools/d1Client.ts` for D1 database CRUD operations.
- Create `src/lib/embeddings.ts` for Workers AI embedding generation & content hash namespacing.
- Create `src/lib/chunking.ts` for Markdown heading-based chunker.
- Create `src/lib/hybridSearch.ts` for Reciprocal Rank Fusion (RRF) search.
- Create `src/tools/vectorizeClient.ts` for Cloudflare Vectorize operations.
- Create `src/types/index.ts` for centralized type re-exports.

### Phase 3: GitHub Integration
- Create `src/tools/gitBatchClient.ts` for GitHub Git Data API batch commits.
- Refactor `src/tools/githubClient.ts` to `GitHubReader` using Git Data API.

### Phase 4: Indexer & Webhook
- Create `src/indexers/vaultIndexer.ts` for push webhook signature verification and edge cache indexing.

### Phase 5: Debounce Redesign
- Rewrite `src/sensors/telegramWebhook.ts` for KV-backed 4s sliding window debounce buffer & Whisper voice transcription.

### Phase 6: Governance & Skills Migration
- Update `src/governance/intentRouter.ts` for auto-capturing low-confidence thoughts to `pending_captures` + HITL keyboard + Obsidian deep links.
- Migrate all 6 skills (`dailyFocusSkill`, `taskCaptureSkill`, `knowledgeSearchSkill`, `rescheduleSkill`, `rescueModeSkill`, `sessionHandoffSkill`) to use `D1Client`.

### Phase 7: Entry Point & Cron
- Update `src/index.ts` to wire up `/github-webhook`, Hono routes, health check, and 5-min cron trigger `scheduled` handler.
- Refactor `src/router/llmRouter.ts` to remove embedding methods.

## Verification Plan
- `npm run build`: Must compile cleanly with zero errors.
- `npm test`: Must pass offline integration test suite (22 tests).
