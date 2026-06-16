# Usage Guide — Telegram Notion Second Brain Bot

This guide explains in detail how to set up and use the bot to manage a Notion Second Brain system (PARA methodology) through Telegram.

> 🇻🇳 Phiên bản tiếng Việt: [usage.md](usage.md)

## Table of Contents
1. [Overview](#overview)
2. [First-time Setup](#first-time-setup)
3. [Environment Variables](#environment-variables)
4. [Command List](#command-list)
5. [Command Guide](#command-guide)
6. [Multi-Model Routing](#multi-model-routing)
7. [FAQ](#faq)

---

## Overview

The bot is a conversational productivity assistant running serverless (GCP Functions). You message the bot on Telegram; it uses Gemini to understand natural language and acts directly on 5 Notion databases:

| Database | Role |
|----------|------|
| **Tasks** | Daily action items with checklists, priority, estimate |
| **Projects** | Projects; tasks are linked to their project |
| **Areas** | Long-term areas of responsibility |
| **Resources** | References and materials |
| **Daily Logs** | Per-day journal (`YYYY-MM-DD`) containing highlights |

> **Safety principle**: The bot **never deletes** Notion data. Completed tasks are transitioned to `Done` or cloned as rollover tasks.

---

## First-time Setup

### 1. Prepare accounts & tokens
- **Telegram Bot Token**: create a bot via [@BotFather](https://t.me/BotFather) and grab the token.
- **Notion Integration**: create one at https://www.notion.so/my-integrations to get `NOTION_API_KEY`, then **share** each database with this integration.
- **Notion Database IDs**: open each database on the web and copy the ID from the URL (the 32-char string before `?`).
- **Gemini API Key**: get one at https://aistudio.google.com/app/apikey.

### 2. Install & run locally
```bash
cp .env.example .env
# fill in all values in .env
npm install
npm run build
npm run start   # runs the Functions Framework locally
```

### 3. Set the Telegram webhook
After deploying (or using ngrok for local), register the webhook:
```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=<YOUR_FUNCTION_URL>"
```

### 4. (Optional) Schedule the weekly report
Create a GCP Cloud Scheduler job with cron `0 20 * * 0` (Sunday 8PM) posting to your Cloud Function URL to auto-run `/weekly_report`.

---

## Environment Variables

**Required** variables (see `.env.example`):

```
TELEGRAM_BOT_TOKEN=
NOTION_API_KEY=
NOTION_TASKS_DB_ID=
NOTION_PROJECTS_DB_ID=
NOTION_AREAS_DB_ID=
NOTION_RESOURCES_DB_ID=
NOTION_DAILY_LOGS_DB_ID=
GEMINI_API_KEY=
```

**Optional** variables (override Gemini models without code changes):

```
GEMINI_MODEL_LITE=gemini-1.5-flash   # lightweight, cost-optimized (default)
GEMINI_MODEL_PRO=gemini-1.5-pro      # powerful, logic-optimized (default)
```

> If these are unset, the bot uses the defaults above. Model names change over time, so you only update env values to switch models.

---

## Command List

| Command | Function | Tier |
|---------|----------|------|
| `/add_task <description>` | Create one task from natural language | LITE |
| `/view_task` | View today's tasks + project completion ratios | — |
| `/rescue` | Suggest one High-priority task, ≤ 30 min | LITE |
| `/highlight <text>` | Update Daily Log highlight (auto-translated to English) | LITE |
| `/plan_week <description>` | Plan the week and bulk-create tasks | PRO |
| `/weekly_report` | Weekly retrospective report | PRO |

---

## Command Guide

### `/add_task` — Create one task
Describe the task in a natural sentence. The bot extracts name, project, priority, estimate, and auto-generates a checklist.

**Example:**
```
/add_task Research competitors for project PRJ226, priority High, estimate 2h
```
Result: a page is created in the Tasks DB, with an auto-incrementing prefix (e.g. `PRJ226_T3: ...`) and unchecked `to_do` checklist blocks.

### `/view_task` — View today's tasks
Shows all tasks dated today, with each project's completion ratio (`Done / Total`). Each task has buttons:
- `[✅ Complete]` → mark as `Done`, buttons disappear.
- `[⏳ Defer]` → triggers **rollover** logic (below).

### Rollover (Defer)
When you press `[⏳ Defer]` or send something like "Not done today, only got halfway":
1. Audit checked / unchecked checklist items.
2. Compute **earned value** and reduce the original task's estimate by the completed portion.
3. Mark the original task `Done`.
4. Create a new task for tomorrow named `[Rollover] <Original Name>`, keep the project relation, and migrate only the **unchecked** checklist items.

### `/rescue` — Focus rescue
When you feel "choice paralysis", send `/rescue`. The bot returns **exactly one** High-priority task with estimate ≤ 30 minutes to do right now.

### `/highlight` — Capture a daily highlight
```
/highlight Achieved a critical milestone in database optimization
```
The bot translates it to English and updates today's Daily Log Highlight property (auto-creating the Daily Log if missing).

### `/plan_week` — Plan the week & bulk-create tasks
The most powerful feature: describe your whole week in one message, or paste a transcript of your chat with Gemini, and the bot decomposes it into multiple tasks.

**Example:**
```
/plan_week Next week I'll work on the English-learning product project.
The tasks include: plan user research, create a customer journey map,
do competitive analysis, and write a feature proposal report.
```

**Flow:**
1. The bot uses the **PRO tier** to decompose into multiple tasks, inferring project / priority / estimate / checklist.
2. It fuzzy-matches the project in the Projects DB and applies the auto-incrementing prefix `<Project>_T<n>`.
3. The bot sends a **draft** listing all proposed tasks with 3 buttons:
   - `[✅ Tạo tất cả]` (Create all) → bulk-writes into Notion.
   - `[✏️ Sửa]` (Edit) → discards the draft; resend `/plan_week` with revised text.
   - `[❌ Hủy]` (Cancel) → discards everything, writes nothing.
4. On confirm, the bot creates tasks **sequentially** (correct prefixes + avoids rate limits) and reports the count.

**Example draft the bot returns:**
```
🗓 Weekly Plan Preview (4 tasks)

1. English App_T1: Plan user research
   Priority: High | Est: 3h | Due: 2026-06-17
   • Define research goals
   • Draft interview questions
   • Recruit 5 target users

2. English App_T2: Create customer journey map
   Priority: Medium | Est: 2h | Due: 2026-06-18
   • List usage stages
   • Mark pain points per step

3. English App_T3: Do competitive analysis
   Priority: Medium | Est: 4h | Due: 2026-06-19
   • Pick top 3 competitors
   • Build a feature comparison table

4. English App_T4: Write feature proposal report
   Priority: Low | Est: 2h | Due: 2026-06-20
   • Synthesize insights
   • Propose 3 priority features

[✅ Tạo tất cả]  [✏️ Sửa]  [❌ Hủy]
```
After pressing `[✅ Tạo tất cả]`:
```
✅ Created 4/4 tasks in Notion.
```

> **Note**: If a task has no matching project, the bot still creates it but leaves it unlinked (with a ⚠️ warning in the draft).
>
> **Idempotent**: Each draft has a draft ID; pressing the button multiple times won't create duplicates. If the draft "expired" (server cold start), just resend `/plan_week`.

### `/weekly_report` — Weekly retrospective
Computes hard metrics: **Slippage Rate**, **Velocity Score**, and **Discovery vs Delivery** classification. The metrics are sent to the **PRO tier** (Mentor Liam persona) to analyze bottlenecks and give Product Management advice, returning a synthesized retro message.

---

## Multi-Model Routing

The bot uses 2 model tiers to balance cost and quality:

- **LITE tier** (`MODELS.LITE`): high-frequency, structured, deterministic tasks — command parsing, translation, rescue filtering.
- **PRO tier** (`MODELS.PRO`): low-frequency, complex reasoning — bulk planning (`/plan_week`) and retrospective (`/weekly_report`).

Both are env-driven, overridable via `GEMINI_MODEL_LITE` / `GEMINI_MODEL_PRO`.

---

## FAQ

**Bot not responding?**
Check the webhook is registered with the right URL (`getWebhookInfo`), and the Cloud Function returns HTTP 200 within < 2000ms.

**Created task has no prefix?**
Prefixes are only generated when a task is linked to a project. If your description doesn't mention a project, the task has no prefix.

**`/plan_week` says "expired"?**
The draft is stored in-memory; if the server cold-starts between preview and confirm, the draft is lost. Just resend the command.

**Change the Gemini model?**
Set `GEMINI_MODEL_LITE` / `GEMINI_MODEL_PRO` in env and redeploy — no code changes needed.

**Is any data deleted?**
No. The bot only transitions status or clones; it never deletes a Notion page.
