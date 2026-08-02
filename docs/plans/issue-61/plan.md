# Issue 61: Inbox Organizer with Knowledge Graph Connections

## Context & Problem
Raw inbox captures saved via Telegram had no workflow to organize them into permanent, searchable knowledge notes with connections to related existing notes.

## Solution & Design Decisions
Added a new `Inbox_Organize` intent (7th intent) with a 3-phase workflow:

1. **Phase 1: `/inbox` List View**
   - Fetches 5 latest raw/flushed inbox captures from D1 `pending_captures`.
   - Displays each as a Telegram card with action buttons: `🧠 Organize` | `➕ Task` | `🗑️ Archive`.

2. **Phase 2: `🧠 Organize` (AI Draft + Graph Connections)**
   - Runs Vectorize semantic search for top-5 related existing notes.
   - AI generates structured note: title, tags, category, and clean markdown body with `[[WikiLinks]]` to related notes.
   - Telegram preview card displays proposed note with connected notes and similarity scores.

3. **Phase 3: `✅ Approve & Save`**
   - Commits organized note to GitHub: `wiki/<category>/<slug>.md` with OKF frontmatter + `[[WikiLinks]]`.
   - Deletes raw inbox file from GitHub via Git Data API.
   - Instant FTS5 + Vectorize indexing for immediate search.

## Files Touched
- `migrations/0004_inbox_organize.sql`
- `src/skills/inboxOrganizeSkill.ts`
- `src/governance/intentRouter.ts`
- `src/tools/d1Client.ts`
- `src/tools/gitBatchClient.ts`
- `src/index.ts`
- `src/sensors/telegramWebhook.ts`
- `src/skills/dailyFocusSkill.ts`
- `tests/localTest.ts`
