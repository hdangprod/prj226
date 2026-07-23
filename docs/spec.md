---
title: "Spec: Telegram Bot Notion Second Brain Orchestrator"
version: 2.0.0
date: 2026-07-23
type: specification
---

# Spec: Telegram Bot Notion Second Brain Orchestrator

## Objective
Create a serverless Telegram Bot written in TypeScript, integrated with the Gemini API to manage a 5-database Notion Second Brain system (based on PARA methodology: Tasks, Projects, Areas, Resources, Daily Logs). The bot acts as a conversational productivity assistant built upon a 4-Layer Closed-Loop System that processes text, URLs, and voice notes seamlessly.

## Tech Stack
- **Language**: TypeScript (v5.3.3)
- **Runtime**: Node.js (v20+)
- **Execution Environment**: GCP Functions Framework (v3.5.1) on Cloud Run / Cloud Functions
- **Notion SDK**: `@notionhq/client` (v2.2.15)
- **Generative AI SDK**: `@google/generative-ai` (v0.21.0) with dynamic dual-model routing
- **State Management**: `@google-cloud/firestore` (Native Mode serverless persistence)
- **Integrations**: `googleapis` (v173.0.0) for Google Calendar busy slot lookups

## Database Schema (Notion)
The system connects to 5 core Notion databases:
- **Tasks**: `Name` (Title), `Status` (Select: `Not Started`, `On Hold`, `In Progress`, `Done`, `Archived`), `Priority` (Select: High, Medium, Low), `Estimate` (Number), `Date` (Date), `Project` (Relation), `Daily Log` (Relation).
- **Projects**: `Name` (Title), `Status` (Select), `Area` (Relation), `Tasks` (Relation).
- **Daily Logs**: `Name` (Title: YYYY-MM-DD), `Date` (Date), `Highlight` (Rich Text), `Tasks` (Relation).
- **Areas**: `Name` (Title), `Projects` (Relation), `Resources` (Relation).
- **Resources**: `Name` (Title), `URL` (URL), `Area` (Relation).

## Architecture: 4-Layer Closed-Loop System

```
                           +--------------------------+
                           |     Telegram Webhook     |
                           +------------+-------------+
                                        |
                                        v
                            [Sensor Layer: Webhook]
                                        |
                                        v (dispatch: sync / cloud_tasks)
                          [Governance: Intent Router] <---> [Firestore (HITL state)]
                                        |
                 +----------------------+----------------------+
                 |                      |                      |
                 v (Confidence >= 95%)  v (Confidence < 95%)   v
          [Skills Layer]          [HITL Manager]       [Tool Layer]
        - taskCaptureSkill      - inline keyboard      - NotionClient
        - weeklyPlanningSkill                          - FirestoreClient
                                                       - GoogleClient
                                                       - TelegramClient
```

### 1. Sensor Layer (`src/sensors/`)
Ingests raw Telegram update signals (text, `.ogg` voice notes, URLs), transcribes voice inputs using Gemini LITE inline data processing, and decouples thread execution.
- `telegramWebhook.ts`: Webhook receiver returning HTTP 200 OK instantly.
- `eventDispatcher.ts`: Routes payload synchronously (`QUEUE_MODE='sync'`) or asynchronously via GCP Cloud Tasks (`QUEUE_MODE='cloud_tasks'`).
- `voiceProcessor.ts`: Downloads `.ogg` audio files, calls Gemini LITE to transcribe, and strips filler words.

### 2. Governance Layer (`src/governance/`)
Probabilistic routing and session state management.
- `intentRouter.ts`: Evaluates intent (`Add Task`, `Rescue`, `Highlight`, `Weekly Planning`) using Gemini LITE. Routes score $\ge 95\%$ to Skills/Tools, and score $< 95\%$ to HITL.
- `hitlManager.ts`: Manages Human-In-The-Loop interactive inline keyboards on Telegram and handles session TTL state in Firestore.

