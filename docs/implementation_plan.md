# Implementation Plan: Telegram Bot Notion Second Brain Orchestrator

This plan outlines the complete rebuild of the Telegram Bot combined with Gemini API to manage a 5-database Notion Second Brain (Tasks, Projects, Daily Logs, Areas, Resources) from scratch, fulfilling functional requirements FR-1 to FR-6 (with FR-5 voice note deferred to future sprints).

## User Review Required

> [!IMPORTANT]
> The database IDs for `AREAS_DB_ID` and `RESOURCES_DB_ID` must be configured in the `.env` file alongside the existing database IDs.
> 
> The 5 Notion databases must have the following schema configuration to enable the relations and fields used by the bot:
> 
> | Database | Expected Properties & Relations |
> | --- | --- |
> | **Tasks** | `Name` (Title), `Status` (Status/Select: Not Started, On Hold, In Progress, Done, Archived), `Priority` (Select: High, Medium, Low), `Estimate` (Number), `Date` (Date), `Project` (Relation to *Projects*), `Daily Log` (Relation to *Daily Logs*) |
> | **Projects** | `Name` (Title), `Status` (Select/Status), `Area` (Relation to *Areas*), `Tasks` (Relation to *Tasks*) |
> | **Daily Logs** | `Name` (Title: YYYY-MM-DD), `Date` (Date), `Highlight` (Rich Text), `Tasks` (Relation to *Tasks*) |
> | **Areas** | `Name` (Title), `Projects` (Relation to *Projects*), `Resources` (Relation to *Resources*) |
> | **Resources** | `Name` (Title), `URL` (URL), `Area` (Relation to *Areas*) |

> [!WARNING]
> Since Google Cloud Functions run serverless on request invocation, the **Weekly Retrospective (FR-6)** cannot run on an internal Node.js timer loop.
> - **Proposed Solution**: We will add a webhook sub-route (`/weekly_report` or check payload parameter) that triggers the report generation and sends it to Telegram. You can call this URL via an external scheduler (e.g., GCP Cloud Scheduler) or invoke it manually in Telegram via the `/weekly_report` command.

## Open Questions

> [!NOTE]
> 1. **Daily Log Entry Naming**: We propose naming Daily Log pages with their respective date in `YYYY-MM-DD` format (e.g. `2026-06-15`). Does this align with your Notion design?
> 2. **Project Completion Metric**: Project completion percentage will be calculated dynamically by the bot querying all Tasks linked to that Project and dividing completed tasks by total tasks. Is this correct?

---

## Proposed Changes

### Component 1: Config and Global Setup
Validate environment parameters and provide standard typed configs.

#### [x] Done [config.ts](file:///Users/dangnguyen/Desktop/PRJ226/src/config.ts)
- [x] Done: Load environment variables from `.env` using `dotenv`.
- [x] Done: Export a validated configuration object (`NOTION_TOKEN`, `TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`, database IDs). Raise an descriptive error if any required variables are missing.

---

### Component 2: Notion API Client
Encapsulate all queries, block retrievals, page creation, and updates.

#### [x] Done [types.ts](file:///Users/dangnguyen/Desktop/PRJ226/src/notion/types.ts)
- [x] Done: Define TypeScript interfaces for Tasks, Projects, Daily Logs, Areas, and Resources.
- [x] Done: Define Task status enum to strictly type: `Not Started`, `On Hold`, `In Progress`, `Done`, `Archived`.

#### [x] Done [client.ts](file:///Users/dangnguyen/Desktop/PRJ226/src/notion/client.ts)
- [x] Done: Instantiate `@notionhq/client`.
- [x] Done: Implement `findOrCreateDailyLog(dateStr: string)`: looks up `Daily Logs` DB by name/title (`YYYY-MM-DD`). If not found, creates a new log page.
- [x] Done: Implement `addTask(task: TaskInput, projectId?: string, dailyLogId?: string)`: creates task page and appends checklist items as `to_do` blocks.
- Implement `getTaskWithChecklist(taskId: string)`: fetches Task properties and retrieves child blocks to audit unchecked `to_do` elements.
- Implement `completeTask(taskId: string)`: updates Task status/property to Done.
- Implement `updateTaskEstimate(taskId: string, newEstimate: number)`: updates the Estimate property.
- Implement `cloneTaskForTomorrow(originalTask: any, uncheckedChecklistItems: string[])`: clones the task, linking to the tomorrow Daily Log, copying unchecked checklist blocks, and retaining the Project relation.
- Implement `fetchTodayTasks()`: queries all active tasks linked to today's Daily Log.
- Implement `fetchActiveProjects()`: retrieves all active projects for semantic matching.
- Implement `fetchProjectTasksProgress(projectId: string)`: queries tasks linked to a project to calculate completed vs total tasks.
- Implement `fetchWeeklyTasksForReport()`: queries Tasks DB for tasks due in the last 7 days to compile stats.
- Implement `addResource(title: string, url: string, areaId?: string)`: creates a Resource page and links to the Area.
- Implement `fetchAreas()`: fetches Areas DB to allow Gemini to classify resources.

