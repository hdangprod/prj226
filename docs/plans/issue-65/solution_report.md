# Solution Report - Issue #65: Fix Knowledge Search TypeError, Truncation, and Relevance Percentage

## 1. Context & Problem
1. When users executed `Knowledge_Search`, `knowledgeSearchSkill` was crashing due to `c.file_path` being `undefined` on `NoteChunk` objects.
2. File paths were being arbitrarily sliced to 25 characters (`substring(0, 25)`), which cut `.md` extensions into `.m` (e.g. `inbox/2026-08-05/101649.m`).
3. Search sources were missing vector similarity / relevance percentages.
4. Inline keyboard buttons (`view_chunk:`) were missing a callback handler.

## 2. Solution & Implementation
1. **`src/lib/hybridSearch.ts`**:
   - Added `relevancePercent` calculation to `HybridSearchResult`.
   - Maps Vectorize cosine similarity directly to integer percentages (e.g. `49%`, `85%`), falling back gracefully to RRF rank scaling for FTS-only matches.

2. **`src/skills/knowledgeSearchSkill.ts`**:
   - Fixed path display to preserve full Markdown file paths (`.md`) without truncating extensions into `.m`.
   - Appended `(${relevancePercent}%)` to both Telegram HTML source links and inline keyboard action buttons.

3. **`src/governance/intentRouter.ts`**:
   - Added `view_chunk:` handler to `handleCallbackQuery`.

4. **`tests/localTest.ts`**:
   - Verified offline integration test suite passes with 29 assertions.

## 3. Blast Radius
- `src/lib/hybridSearch.ts`
- `src/skills/knowledgeSearchSkill.ts`
- `src/governance/intentRouter.ts`
- `tests/localTest.ts`
- `docs/sitemap.md`
- `docs/plans/issue-65/solution_report.md`

## 4. Verification Results
- `npm test`: 29 passed, 0 failed.
- `npm run build`: 0 TypeScript errors.
