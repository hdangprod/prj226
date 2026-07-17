---

# PROJECT ARCHITECTURE & CODEBASE AUDIT: PRJ226 - LIAM

## 1. EXECUTIVE SUMMARY & PROJECT PURPOSE
- **Core Purpose**: A Serverless Telegram Bot orchestrating a Notion Second Brain via Google's Gemini AI. It functions as a Headless Telegram-to-Notion Personal Project Manager, allowing the user to seamlessly capture tasks, plan weeks, log daily highlights, and manage knowledge via a conversational interface.
- **Current Operational State**: Active and robust. The bot handles webhook payloads directly, manages conversational state across multi-step interactions, and interfaces directly with Notion, Google Calendar, and Gemini APIs.

## 2. TECHNOLOGY STACK & DEPENDENCIES
- **Core Language & Runtime**: Node.js 20 with TypeScript (v5.3.3).
- **Infrastructure & Deployment**: Serverless architecture deployed on GCP Cloud Functions (`@google-cloud/functions-framework`). Triggered via HTTP webhooks (`--trigger-http`).
- **Primary APIs & SDKs**:
  - `@notionhq/client` (v2.2.15): Notion Client SDK for interacting with the 3-tier Notion database (Areas, Projects, Tasks).
  - `@google/generative-ai` (v0.21.0): Gemini API integration for intent parsing, task extraction, and content classification.
  - `googleapis` (v173.0.0): Google Calendar API for busy-slot checking during weekly planning.
  - Telegram Bot API: Direct HTTP integration via webhooks.
- **Key Third-Party Libraries**:
  - `@google-cloud/firestore` (v8.6.0): Used for maintaining conversational state and session drafts across stateless function invocations.
  - `dotenv` (v16.4.5): Environment variable management.

## 3. COMPREHENSIVE PROJECT ORGANIZATION & FILE STRUCTURE
```text
PRJ226/
├── package.json               # Defines dependencies, scripts (build, start, deploy)
├── tsconfig.json              # TypeScript compiler configuration
├── docs/                      # Extensive project documentation, plans, specs, and retrospectives
├── tests/
│   └── localTest.ts           # Local testing script
└── src/
    ├── config.ts              # Configuration settings and model definitions
    ├── index.ts               # GCP Cloud Functions HTTP entry point (webhook receiver)
    ├── router.ts              # Main Telegram webhook router and controller logic
    ├── constants/
    │   └── messages.ts        # Centralized static text and Telegram bot messages
    ├── gemini/
    │   └── client.ts          # Gemini API client wrapper (task parsing, classification)
    ├── google/
    │   └── client.ts          # Google API client (Calendar busy slots)
    ├── notion/
    │   ├── client.ts          # Notion API client (CRUD operations for tasks, projects, logs)
    │   └── types.ts           # TypeScript interfaces for Notion schemas
    ├── services/
    │   ├── highlightService.ts # Logic for daily highlight updates
    │   ├── reportService.ts   # Logic for generating weekly retrospectives
    │   ├── stateManager.ts    # Firestore-based conversational state machine
    │   ├── taskService.ts     # Core business logic for task management (rollover, rescue)
    │   └── weeklyScheduleValidator.ts # Logic for validating AI-generated schedules
    ├── skills/
    │   ├── base.ts            # Base class for complex AI skills
    │   └── WeeklyPlanningSkill.ts # Complex workflow orchestrating Gemini, GCal, and Notion
    └── telegram/
        └── client.ts          # Telegram API wrapper (sendMessage, editMessageText, answerCallbackQuery)
```

- **`src/index.ts`**: The execution entry point. Immediately returns 200 OK to prevent webhook timeouts while delegating the payload to `router.ts`.
- **`src/router.ts`**: The central brain. Parses incoming Telegram updates (messages and callback queries), checks session state, and routes to appropriate services.
- **`src/notion/client.ts`**: The Data Access Layer for Notion, abstracting complex Notion API calls into simple functions.
- **`src/services/stateManager.ts`**: Vital for serverless environments. It uses Firestore to remember where a user is in a multi-step conversation (e.g., choosing a project for a task).

## 4. IMPLEMENTED FEATURES & WORKFLOWS (WHAT ACTUALLY WORKS)

