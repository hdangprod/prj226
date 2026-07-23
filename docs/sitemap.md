# AI & System Sitemap (AIOS Layer 2)

This sitemap provides a lazy-loading reference index for AI agents and human developers structured by the **AIOS 5-Layer Framework**. It maps specific task intents to exact rule files, workflows, and documentation specs to minimize context token consumption.

> [!IMPORTANT]
> **AI LAZY-LOADING DIRECTIVE**: Do NOT read all files preemptively. Only fetch a file when your active task matches its intent tag.

> [!CAUTION]
> **DO NOT READ `docs/artifacts/` FOR CODING TASKS**: Files under `docs/artifacts/` are human review logs. AI agents must NEVER read `docs/artifacts/` unless the user explicitly requests project history analysis.

---

## 1. AIOS Layer Mapping Matrix

| AIOS Layer | Target Reference File | Token Policy | Scope / Intent |
| :--- | :--- | :--- | :--- |
| **Layer 1: Identity & Rules** | `@AGENTS.md`<br>`@.agents/rules/github-workflow.md` | `Always On` | System identity, positive MUST-FOLLOW rules, negative NEVER-DO restrictions, Git/PR SOP. |
| **Layer 2: Memory & Context** | `@docs/sitemap.md`<br>`@docs/spec.md`<br>`@docs/agents/context.md`<br>`@docs/troubleshooting.md`<br>`@docs/usage.md` | `On-Demand` | Master lazy-loading sitemap index, complete technical spec, 4-Layer system & DB schemas, operational troubleshooting, user manuals. |
| **Layer 3: Workflows & SOPs** | `@.agents/workflows/bug-hunting.md`<br>`@.agents/workflows/deploy-check.md` | `On-Demand` | 4-step bug triage & remediation, 3-step GCP Cloud Run pre-deploy checklist. |
| **Layer 4: Modular Skills** | `@.agents/skills/orchestrator/SKILL.md`<br>`@src/skills/` | `On-Demand` | Multi-agent execution loop, self-healing runner, task capture & weekly planning skills. |
| **Layer 5: Tools & Integrations**| `@src/tools/`<br>`@.agents/rules/notion-limits.md`<br>`@.agents/rules/centralized-messages.md` | `On-Demand` | Notion API limits, message constants, deterministic Notion, Firestore, Google & Telegram clients. |
| **Issue Plans & Solutions** | `@docs/plans/issue-[ID]/` | `Task-Scoped` | Pre-execution plan (`plan.md`) and detailed solution report (`solution_report.md`). |
| **Artifact Hub (History)** | `@docs/artifacts/PROJECT_JOURNEY.md` | `Human Request Only` | Living project timeline, milestone notes, release changelogs. |

---

## 2. Directory Structure

```
.
├── AGENTS.md                          # [AIOS Layer 1] System identity & core directives
├── .agents/
│   ├── rules/
│   │   ├── github-workflow.md         # [AIOS Layer 1/3 - Always On] Git, branching, commit & PR rules
│   │   ├── notion-limits.md           # [AIOS Layer 5 - On-Demand] Notion API rate limits & throttling
│   │   └── centralized-messages.md    # [AIOS Layer 5 - On-Demand] UI/Bot text message constants
│   ├── workflows/
│   │   ├── bug-hunting.md             # [AIOS Layer 3 - On-Demand] Bug triage & remediation workflow
│   │   └── deploy-check.md            # [AIOS Layer 3 - On-Demand] GCP Cloud Run deployment verification checklist
│   └── skills/
│       └── orchestrator/              # [AIOS Layer 4 - On-Demand] Multi-agent execution loop
├── docs/
│   ├── sitemap.md                     # [AIOS Layer 2] Master AI & System sitemap
│   ├── index.md                       # [AIOS Layer 2] Master knowledge base index
│   ├── spec.md                        # [AIOS Layer 2] Complete technical specification (v2.0.0)
│   ├── notion_database_setup.md       # [AIOS Layer 2] Notion DB 5-Tier setup instructions
│   ├── troubleshooting.md             # [AIOS Layer 2] Operational & troubleshooting guide
│   ├── usage.md                       # [AIOS Layer 2] User operational manual (Vietnamese)
│   ├── usage.en.md                    # [AIOS Layer 2] User operational manual (English)
│   ├── agents/
│   │   └── context.md                 # [AIOS Layer 2] 4-Layer architecture & DB schema reference
│   ├── plans/                         # [Issue Plans & Solutions Archive]
│   │   ├── issue-16/                  # Rollover / Defer Task Logic (plan.md, solution_report.md)
│   │   ├── issue-18/                  # Support Time in Task Dates (plan.md, solution_report.md)
│   │   ├── issue-21/                  # View Task Telegram UI Refactoring (plan.md, solution_report.md)
│   │   ├── issue-23/                  # Conversational Weekly Scheduler V2 (plan.md, solution_report.md)
│   │   ├── issue-25/                  # Weekly Scheduler Output Enhancements (plan.md, solution_report.md)
│   │   ├── issue-27/                  # Fix Scheduler Overlap Logic (plan.md, solution_report.md)
│   │   ├── issue-29/                  # Hybrid Model Routing (LITE vs PRO) (plan.md, solution_report.md)
│   │   ├── issue-31/                  # Fix Temporal Slot Overlaps (plan.md, solution_report.md)
│   │   ├── issue-33/                  # Rebuild into 4-Layer Closed-Loop System (plan.md, solution_report.md)
│   │   └── issue-37/                  # AIOS 5-Layer Alignment (plan.md, solution_report.md)
│   └── artifacts/                     # [Human Reviewer Hub - SKIP FOR CODING TASKS]
│       ├── PROJECT_JOURNEY.md         # Living project timeline & engineering log
│       └── changelog.md               # Major version release notes & refactoring log
└── src/                               # TypeScript application source code
```
