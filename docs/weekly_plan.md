# Weekly Implementation Plan

This document breaks down the current week's work into actionable milestones to ensure continuous progress on the Telegram Bot Notion Second Brain Orchestrator project.

## Current Project Status
- [x] Environment configuration & typing (`src/config.ts`, `src/notion/types.ts`)
- [x] Notion Client Core CRUD operations (`src/notion/client.ts`)
- [x] Auto-prefixing logic and strict status Enums (`Not Started`, `On Hold`, `In Progress`, `Done`, `Archived`)

---

## This Week's Milestones

### Milestone 1: AI Processing Engine (Gemini Client)
**Objective**: Build the intelligence layer to parse natural language into structured data.
- **Tasks**:
  - [x] Implement `parseTaskInput` to extract Task, Project, Priority, Estimate, and Checklist.
  - [x] Implement `parseWeeklyPlan` for FR-7 (bulk task creation).
  - [x] Implement `translateHighlight` for FR-5 (daily log highlights).
  - [x] Implement `analyzeWeeklyReport` for FR-6 (retro analysis).

### Milestone 2: Telegram Interactivity & Routing
**Objective**: Set up the Telegram Webhook receiver to handle user messages and inline keyboard interactions.
- **Tasks**:
  - [x] Create `src/telegram/client.ts` for sending/editing messages and acknowledging callbacks.
  - [x] Set up `src/index.ts` to expose the GCP Functions HTTP endpoint.
  - [x] Route commands: `/start`, `/add_task`, `/view_task`, `/rescue`, `/plan_week`, `/weekly_report`.
  - [x] Handle callback queries (`complete_<id>`, `defer_<id>`, `confirm_bulk_create`).

### Milestone 3: Core Business Services Integration
**Objective**: Connect the Telegram router, Gemini AI, and Notion DB into a cohesive workflow.
- **Tasks**:
  - [x] Create `src/services/taskService.ts` to handle task rollovers, prefixing integration, and Focus Rescue retrieval.
  - [x] Create `src/services/reportService.ts` to calculate Slippage Rate, Velocity Score, and generate Retro reports.

### Milestone 4: End-to-End Testing & Mocking
**Objective**: Ensure the system handles edge cases and API rate limits robustly without breaking production Notion data.
- **Tasks**:
  - [x] Update `tests/localTest.ts` to mock incoming Telegram Webhook payloads.
  - [x] Test the conversational `/plan_week` multi-task parsing and bulk-create logic.
  - [x] Test the Rollover logic (`[⏳ Defer]`) to ensure unchecked checklist items are cloned accurately.

### Milestone 5: Deployment Prep
**Objective**: Successfully launch the bot online.
- **Tasks**:
  - [x] Configure `package.json` build scripts.
  - [x] Set up Google Cloud Functions deployment command (`gcloud functions deploy`).
  - [x] Set the Webhook URL to the Telegram Bot via BotFather API.