---

### Component 3: Gemini API Wrapper
Manage natural language parsing and performance summaries.

#### [x] Done [client.ts](file:///Users/dangnguyen/Desktop/PRJ226/src/gemini/client.ts)
- [x] Done: Configure Gemini SDK (`gemini-2.5` or `gemini-1.5-pro` as appropriate).
- [x] Done: Implement `parseTaskInput(text: string, projects: any[])`: parses natural language input into JSON containing task name, matching project ID, priority, estimate, and checklist subtasks.
- Implement `classifyResource(title: string, url: string, areas: any[])`: matches a resource name to the most appropriate Area ID.
- Implement `translateHighlight(text: string)`: translates highlight text to professional-grade English.
- Implement `classifyDiscoveryDelivery(taskNames: string[])`: classifies a list of tasks into Discovery vs Delivery.

---

### Component 4: Telegram Webhook Routing & Client
Manage message dispatch, inline keyboards, and request routing.

#### [x] Done [client.ts](file:///Users/dangnguyen/Desktop/PRJ226/src/telegram/client.ts)
- [x] Done: Implement `sendMessage(chatId: number, text: string, replyMarkup?: any)`: helper to post messages or inline buttons.
- [x] Done: Implement `editMessageText(chatId: number, messageId: number, text: string, replyMarkup?: any)`: updates messages to show task completion status.
- [x] Done: Implement `answerCallbackQuery(callbackQueryId: string)`: acknowledges inline keyboard interactions.

#### [x] Done [index.ts](file:///Users/dangnguyen/Desktop/PRJ226/index.ts)
- [x] Done: Overwrite to act as the primary route handler for the GCP Functions Framework webhook.
- [x] Done: Match incoming payloads:
  - Callback queries: `complete_<id>` or `defer_<id>`.
  - Commands: `/start`, `/view_task`, `/rescue`, `/highlight <text>`, `/weekly_report`, or raw task text.
- [x] Done: Route resource saving: If the input contains a URL, trigger Resource saving logic.

---

### Component 5: Business Logic Services
Coordinate task execution, rollover, rescue recommendations, and retrospect summaries.

#### [x] Done [taskService.ts](file:///Users/dangnguyen/Desktop/PRJ226/src/services/taskService.ts)
- [x] Done: Coordinate task creation, mapping to projects and logs.
- Implement rollover logic: Audit child blocks of the task, compute 50% estimate adjustment, set original task status, and clone the rollover task for tomorrow.
- Implement `rescueTask()`: Query today's tasks, search for one task with `Priority: High` and `Estimate <= 0.5` hours, and recommend it.

#### [NEW] [reportService.ts](file:///Users/dangnguyen/Desktop/PRJ226/src/services/reportService.ts)
- Compile weekly task outcomes.
- Compute **Slippage Rate** and **Velocity Score**.
- Map tasks to Discovery vs Delivery using Gemini.
- Assemble report message.

#### [MODIFY] [localTest.ts](file:///Users/dangnguyen/Desktop/PRJ226/localTest.ts)
- Overwrite to provide mock payloads for testing task creation, rollover auditing, rescue recommendations, resource classification, and report calculations locally.

---

## Verification Plan

### Automated Tests
Execute local integration simulation:
```bash
npm test
```

### Manual Verification
1. Configure webhook endpoint to Telegram Bot.
2. Send `/start` and verify greeting response.
3. Add a task with natural language (e.g., `Thiết kế UI mới cho dự án A hôm nay, priority High, 2h`). Verify task created on Notion with inline checklists.
4. Send `/view_task`, verify inline keyboards render.
5. Click `[✅ Complete]` on a task, confirm status becomes Done in Notion.
6. Click `[⏳ Defer]` on a task, verify the estimate is cut in half, status is Done, and a new `[Rollover]` task is created for tomorrow with remaining checklist items.
7. Send a URL (e.g., `https://example.com/notion-api-guide`), verify resource is parsed, matched to an Area, and saved.
8. Send `/weekly_report` and verify metric outputs.
