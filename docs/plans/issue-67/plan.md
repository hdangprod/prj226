# Issue #67 — Knowledge Search must surface the whole PRJ226 picture with a full source list

## Context
Telegram `Knowledge_Search` returns only 1 source (an inbox note at 99%) for "what do you know
about PRJ226", despite the wiki (hdangprod/hdangprod_wiki_dev) containing many PRJ226 docs.

## Root cause (confirmed against `prj226-brain-dev`)
1. **Stale/incomplete index** — D1 cache holds 22 files; most PRJ226 task docs are not indexed.
2. **Raw query fed to FTS/embedding** — `knowledgeSearchSkill.ts` passes the full spoken phrase;
   FTS5 implicit-AND misses task docs; inbox note containing the literal phrase wins at 99%.
   `src/lib/querySanitizer.ts` (`extractSearchKeywords`) is never wired in.
3. **Cap + corroboration filter** — `hybridSearch.ts` returns ≤5 corroborated IDs; the skill shows
   ≤4 sources. Top-N RAG, not a file census.

## Plan
- **Slice 0 — Data**: Re-sync `prj226-brain-dev` (handoff note for user; reconciler run or script)
  so the missing PRJ226 files become indexable/searchable.
- **Slice 1 — Query sanitization**: Wire `extractSearchKeywords` into `handleKnowledgeSearch`,
  use `ftsQuery` for FTS and `cleanTopic` for the summary/ack topic.
- **Slice 2 — Topic census**: Add a "whole picture" source list in `handleKnowledgeSearch`
  enumerating every distinct matching file (FTS token match + `github_path LIKE %topic%`),
  each rendered as a GitHub source link, while still showing top semantic chunks.
- **Slice 3 — Tests + docs cascade**: Extend offline tests, update `docs/spec.md`,
  `docs/sitemap.md`, `docs/index.md`, `docs/agents/context.md`.

## Acceptance Criteria (DoD)
- `npm run build` passes (0 errors).
- `npm test` passes.
- Querying "what do you know about PRJ226" surfaces the full list of PRJ226 files + source links.
- 3-step documentation cascade completed in the same PR.