# Issue 63: Universal Zero-Loss Ingestion & 0-Results Search UX Fallback

## Context & Problem
When a user sent a raw thought (e.g., *"We have completely eliminated Notion and Neon Postgres..."*), it was classified as `Knowledge_Search` with 0 results. The system responded with a dead-end `"No results found"` message and dropped the text without saving it to the inbox or providing action buttons.

## Solution & Architecture
1. **Universal Zero-Loss Ingestion**: Automatically capture every incoming Telegram message to D1 `pending_captures` upon arrival in `intentRouter.ts` (before skill dispatch). No thought is ever lost regardless of intent classification or search outcome.
2. **Interactive 0-Results Search UX**: When `knowledgeSearchSkill` finds 0 results, it returns a helpful status message with interactive buttons:
   - `[🧠 Organize Right Now]` → Triggers `handleOrganizeCapture` for immediate AI note synthesis + Vectorize `[[WikiLinks]]`.
   - `[➕ Convert to Task]` → Converts the captured thought into a task with priority and due date.
   - `[📋 Review Inbox]` → Triggers `/inbox` list view.

## Files Touched
- `src/governance/intentRouter.ts`
- `src/skills/knowledgeSearchSkill.ts`
- `tests/localTest.ts`