### 3. Tool Layer (`src/tools/`)
Deterministic API clients without AI reasoning. Encapsulates error handling, retries, and rate limits.
- `notionClient.ts`: Notion SDK wrapper with exponential backoff and `delay(350)` rate-limit throttles.
- `firestoreClient.ts`: Serverless session state, planning draft persistence, and TTL cleanup.
- `googleClient.ts`: Google Calendar API integration for busy slot lookups.
- `telegramClient.ts`: Low-level Telegram Bot API wrappers with HTML parse mode.

### 4. Skills Layer (`src/skills/`)
Stateful multi-tool workflow orchestration.
- `taskCaptureSkill.ts`: Parses natural language tasks, matches projects/areas, generates task prefixes, and commits pages to Notion.
- `weeklyPlanningSkill.ts`: Synthesizes Google Calendar busy slots with Gemini PRO reasoning to output conflict-free weekly schedules and manage Firestore draft approval flows.

---

## Multi-Model Routing Strategy
- **LITE Model Tier (`MODELS.LITE`)**: Configured via `GEMINI_MODEL_LITE` (default: `gemini-3.1-flash-lite`) for high-frequency tasks: Voice note transcription, Intent routing, Task extraction, and Text cleaning.
- **PRO Model Tier (`MODELS.PRO`)**: Configured via `GEMINI_MODEL_PRO` (default: `gemini-3.1-flash`) for complex reasoning: Bulk weekly schedule synthesis and retrospective analysis.

---

## Commands & Evaluation
- **Build**: `npm run build`
- **Test Harness**: `npm test` (Runs offline integration mock suite)
- **Evaluation Suite**: `npm run evals` (Runs ground-truth dataset eval in `evals/` enforcing $\ge 95\%$ intent classification accuracy)

---

## Dynamic Rule Loading Engine

The project uses a vendor-agnostic Dynamic Rule Loading Engine to manage agent context rules:
- **Manifest** (`.agents/rules-manifest.json`): SSOT mapping rule IDs to keywords, path globs, and Markdown files. Supports `always_on` boolean for global governance rules.
- **Rule Engine** (`.agents/scripts/rule-engine.js`): CLI tool accepting `--path` and `--keyword` flags, evaluates manifest, outputs matching rule Markdown content.
- **Rule Creator** (`.agents/scripts/add-rule.js`): CLI tool enforcing rule creation SOP — auto-generates rule file and updates manifest atomically. Supports `--verify` for integrity auditing.
- **Adapter Pattern**: Platform-specific integration configured per-adapter (Antigravity via `AGENTS.md` directive, Claude Code via `CLAUDE.md`, OpenCode via custom tool, Cursor via `.mdc` sync).

---

## Project Structure
```text
.agents/
├── rules/
│   ├── github-workflow.md         → [Always On] Git, branching, commit & PR rules
│   ├── notion-limits.md           → [On-Demand] Notion API rate limiting & throttling
│   └── centralized-messages.md    → [On-Demand] UI/Bot message constants
├── rules-manifest.json            → [SSOT] Dynamic rule mapping manifest
├── scripts/
│   ├── rule-engine.js             → [Core Engine] CLI rule resolver
│   └── add-rule.js                → [SOP Enforcer] Automated rule creator
├── adapters/
│   └── README.md                  → Platform migration instructions
├── workflows/
│   ├── bug-hunting.md             → [On-Demand] Bug triage & remediation
│   └── deploy-check.md            → [On-Demand] GCP Cloud Run pre-deploy checklist
└── skills/
    └── orchestrator/              → Multi-agent execution loop & self-healing
src/
├── index.ts                       → Webhook entrypoint & routing initialization
├── config.ts                      → Environment validation & model tier definitions
├── sensors/                       → [Sensor Layer] Webhook, Dispatcher & Voice Processing
├── governance/                    → [Governance Layer] Intent Router & HITL Manager
├── tools/                         → [Tool Layer] Notion, Firestore, Google & Telegram Clients
├── skills/                        → [Skills Layer] Task Capture & Weekly Planning Skills
└── constants/                     → Centralized message constants
evals/                             → Ground-truth evaluation dataset & test runner
tests/                             → Offline integration test harness
docs/                              → Documentation & System Specs
```
