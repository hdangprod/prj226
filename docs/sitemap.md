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
| **Layer 2: Memory & Context** | `@docs/sitemap.md`<br>`@docs/spec.md`<br>`@docs/agents/context.md` | `On-Demand` | Master lazy-loading sitemap index, complete technical spec, 5-Layer system & DB schemas. |
| **Layer 3: Workflows & SOPs** | `@.agents/workflows/bug-hunting.md`<br>`@.agents/workflows/deploy-check.md` | `On-Demand` | 4-step bug triage & remediation, Cloudflare Workers pre-deploy checklist. |
| **Layer 4: Modular Skills** | `@.agents/skills/orchestrator/SKILL.md`<br>`@.agents/skills/*/SKILL.md`<br>`@src/skills/` | `On-Demand` | PRJ226 orchestrator delegation layer + 7 PRD skill intents (Daily_Focus, Task_Capture, Reschedule, Knowledge_Search, Rescue_Mode, Session_Handoff, Inbox_Organize) + 21 production-grade agent skills (`skills-lock.json` tracks sources). Orchestrator delegates each lifecycle phase to the generic skills and owns only PRJ226 gates (Confidence/HITL, retry<=3 escalation, doc cascade, evals). |
| **Layer 5: Tools & Integrations**| `@src/tools/`<br>`@src/router/llmRouter.ts`<br>`@src/lib/`<br>`@.agents/rules-manifest.json` | `On-Demand` | Dynamic rule engine, provider-agnostic LLMRouter, D1 client, Vectorize client, GitBatch client, GitHubReader, Telegram client. |
| **Issue Plans & Solutions** | `@docs/plans/issue-[ID]/` | `Task-Scoped` | Pre-execution plan (`plan.md`) and detailed solution report (`solution_report.md`). |

---

## 2. Directory Structure

