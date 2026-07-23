# Implementation Plan: Rebuild PRJ226 (Liam) into 4-Layer Closed-Loop System

This plan outlines the migration from the flat codebase layout to Nima Torabi's 4-layer Closed-Loop Operational Architecture (Sensor, Governance, Tool, Skills), incorporating environment-driven async decoupling (`sync` vs `cloud_tasks`), Voice-to-Text inputs, a Firestore-persisted HITL flow, and a live Gemini-driven routing evaluation suite.

## Proposed Directory Structure Refactoring

We will clean up the existing flat structure and organize files as follows:

```text
evals/
├── golden-dataset.json     # [NEW] 50-100 ground-truth conversation samples
└── run-evals.ts            # [NEW] Evals test runner script
src/
├── index.ts                # [MODIFY] GCP Cloud Functions entrypoint (/webhook and /worker)
├── config.ts               # [MODIFY] Centralized configurations and environment keys
├── constants/
│   └── messages.ts         # [MODIFY] Updated user-facing bot messages
├── sensors/
│   ├── eventDispatcher.ts  # [NEW] Decouples execution thread (sync vs cloud_tasks)
│   ├── voiceProcessor.ts   # [NEW] Transcribes OGG audio and strips filler words
│   └── telegramWebhook.ts  # [NEW] Parses incoming updates and triggers dispatcher
├── governance/
│   ├── intentRouter.ts     # [NEW] Probabilistic intent classification using Gemini LITE
│   └── hitlManager.ts      # [NEW] Persists state and presents inline menus for low-confidence inputs
├── tools/
│   ├── notionClient.ts     # [NEW] Notion client (handles rate limits & backoff retries internally)
│   ├── firestoreClient.ts  # [NEW] Firestore state management client
│   ├── googleClient.ts     # [NEW] Google Calendar API client
│   └── telegramClient.ts   # [NEW] Telegram bot client
├── skills/
│   ├── taskCaptureSkill.ts # [NEW] NLP Task creator skill (captures description, project, checklists)
│   └── weeklyPlanningSkill.ts # [MODIFY] Formulates weekly commitments against calendar conflicts
tests/
└── localTest.ts            # [MODIFY] Local offline integration tests
```

---

## Migration Plan: Vertical Slices (Tracer Bullets)

Each vertical slice represents a complete, functional loop traversing all four layers. The codebase will remain buildable and testable after each slice.

### Slice 1: Core Setup & Basic Text Routing (Health Check)
- **Goal:** Set up routing and environment strategy so that the bot can receive text messages and reply to simple commands.
- **Proposed Changes:**
  - Create the directories `src/sensors/`, `src/governance/`, `src/tools/`.
  - Implement `src/tools/telegramClient.ts` containing basic wrappers like `sendMessage`.
  - Implement `src/sensors/eventDispatcher.ts` that acts as the router proxy:
    - Sets up the strategy: `QUEUE_MODE` environment variable (`sync` vs `cloud_tasks`).
    - If `sync`, triggers the worker logic inline.
    - If `cloud_tasks`, pushes payload to the GCP Cloud Tasks queue.
  - Implement `src/index.ts` containing the dual HTTP endpoints:
    - `/webhook`: Dispatches the Telegram payload asynchronously and immediately returns `200 OK`.
    - `/worker`: Executes the main routing logic (calls `handleWorkerPayload`).
  - Implement `src/governance/intentRouter.ts` using Gemini LITE to route simple intents (e.g. `/start` mapped to the greeting).
    - **Global Catch:** The async core handler `handleWorkerPayload` must be completely wrapped in a global `try-catch` block. If an unhandled exception or API failure occurs post-decoupling, the catch block must explicitly trigger `telegramClient.sendMessage` to deliver a polite, user-facing error notification (Graceful Degradation) directly to the user's chat, rather than failing silently in GCP logs.
  - Update `tests/localTest.ts` to mock incoming updates and set `QUEUE_MODE = 'sync'` programmatically.
- **DoD:** `npm run build` compiles without errors, and running `npm test` successfully prints the welcome response for a `/start` update.

### Slice 2: Deep Tool Layer & Task Capture Loop (Text-to-Notion)
- **Goal:** Migrate Notion client and implement NLP task capture.
- **Proposed Changes:**
  - Create `src/tools/notionClient.ts` by consolidating Notion query and creation functions.
    - Wrap Notion API calls in retry-on-rate-limit logic using an exponential backoff helper.
  - Create `src/tools/firestoreClient.ts` to manage user sessions and draft storage.
    - **Session Expiration:** Implement a timestamp-based TTL (Time-To-Live) verification of 5 minutes for user sessions. When evaluating incoming updates, if an existing state is older than 5 minutes, mark it as expired, clear the session automatically, and treat the new incoming payload as a fresh independent intent request.
  - Create `src/skills/taskCaptureSkill.ts` to encapsulate the task creation business logic (parsing, project fuzzy-matching, area selection, auto-prefix counting).
  - Configure `src/governance/intentRouter.ts` to identify the `Add Task` intent (e.g. commands starting with `/add_task` or messages describing tasks) with confidence evaluation.
