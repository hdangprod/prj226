# Spec: Telegram Bot Notion Second Brain Orchestrator

## Objective
Create a serverless Telegram Bot written in TypeScript, integrated with the Gemini API to manage a 5-database Notion Second Brain system (based on PARA methodology: Tasks, Projects, Areas, Resources, Daily Logs). The bot acts as a conversational productivity assistant that allows the user to manage daily tasks, capture resources, and track performance metrics seamlessly on mobile.

## Tech Stack
- **Language**: TypeScript (v5.3.3)
- **Runtime**: Node.js (v20+)
- **Execution Environment**: GCP Functions Framework (v3.0.0) for HTTP Serverless webhook
- **Notion SDK**: `@notionhq/client` (v2.2.15)
- **Generative AI SDK**: `@google/generative-ai` (v0.21.0)
- **Environment Management**: `dotenv` (v16.4.5)
- **Development Tools**: `ts-node` (v10.9.2), `@types/node` (v20.11.24)

## Commands
- **Build**: `npm run build` (runs `tsc`)
- **Start (Dev Framework)**: `npm run start` (runs `npx @google-cloud/functions-framework --target=helloHttp --source=dist`)
- **Test**: `npm test` (runs `npx ts-node tests/localTest.ts`)
- **Lint**: `npm run lint`

## Project Structure
```
src/
  ├── index.ts                → HTTP Webhook entry point (Google Cloud Function)
  ├── config.ts               → Environment variable validation & global config
  ├── notion/
  │     ├── client.ts         → Notion Client wrappers (Pages, Databases, Blocks CRUD)
  │     └── types.ts          → Interfaces matching Notion Database properties
  ├── gemini/
  │     └── client.ts         → Gemini API NLP processor & translator
  ├── telegram/
  │     └── client.ts         → Telegram Bot API helper (SendMessage, EditMessage)
  └── services/
        ├── taskService.ts    → Business logic for tasks (Decomposition, Rollover, Rescue)
        └── reportService.ts  → Business logic for weekly performance reports
tests/
  └── localTest.ts            → Local harness to simulate API payloads and flow execution
docs/
  └── spec.md                 → This system specification
```

## Code Style
```typescript
import { Client } from '@notionhq/client';

export interface TaskInput {
  name: string;
  projectName?: string;
  priority: 'High' | 'Medium' | 'Low';
  estimate: number; // in hours
  dueDate: string;  // YYYY-MM-DD
  checklist: string[];
}

/**
 * Handles creation of a Task page and populates it with checklist blocks.
 */
export async function createTaskInNotion(
  notion: Client,
  dbId: string,
  task: TaskInput,
  projectId?: string,
  dailyLogId?: string
): Promise<string> {
  const properties: any = {
    Name: { title: [{ text: { content: task.name } }] },
    Priority: { select: { name: task.priority } },
    Estimate: { number: task.estimate },
    Date: { date: { start: task.dueDate } },
  };

  if (projectId) {
    properties.Project = { relation: [{ id: projectId }] };
  }
  if (dailyLogId) {
    properties['Daily Log'] = { relation: [{ id: dailyLogId }] };
  }

  const response = await notion.pages.create({
    parent: { database_id: dbId },
    properties,
  });

  // Inject checklist as to_do blocks if present
  if (task.checklist.length > 0) {
    await notion.blocks.children.append({
      block_id: response.id,
      children: task.checklist.map(item => ({
        object: 'block',
        type: 'to_do',
        to_do: {
          rich_text: [{ type: 'text', text: { content: item } }],
          checked: false,
        },
      })),
    });
  }

  return response.id;
}
```

## Testing Strategy
- **Framework**: Simple testing using standalone TypeScript run-scripts in `tests/localTest.ts` to mock incoming updates and perform assertion logs.
- **Mocking**: Mocking Telegram and Notion HTTP calls where necessary, or running live test calls against a test Notion Workspace.
- **Coverage**: Focus on parsing accuracy (Gemini output schema matching) and rollback/rollover correctness.

