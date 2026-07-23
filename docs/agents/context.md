# Project Memory: PRJ226 (Liam)

## 1. System Architecture: 4-Layer Closed-Loop System

This system is organized into four separate, decoupled operational layers plus a test evaluation suite.

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

### 1.1 Sensor Layer (`src/sensors/`)
Responsible for ingesting all input signals (text, audio/voice, URLs) from the Telegram webhook, extracting the raw payload, and decoupling the execution thread.
- **`telegramWebhook.ts`**: The receiver of the Telegram webhook payload. In production, it instantly delegates payload dispatching and returns HTTP 200 OK.
- **`eventDispatcher.ts`**: Manages operational decoupling.
  - If `QUEUE_MODE === 'sync'`: Routes payload directly and synchronously to the Governance layer.
  - If `QUEUE_MODE === 'cloud_tasks'`: Pushes the payload to GCP Cloud Tasks queue to invoke the `/worker` endpoint.
- **`voiceProcessor.ts`**: Handles audio/voice inputs (`.ogg` format) from Telegram. Downloads the audio file via Telegram API, passes it to the Gemini API (`inlineData`, `audio/ogg`) to transcribe the text, and strips filler words (e.g., "ờ", "à", "uhm").

### 1.2 Governance Layer (`src/governance/`)
Orchestrates request routing using probabilistic intent evaluation.
- **`intentRouter.ts`**: Uses the Gemini LITE model to evaluate user intent (Add Task, Rescue, Highlight, Weekly Planning) and generates a `confidence_score`.
  - Confidence $\ge$ 95%: Executes automatically by routing to the appropriate Skill or Tool layer.
  - Confidence < 95%: Triggers the HITL Manager.
  - **Decoupled Error Reporting (Global Catch)**: The async core handler `handleWorkerPayload` must be completely wrapped in a global `try-catch` block. If an unhandled exception or API failure occurs post-decoupling, the catch block must explicitly trigger `telegramClient.sendMessage` to deliver a polite, user-facing error notification (Graceful Degradation) directly to the user's chat, rather than failing silently in GCP logs.
- **`hitlManager.ts`**: Persists low-confidence inputs into Firestore under session state `AWAITING_HITL_CONFIRMATION` and returns an inline keyboard to the user on Telegram to clarify their intent. When they select an option, it processes the callback query (`hitl_confirm:<intent>`), updates state, and continues routing.
  - **HITL Session Expiration & Cancellation**:
    1. Always append a final `[❌ Hủy bỏ]` button to the inline keyboard layout, returning a low-byte callback payload: `hitl_cancel`. The sensor layer must catch this to immediately wipe the active Firestore state.
    2. Firestore state has a timestamp-based TTL (Time-To-Live) verification. When evaluating incoming updates, if an existing state is older than 5 minutes, mark it as expired, clear the session automatically, and treat the new incoming payload as a fresh independent intent request.

### 1.3 Tool Layer (`src/tools/`)
Contains raw, deterministic client integrations for external APIs. No AI reasoning or routing occurs here. All error handling, retry policies, and API rate-limiting are encapsulated within these modules.
- **`notionClient.ts`**: Interacts with the Notion database. Handles rate-limiting defensively with strict timeouts and exponential backoff retry logic.
- **`firestoreClient.ts`**: Manages Firestore reads and writes (user sessions, planning drafts, retro metrics).
- **`googleClient.ts`**: Integrates Google Calendar for querying busy slots.
- **`telegramClient.ts`**: Low-level Telegram Bot API wrappers (sendMessage, editMessage, getFile).

### 1.4 Skills Layer (`src/skills/`)
Implements complex, stateful multi-tool workflows.
- **`taskCaptureSkill.ts`**: Parses natural language task descriptions, queries active projects, handles project/area matching, auto-prefixes tasks based on count, and creates task pages in Notion.
- **`weeklyPlanningSkill.ts`**: Uses the Gemini PRO model to parse unstructured weekly schedules, merges them with Google Calendar busy slots, creates structured tasks in Notion with checklist and description metadata, and manages Firestore draft states.

---

## 2. Notion 3-Tier Database Schema

The system integrates with 5 Notion databases, mapping relationships as follows:

```
      +-------------+
      |    Areas    |<--------------+
      +------+------+               |
             |                      |
             | (1:N)                | (1:N)
             v                      |
      +------+------+        +------+------+
      |   Projects  |        |  Resources  |
      +------+------+        +-------------+
             |
             | (1:N)
             v
      +------+------+        +-------------+
      |    Tasks    |<------>|  Daily Logs |
      +-------------+ (N:1)  +-------------+
```

1. **`Areas`** (Lĩnh vực): High-level categories (e.g., Work, Health). Links to Projects and Resources.
2. **`Projects`** (Dự án): Active initiatives with defined scopes. Links to Areas and Tasks.
3. **`Tasks`** (Công việc): Actionable steps. Properties: `Name`, `Status` (`Not Started`, `On Hold`, `In Progress`, `Done`, `Archived`), `Priority` (`High`, `Medium`, `Low`), `Estimate` (hours), `Date` (due date/start date), `Project` (Relation), `Daily Log` (Relation).
4. **`Daily Logs`** (Nhật ký): Daily summaries. Properties: `Name` (`YYYY-MM-DD`), `Date`, `Highlight` (Rich Text), `Tasks` (Relation).
5. **`Resources`** (Tài nguyên): Saved bookmarks. Properties: `Name`, `URL`, `Area` (Relation).

---

## 3. Testing & Evaluation Guardrails

- **Sync Mode testing**: Running `tests/localTest.ts` sets `QUEUE_MODE = 'sync'` programmatically. No external GCP Cloud Task queues are needed for local testing.
- **Evals Suite (`evals/`)**:
  - `golden-dataset.json`: A ground-truth catalog containing 50-100 conversation samples mapped to their expected intent classification.
  - `run-evals.ts`: A test runner executing intent routing queries using the live Gemini LITE API, comparing outputs to the ground-truth dataset, and enforcing a strict $\ge 95\%$ accuracy threshold.
  - **Token Optimization for Evals Suite**: The evaluation suite run-evals.ts is strictly decoupled from the standard `npm test` workflow. It is wired to a dedicated command (`npm run evals`) or established as a Git pre-push hook. It must only run on demand or right before raising a Pull Request.
- **Rate-Limiting Guardrails**: Notion API requests must incorporate throttle delays (350ms) to avoid HTTP 429 errors during bulk creation operations.

---

## 4. Dynamic Rule Loading Engine

Agent context rules are managed via a vendor-agnostic Dynamic Rule Loading Engine rather than static platform-specific injection.

### Architecture
- **Rules** (`.agents/rules/`): Pure Markdown files containing domain-specific constraints (API limits, coding standards, Git SOPs).
- **Manifest** (`.agents/rules-manifest.json`): Single Source of Truth mapping rule IDs to `match_keywords`, `match_paths` (glob patterns), and an `always_on` boolean for global rules.
- **Rule Engine** (`.agents/scripts/rule-engine.js`): CLI tool that evaluates `--path` and `--keyword` inputs against the manifest and outputs matching rule Markdown to stdout.
- **Rule Creator** (`.agents/scripts/add-rule.js`): Enforces creation SOP — auto-generates rule file + manifest entry. `--verify` flag audits manifest/filesystem sync.

### Rule Classification
| Type | `always_on` | Behavior |
|------|-------------|----------|
| **Global Governance** | `true` | Always emitted (e.g., `github-workflow`) |
| **Domain-Specific** | `false` | Emitted only on path/keyword match (e.g., `notion-limits`, `centralized-messages`) |

