# Solution Report: Issue #16 - Rollover & Defer Task Logic

## 1. 🚨 Context & Problem
When users cannot complete a scheduled task today, they need a clean way to defer it to tomorrow ("Rollover") without losing subtask/checklist progress or manually re-creating task entries in Notion.

## 2. 💡 Solution Architecture
- Added `[⏳ Defer]` inline keyboard callback button on Telegram.
- **Checklist Migration**: Clones the task page for tomorrow while preserving all checklist items (`to_do` blocks).
- **Estimate Adjustment**: Prompts user for hours spent (or auto-divides estimate by 2 if skipped) to update earned value.
- **Notion Status Update**: Marks the original task as `Deferred`/`Done` and creates a cloned rollover task linked to tomorrow's Daily Log.

## 3. 🛠️ Key Files Touched
- `src/tools/notionClient.ts`
- `src/skills/taskCaptureSkill.ts`
- `src/governance/hitlManager.ts`

## 4. 📈 Lessons Learned & Takeaways
- Always preserve checklist blocks during task cloning to avoid context loss.
- Provide sensible fallbacks (e.g. dividing estimate by 2) when user skips manual time input.