## Boundaries
- **Always**:
  - Catch Notion and Gemini API rate limits and log error codes clearly.
  - Return HTTP 200 to Telegram within 2000ms to avoid webhook retry loops, then process business logic asynchronously if needed.
  - Validate all expected environment variables at startup.
- **Ask first**:
  - Adding new npm dependencies.
  - Modifying the relational mappings between databases.
- **Never**:
  - Hardcode API keys or secret tokens.
  - Delete items from Notion database (always mark as 'Done' or move status, rather than deleting).

## Success Criteria (Specific and Testable)
1. **FR-1 (Intelligent Task Parsing)**: 
   - Inputting `"/add_task Nghiên cứu đối thủ cạnh tranh cho dự án PRJ226, độ ưu tiên High, dự tính 2h"` translates via Gemini to: Task Name `Nghiên cứu đối thủ cạnh tranh`, Project linked to `PRJ226`, Priority `High`, Estimate `2.0`.
   - Gemini successfully yields a checklist array (e.g., `["Tìm kiếm top 3 đối thủ", "Lập bảng so sánh tính năng", "Viết báo cáo đánh giá"]`).
   - Notion Page is created under Tasks DB, containing corresponding unchecked `to_do` blocks.
2. **FR-2 & FR-3 (Interactive Task & Overdue/Rollover Logic)**:
   - `/view_task` displays today's Tasks with project completion ratios (Completed Tasks / Total Tasks in that Project).
   - Pressing `[✅ Complete]` updates Task status to Done in Notion and removes Inline Buttons from the message.
   - Pressing `[⏳ Defer]` or sending conversational text "Chưa xong hôm nay, mới được một nửa thôi" performs:
     - Audit of checklist: retrieves and counts unchecked/checked `to_do` blocks.
     - Decreases original Task Estimate in Notion by 50% (Earned value).
     - Marks original Task Status as Done.
     - Clones a new Task for tomorrow named `[Rollover] <Original Name>`, keeps the Project relation, and migrates only the unchecked `to_do` blocks as children.
3. **FR-4 (Focus Rescue Engine)**:
   - Sending `/rescue` queries Tasks DB for active tasks.
   - Filters out one Task where `Priority = High` and `Estimate <= 0.5` (30 minutes).
   - Returns it to user with a call-to-action message to eliminate choice paralysis.
4. **FR-5 (Daily Log Highlights via Text)**:
   - Sending `/highlight Đạt được cột mốc quan trọng trong việc tối ưu cơ sở dữ liệu` looks up today's Daily Log entry.
   - Uses Gemini to translate to English: `Achieved critical milestone in database optimization`.
   - Updates the `Highlight` text property of that Daily Log page in Notion.
5. **FR-6 (Weekly Retrospective)**:
   - Executing the retro calculates:
     - **Slippage Rate** = `(deferred or rescheduled tasks this week / total tasks planned this week) * 100%`.
     - **Velocity Score** = Sum of `Estimate` values for all tasks marked `Done` this week.
     - **PM Framework Analysis** = Classification of Task Names: `Discovery` (keywords: research, study, design, mockup, evaluate) vs `Delivery` (keywords: implement, code, fix, refactor, deploy, test), returning the percentage split (e.g., 40% Discovery / 60% Delivery).
   - Sends this report automatically (or via command) as a single weekly message.

## Open Questions
- **Daily Log Page ID Generation**: Does the Daily Log page use a standard name format (e.g., "Daily Log 2026-06-15")?
  - *Recommendation*: Yes, name it `YYYY-MM-DD` for easy lookup.
- **Weekly Report Cadence**: Since standard Cloud Functions are triggered by HTTP requests, how will we run the Sunday evening retrospective?
  - *Recommendation*: We can expose a `/weekly_report` trigger HTTP endpoint, which can be called by an external cron job (like GCP Cloud Scheduler), or trigger it manually via `/weekly_report` command.
- **Project Progress Calculation**: Does the bot calculate Project progress dynamically by querying all Tasks linked to that Project ID, or does it rely on a roll-up/relation in Notion?
  - *Recommendation*: The bot will query tasks linked to the project dynamically via the Notion API to get an accurate, real-time count.