```
.
├── AGENTS.md                          # [AIOS Layer 1] System identity & core directives
├── wrangler.toml                      # Cloudflare Worker configuration (D1, Vectorize, AI, KV, Crons)
├── skills-lock.json                   # Installed agent-skills source & hash lockfile
├── .agents/
│   ├── rules/
│   │   ├── github-workflow.md         # [AIOS Layer 1 - Always On] Git, branching, commit & PR rules
│   │   ├── database-isolation.md      # [AIOS Layer 1 - Always On] Strict test vs prod D1 isolation rules
│   │   ├── centralized-messages.md    # [AIOS Layer 5 - On-Demand] UI/Bot text message constants
│   │   └── telegram-limits.md         # [AIOS Layer 5 - On-Demand] Telegram payload & character limits
│   ├── rules-manifest.json            # [SSOT] Dynamic rule mapping manifest
│   ├── scripts/
│   │   └── rule-engine.js             # [Core Engine] CLI rule resolver
│   ├── workflows/
│   │   ├── bug-hunting.md             # [AIOS Layer 3 - On-Demand] Bug triage & remediation workflow
│   │   └── deploy-check.md            # [AIOS Layer 3 - On-Demand] Cloudflare Workers pre-deploy checklist
│   └── skills/                        # 21 agent skills (addyosmani/agent-skills) + orchestrator
│       ├── orchestrator/              # PRJ226 orchestrator delegation layer (thin; delegates to generic skills)
│       ├── using-agent-skills/        # Meta: which skill applies
│       ├── spec-driven-development/
│       ├── planning-and-task-breakdown/
│       ├── incremental-implementation/
│       ├── test-driven-development/
│       ├── debugging-and-error-recovery/
│       ├── code-review-and-quality/
│       ├── security-and-hardening/
│       └── ...                        # full lifecycle: define → plan → build → verify → review → ship
├── docs/
│   ├── sitemap.md                     # [AIOS Layer 2] Master AI & System sitemap
│   ├── index.md                       # [AIOS Layer 2] Master knowledge base index
│   ├── spec.md                        # [AIOS Layer 2] Complete technical specification (v4.1.0)
│   ├── agents/
│   │   └── context.md                 # [AIOS Layer 2] Architecture & D1 Edge Stack schema reference
│   └── plans/                         # [Issue Plans & Solutions Archive]
│       ├── issue-50/                  # Cloudflare Workers + Neon Postgres Greenfield Rewrite
│       ├── issue-52/                  # OpenWiki Private Vault Setup & Native Markdown-to-OKF Synthesis
│       ├── issue-54/                  # HNSW Vector Index Migration & Integration Test
│       ├── issue-56/                  # PRJ226 v4.1 Obsidian Edge Stack Migration (D1, Vectorize, Workers AI)
│       ├── issue-56/                  # PRJ226 v4.1 Obsidian Edge Stack Migration (D1, Vectorize, Workers AI)
│       ├── issue-59/                  # PRJ226 v4.1.1 Edge Stack Hardening & Strict Dev/Prod Isolation
│       ├── issue-61/                  # PRJ226 v4.2 Inbox Organizer with Knowledge Graph Connections
│       ├── issue-63/                  # PRJ226 v4.2.1 Universal Zero-Loss Ingestion & 0-Results Search UX Fallback
│       ├── issue-64/                  # PRJ226 v4.3 Self-Evaluation Reflection Loop & Nightly Prompt Optimizer
│       ├── issue-65/                  # PRJ226 Knowledge Search TypeError & Callback Handler Hotfix
│       └── issue-67/                  # PRJ226 Whole-Picture Knowledge Search (sanitizer + topic census + reindex self-heal) — DONE, see solution_report.md
├── evals/                             # 22 Golden Commands dataset & eval runner
│   ├── golden-dataset.json
│   └── run-evals.ts
├── tests/
│   ├── localTest.ts                   # v4.3 Offline integration test harness (28 assertions)
│   └── telegramBotFlows.test.ts       # v4.3 Telegram bot output suite (51 assertions; npm run test:bot)
├── migrations/                        # Cloudflare D1 SQL Migrations
│   ├── 0001_init.sql                  # [Historical] Initial schema
│   ├── 0002_v4_edge_stack.sql         # [Historical] D1 SQLite + FTS5 initial schema
│   ├── 0003_v4_1_1_edge_patches.sql   # [Historical] System state, inbox logs, deferred queues schema
│   ├── 0004_inbox_organize.sql        # [Active] Pending captures status lifecycle & organized path schema
│   ├── 0005_eval_history.sql          # [Active] Self-Evaluation Reflection Loop tables (eval_history, eval_iterations, prompt_versions)
│   └── 0006_capture_needs_review.sql  # [Active] needs_review flag: keeps only unprocessed/low-confidence prompts in /inbox
├── scripts/
│   └── seed-dev.sql                   # [Dev] Wipes + seeds realistic demo data in prj226-brain-dev (dev ONLY)
└── src/                               # TypeScript application source code
    ├── index.ts                       # Hono entrypoint & routing initialization
    ├── config.ts                      # Cloudflare Workers environment bindings & type contracts
    ├── router/
    │   └── llmRouter.ts               # Provider-agnostic LLM router (Vercel AI SDK); auto-retries transient 429/5xx
    ├── lib/
    │   ├── embeddings.ts              # Workers AI embeddings & SHA-256 content hash
    │   ├── chunking.ts                # Heading-based Markdown chunker & frontmatter parser
    │   ├── hybridSearch.ts            # RRF hybrid search engine (excludes raw inbox/ staging captures)
    │   ├── querySanitizer.ts          # Natural language query keyword extractor & FTS5 sanitizer
    │   ├── reflectionLoop.ts          # Self-Evaluation Generate→Judge→Refine pipeline with token tracking
    │   ├── fetchUtils.ts              # Resilient fetchWithRetry helper
    │   └── dateUtils.ts               # UTC+7 local date & time path generator
    ├── indexers/
    │   ├── vaultIndexer.ts            # GitHub Push Webhook handler (edge cache indexer)
    │   └── reconciler.ts              # GitHub webhook reconciliation cron trigger
    ├── sensors/
    │   └── telegramWebhook.ts         # Telegram webhook receiver (Whisper AI + KV 4s debounce)
    ├── governance/
    │   └── intentRouter.ts            # LLM intent classifier (7 intents + Auto-Capture + HITL)
    ├── tools/
    │   ├── d1Client.ts                # D1 database prepared-statement client (search census excludes inbox/)
    │   ├── vectorizeClient.ts         # Cloudflare Vectorize client
    │   ├── gitBatchClient.ts          # GitHub Git Data API batch commit client
    │   ├── githubClient.ts            # GitHub Git Data API blob reader (GitHubReader)
    │   └── telegramClient.ts          # Telegram Bot API client (fetch-native)
    ├── skills/                        # 7 PRD skill handlers + nightly optimizer
    │   ├── dailyFocusSkill.ts
    │   ├── taskCaptureSkill.ts
    │   ├── rescheduleSkill.ts
    │   ├── knowledgeSearchSkill.ts
    │   ├── rescueModeSkill.ts
    │   ├── sessionHandoffSkill.ts
    │   ├── inboxOrganizeSkill.ts
    │   └── nightlyOptimizer.ts        # Cron: analyzes failed eval traces & proposes prompt improvements
    └── types/
        └── index.ts                   # Re-exported type definitions hub
```
