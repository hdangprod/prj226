# Solution Report: Issue #18 - Support Time in Task Dates

## 1. 🚨 Context & Problem
Tasks extracted from natural language (e.g., "Họp lúc 14:30 chiều mai") needed precise start/due timestamps in Notion ISO format rather than plain date strings (`YYYY-MM-DD`).

## 2. 💡 Solution Architecture
- Updated Gemini task parsing schema (`parseTaskInput`) to output ISO timestamps with timezone offsets (e.g. `2026-06-25T14:30:00+07:00`).
- Updated Notion client payloads to handle start/end date-time objects.

## 3. 🛠️ Key Files Touched
- `src/sensors/voiceProcessor.ts`
- `src/tools/notionClient.ts`
- `src/skills/taskCaptureSkill.ts`

## 4. 📈 Lessons Learned & Takeaways
- ISO 8601 strings with explicit timezones (`+07:00`) prevent time shifts when rendering calendar views in Notion.