- **DoD:** Running `npm test` processes a natural language task request, fuzzy matches the project, retrieves task counts, prefixes the name appropriately, and creates a task with checklist items in the Notion database.

### Slice 3: Voice Note Sensor Loop (Multi-modal Input)
- **Goal:** Enable multi-modal signal intake via Telegram voice notes.
- **Proposed Changes:**
  - Implement `src/sensors/voiceProcessor.ts`:
    - Reads Telegram voice update, calls `telegramClient.ts` to fetch file paths via `getFile`, and downloads the voice note `.ogg` file.
    - Transcribes the audio data using Gemini LITE's multi-modal capabilities (`inlineData` of mime type `audio/ogg`), prompting it to strip filler words ("ờ", "à", "uhm").
  - Update `src/sensors/telegramWebhook.ts` to intercept voice notes, send them to the `voiceProcessor`, and feed the transcribed text directly into the `eventDispatcher`.
- **DoD:** Mocking a voice note payload in `tests/localTest.ts` correctly extracts the text, transcribes it, and routes it to the correct intent destination (e.g., adding a task or saving a highlight).

### Slice 4: Probabilistic Routing & HITL Clarification Loop
- **Goal:** Resolve low-confidence intents via human-in-the-loop (HITL) confirmation.
- **Proposed Changes:**
  - Update `src/governance/intentRouter.ts` to calculate a confidence score for all incoming messages.
  - Implement `src/governance/hitlManager.ts`:
    - If confidence < 95%, write the message payload and confidence data to Firestore user sessions under state `AWAITING_HITL_CONFIRMATION`.
    - Generate inline keyboards presenting potential intents (e.g. `[📁 Add Task]`, `[⚡ Focus Rescue]`, `[💡 Add Highlight]`, `[📅 Plan Week]`).
    - **Session Cancellation:** Always append a final `[❌ Hủy bỏ]` button to the inline keyboard layout, returning callback payload: `hitl_cancel`.
  - Update `src/index.ts` to process callback queries:
    - If action starts with `hitl_confirm:`, load the session, retrieve the original text, and execute the selected intent.
    - If action is `hitl_cancel`, immediately wipe the active Firestore state and notify the user that the action was cancelled.
- **DoD:** Sending an ambiguous message (e.g., "Liam, check this") triggers the inline keyboard. Selecting `[Add Task]` via the callback query successfully creates a task in Notion using the original text.

### Slice 5: Weekly Planning Skill & Calendar Integration
- **Goal:** Port the weekly planning capability to the Skills layer and integrate Google Calendar busy slots.
- **Proposed Changes:**
  - Create `src/tools/googleClient.ts` containing the JWT-authorized Google Calendar integration.
  - Implement `src/skills/weeklyPlanningSkill.ts` by migrating `WeeklyPlanningSkill.ts`:
    - Calls `googleClient.ts` to gather busy schedules.
    - Queries Notion Tasks DB for scheduled active tasks.
    - Submits the aggregated context to Gemini PRO to compile optimal schedules.
    - Persists draft schedules to Firestore.
    - Integrates rate-limiting throttle delays (350ms) during bulk creation.
- **DoD:** Running `tests/localTest.ts` executes a weekly planning session, incorporates mocked Google Calendar events, registers the planning draft in Firestore, and successfully creates bulk tasks in Notion when confirmed.

### Slice 6: Evals Suite (Routing Accuracy Benchmark)
- **Goal:** Establish a testing suite to guarantee intent routing accuracy.
- **Proposed Changes:**
  - Create `evals/golden-dataset.json` containing 50-100 ground-truth examples of user commands, natural texts, and speech transcripts.
  - Create `evals/run-evals.ts` script that:
    - Loads the dataset.
    - Submits each text to the live `intentRouter.ts` using the real Gemini LITE API.
    - Compares outcomes against the ground-truth annotations.
    - Reports total accuracy. Enforces $\ge 95\%$ accuracy threshold.
  - **Token Optimization:** Decouple `evals/run-evals.ts` from `npm test`. Wire the evaluation suite execution exclusively to a dedicated command (`npm run evals`). It must only run on demand or right before raising a Pull Request.
- **DoD:** Running `npm run evals` successfully benchmark routes and returns an accuracy score $\ge 95\%$.

---

## Verification Plan

### Automated Tests
1. **Local Test harness:**
   - Execute: `npm test` (or `npx ts-node tests/localTest.ts`)
   - Verifies the end-to-end processing pipelines in `sync` mode.
2. **Evals Suite:**
   - Execute: `npm run evals`
   - Verifies intent routing accuracy under a live Gemini API environment.
3. **Build verification:**
   - Execute: `npm run build`
   - Validates code compilation.

### Manual Verification
- Testing payload simulations via Postman/cURL targeting local/staging serverless functions.
- Deploying updates to the GCP test workspace and confirming correct response delivery on Telegram.
