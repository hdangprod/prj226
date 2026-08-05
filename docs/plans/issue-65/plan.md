# Implementation Plan - Issue #65: Fix Knowledge Search TypeError and Callback Handler

## 1. Context & Problem
When users execute `Knowledge_Search` (e.g. "what do I know about morning fitness"), the bot sends:
1. `🔍 Searching your knowledge base...`
2. `🧠 Calculating relevance scores...`
And then hangs indefinitely.

**Root Cause**:
In `src/skills/knowledgeSearchSkill.ts`, `orderedChunks` elements are typed as `NoteChunk`, which defines property `github_path` (not `file_path`).
When a note chunk does not have a title (`c.title === null`), the code evaluated:
`const titleText = c.title ? c.title.substring(0, 25) : c.file_path.substring(0, 25);`
Since `c.file_path` was `undefined`, Javascript threw an unhandled `TypeError: Cannot read properties of undefined (reading 'substring')`.

Additionally, the inline keyboard button `view_chunk:${c.id}` sent by `knowledgeSearchSkill` was missing a corresponding handler in `src/governance/intentRouter.ts`.

## 2. Proposed Changes

### `src/skills/knowledgeSearchSkill.ts`
- Replace `c.file_path` with `(c.github_path || c.file_path || 'Untitled')` throughout the file.
- Safely extract title and file path with fallback values to prevent any runtime `TypeError`.

### `src/governance/intentRouter.ts`
- Add callback query handler for `data.startsWith('view_chunk:')`.
- Retrieve chunk by ID via `d1.getChunksByIds([chunkId])` and display snippet contents in Telegram formatted HTML.

### `tests/localTest.ts`
- Add offline integration test for `handleKnowledgeSearch` ensuring `github_path` fallback works without throwing errors.

## 3. 3-Step Documentation Cascade
- Update `docs/spec.md` with knowledge search error handling guarantees and callback handlers.
- Sync `docs/sitemap.md` to ensure indices are up to date.

## 4. Verification Plan
- Run `npm test` to verify all 28+ offline tests pass.
- Run `npm run build` to ensure 0 TypeScript compilation errors.
