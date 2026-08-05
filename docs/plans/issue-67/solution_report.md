# 5-W Completion Report: Issue #67 — Whole-Picture Knowledge Search for PRJ226

> **Status**: Merged to `main` (`e13fbeb`, PR #68) & deployed to the `prj226-liam` dev worker.

## 1. Context & Problem
A Telegram `Knowledge_Search` query — e.g. *"what do you know about PRJ226"* — returned only **1
source** (an inbox note at 99%), even though the wiki repo (`hdangprod/hdangprod_wiki_dev`) contains
dozens of PRJ226 documents (roadmaps, competitor benchmarks, architecture notes).

We confirmed three distinct root causes against the live `prj226-brain-dev` database:

1. **Stale/incomplete index** — D1 `note_chunks_cache` held only **22 of ~95** markdown files, so
   most PRJ226 docs (tasks, wiki) were not searchable at all. Digging into *why*, we found **three
   real indexing bugs** that had silently frozen the cache:
   - `reconciler.ts` called the non-existent `githubReader.fetchFileContent()` → every reconciled
     file errored.
   - `bulkUpsertNoteChunksAndFts` used `ON CONFLICT(id) DO UPDATE` against the **FTS5 virtual
     table**, which SQLite/D1 hard-rejects with *"UPSERT not implemented for virtual table"* → no
     row could ever be inserted.
   - A full-tree re-index of ~95 files in one cron invocation exceeded the Worker subrequest
     budget, so the reconciler could not finish a catch-up.
2. **Raw spoken phrase fed to search** — `knowledgeSearchSkill` passed the un-stripped user text to
   FTS5 and the embedder. FTS5 implicit-AND then lost the PRJ226 docs, while the inbox note
   containing the literal phrase won at 99%.
3. **Result cap** — `hybridSearch` returned ≤5 corroborated IDs and the skill rendered ≤4 sources:
   top-N RAG only, never a full file census.

## 2. Solution & Architecture
1. **Query sanitization (`src/lib/querySanitizer.ts`)** — `extractSearchKeywords` normalizes
   conversational phrases into a clean topic + an OR-joined FTS token query:
   - `"what do you know about PRJ226"` → topic `PRJ226`, FTS `"PRJ226"`.
   - `"what do I know about morning fitness"` → topic `morning fitness`, FTS `"morning" OR "fitness"`.
   Wired into `handleKnowledgeSearch`: embeddings use the **clean topic**; FTS5 uses the **token
   query** so keyword hits surface alongside semantic ones.
2. **Topic census (`D1Client.searchRelatedFiles`)** — a new query that enumerates **every** distinct
   file related to the topic (FTS5 token match **OR** `github_path LIKE '%topic%'`), ranked by chunk
   count. Rendered as verifiable **GitHub blob links** (`github.com/{owner}/{repo}/blob/main/<path>`)
   so the user sees the whole picture and can click through to verify each source.
3. **Index self-heal (`reconciler.ts`)**:
   - Resolves the full repo tree once into a **path→blob-SHA map** and fetches note content via the
     existing `fetchBlob(sha)` (fixing the `fetchFileContent` bug).
   - Maintains FTS5 with **delete + insert** (rowid-bound to `note_chunks_cache`) instead of the
     rejected `ON CONFLICT` UPSERT.
   - Performs a **full-tree audit** when no baseline exists and drains it in **bounded batches**
     (6 files/run) via a persisted `reindex_remaining_files` queue in `system_state`, only advancing
     `last_indexed_commit_sha` once the queue is drained — so a cleared/stale index heals across
     successive 5-minute crons without hitting the subresource budget.
4. **Data re-sync** — deployed the fixed dev worker, cleared the sync baseline, and let the cron
   re-index the wiki (verified climbing 22 → 40+ files with vectors upserting cleanly and zero FTS
   errors).

## 3. Blast Radius & Files Modified
- `src/lib/querySanitizer.ts` — improved conversational-phrase stripping + FTS token query.
- `src/lib/hybridSearch.ts` — optional `ftsQuery` parameter decoupled from the semantic query.
- `src/skills/knowledgeSearchSkill.ts` — sanitized search + whole-picture census + GitHub source
  links + updated found-ack wording.
- `src/tools/d1Client.ts` — added `searchRelatedFiles`; fixed `bulkUpsertNoteChunksAndFts` FTS
  maintenance (delete+insert with rowid binding).
- `src/indexers/reconciler.ts` — SHA-based blob fetch + batched full-audit resync queue.
- `tests/telegramBotFlows.test.ts` — updated find/ack assertions + 1 new census scenario (64 pass).
- `tests/localTest.ts` — unchanged (29 pass).
- Docs cascade: `docs/spec.md`, `docs/agents/context.md`, `docs/sitemap.md`, `docs/index.md`,
  `docs/plans/issue-67/plan.md`.

## 4. Future Proofing
- The reconciler advances `last_indexed_commit_sha` only when the resync queue drains, so an
  emptied or cleared index now **self-heals automatically** on subsequent crons instead of silently
  staying empty.
- FTS maintenance via delete+insert is valid for both external-content and standalone FTS5 tables,
  removing a fragile UPSERT dependency.
- A per-query census makes retrieval debuggable: the user can see and click every indexed file.

## 5. Acceptance Criteria Verification
- [x] `npm run build` passes (0 errors).
- [x] `npm test` passes (29) · `npm run test:bot` passes (64).
- [x] Querying "what do you know about PRJ226" surfaces the full list of related files + GitHub source links.
- [x] 3-step documentation cascade completed in the same PR.
- [x] Merged to `main` (PR #68) and deployed to the `prj226-liam` dev worker.