- **`/add_task <description>`**:
  - **Trigger**: Telegram text message.
  - **Logic**: Calls Gemini to parse the raw text into structured task data. Checks Notion for active projects. Initiates a session.
  - **Downstream**: Prompts the user via Telegram inline keyboards to select an existing Project or create a new one (and subsequently select an Area). Creates the task in Notion linked to the Daily Log.

- **`/today` or `/tasks`**:
  - **Trigger**: Telegram text message.
  - **Logic**: Queries Notion for tasks due today. Calculates progress percentage for associated projects.
  - **Downstream**: Returns a formatted list in Telegram with deep links to Notion and inline buttons to "Complete" or "Defer".

- **Task Action Buttons (Complete / Defer)**:
  - **Trigger**: Telegram inline callback query (`complete:id` or `defer:id`).
  - **Logic**: 
    - `complete`: Mutates Notion task status to "Done".
    - `defer`: Enters an `AWAITING_DEFER_TIME` state, prompting the user for hours spent, then rolls the task over to tomorrow in Notion.

- **`/rescue`**:
  - **Trigger**: Telegram text message.
  - **Logic**: Scans Notion for the highest priority incomplete task.
  - **Downstream**: Presents the task prominently in Telegram with options to complete or defer.

- **`/highlight <text>`**:
  - **Trigger**: Telegram text message.
  - **Logic**: Fetches today's Daily Log in Notion and updates the "Highlight" property.

- **`/weekly_planning <plan_text>`**:
  - **Trigger**: Telegram text message.
  - **Logic**: Triggers the `WeeklyPlanningSkill`. Uses Gemini (with Lite/Pro routing and fallback) to extract an array of scheduled tasks. Checks Google Calendar for conflicting busy slots.
  - **Downstream**: Provides a preview of the schedule. Upon user confirmation (`schedule_confirm` callback), bulk creates tasks in Notion.

- **`/weekly_report` or `/retro`**:
  - **Trigger**: Telegram text message.
  - **Logic**: Aggregates the week's tasks and daily highlights from Notion, passing them to Gemini to generate a comprehensive retrospective report.

- **Bookmark / Resource Saving**:
  - **Trigger**: User sends any URL (`http://...`).
  - **Logic**: Uses Gemini to classify the URL to infer a title and the most appropriate Notion Area.
  - **Downstream**: Creates a new resource entry in the Notion database.

## 5. DESIGN PATTERNS & CODING SKILLS UTILIZED
- **Architectural Pattern**: 
  - **Serverless Event-Driven**: Built specifically for stateless Cloud Functions. The webhook handler delegates work and terminates immediately to avoid blocking.
  - **Layered Architecture**: Clear separation of concerns (Ingestion -> Routing -> Business Services -> External API Clients).
- **Data Engineering & NLP**:
  - **Structured AI Extraction**: Heavy reliance on Gemini to act as a parser, turning unstructured human text (tasks, schedules, URLs) into strict JSON schemas matching Notion's database structure.
  - **Dynamic Model Routing**: Implements routing between Gemini models (`LITE` vs `PRO`), including a fallback mechanism if `LITE` fails to process a complex weekly plan, complete with daily quota limits for `PRO`.
- **State Management**:
  - **Externalized State Machine**: Since Cloud Functions are stateless, conversational state (like waiting for a user to select a project) is persisted in Firestore using `stateManager.ts`.

## 6. DEVELOPMENT RULES, CONVENTIONS & GUARDRAILS
- **Naming Conventions**: Standard TypeScript conventions applied uniformly (camelCase for variables/functions, PascalCase for classes, SNAKE_CASE for constants).
- **Error Handling & Fail-Safes**:
  - **Early 200 OK**: The HTTP entry point (`index.ts`) responds with 200 OK immediately before heavy processing to prevent Telegram from retrying the webhook.
  - **Graceful Degradation**: Try-catch blocks wrap all route handlers, ensuring the bot responds with a friendly "Something went wrong" message rather than silently failing.
  - **State Expiration**: Callback queries validate session existence. If a user clicks an old inline button, it correctly handles expired sessions.
- **Security**: 
  - Uses `dotenv` for local configuration. Secrets (Notion Token, Telegram Token, Gemini API Key) are expected to be injected via environment variables in the GCP Cloud Functions environment.
