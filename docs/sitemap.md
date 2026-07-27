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
| **Layer 4: Modular Skills** | `@.agents/skills/orchestrator/SKILL.md`<br>`@src/skills/` | `On-Demand` | Multi-agent execution loop, 6 PRD skill intents (Daily_Focus, Task_Capture, Reschedule, Knowledge_Search, Rescue_Mode, Session_Handoff). |
| **Layer 5: Tools & Integrations**| `@src/tools/`<br>`@src/router/llmRouter.ts`<br>`@.agents/rules-manifest.json` | `On-Demand` | Dynamic rule engine, provider-agnostic LLMRouter, Neon DB client, Telegram client, GitHub client. |
| **Issue Plans & Solutions** | `@docs/plans/issue-[ID]/` | `Task-Scoped` | Pre-execution plan (`plan.md`) and detailed solution report (`solution_report.md`). |

---

## 2. Directory Structure

```
.
├── AGENTS.md                          # [AIOS Layer 1] System identity & core directives
├── wrangler.toml                      # Cloudflare Worker configuration (Durable Objects, Queues, KV, Crons)
├── .agents/
│   ├── rules/
│   │   ├── github-workflow.md         # [AIOS Layer 1 - Always On] Git, branching, commit & PR rules
│   │   └── centralized-messages.md    # [AIOS Layer 5 - On-Demand] UI/Bot text message constants
│   ├── rules-manifest.json            # [SSOT] Dynamic rule mapping manifest
│   ├── scripts/
│   │   └── rule-engine.js             # [Core Engine] CLI rule resolver
│   └── workflows/
│       ├── bug-hunting.md             # [AIOS Layer 3 - On-Demand] Bug triage & remediation workflow
│       └── deploy-check.md            # [AIOS Layer 3 - On-Demand] Cloudflare Workers pre-deploy checklist
├── docs/
│   ├── sitemap.md                     # [AIOS Layer 2] Master AI & System sitemap
│   ├── index.md                       # [AIOS Layer 2] Master knowledge base index
│   ├── spec.md                        # [AIOS Layer 2] Complete technical specification (v3.0.0)
│   ├── agents/
│   │   └── context.md                 # [AIOS Layer 2] Architecture & Neon DB schema reference
│   └── plans/                         # [Issue Plans & Solutions Archive]
│       ├── issue-50/                  # Cloudflare Workers + Neon Postgres Greenfield Rewrite (plan.md, solution_report.md)
│       └── issue-52/                  # OpenWiki Private Vault Setup & Native Notion-to-OKF Synthesis (plan.md, solution_report.md)
├── evals/                             # 22 Golden Commands dataset & eval runner
│   ├── golden-dataset.json
│   └── run-evals.ts
├── tests/
│   └── localTest.ts                   # v3.0 Offline integration test harness
├── scripts/
│   ├── sync-notion-to-vault.js        # Notion REST API → OKF Markdown synthesis script
│   └── index-vault-to-neon.js         # OKF Vault → Neon pgvector indexer script
└── src/                               # TypeScript application source code
    ├── index.ts                       # Hono entrypoint & routing initialization
    ├── config.ts                      # Cloudflare Workers environment bindings & type contracts
    ├── router/
    │   └── llmRouter.ts               # Provider-agnostic LLM router (Vercel AI SDK)
    ├── db/
    │   ├── schema.sql                 # Neon 5-table relational + pgvector schema
    │   └── procedures.sql             # Atomic RPC stored procedures
    ├── sensors/
    │   ├── telegramWebhook.ts         # Telegram webhook receiver (< 50ms typing ack)
    │   ├── debounceBuffer.ts          # Durable Object sliding window debounce buffer
    │   └── notionFastSync.ts          # Cloudflare Cron polling sensor
    ├── governance/
    │   ├── intentRouter.ts            # LLM intent classifier (6 intents)
    │   └── hitlManager.ts             # Durable Object HITL session manager
    ├── tools/
    │   ├── neonClient.ts              # Neon serverless HTTP driver client
    │   ├── telegramClient.ts          # Telegram Bot API client (fetch-native)
    │   ├── notionClient.ts            # Notion REST API client (read-only)
    │   └── githubClient.ts            # GitHub REST API client (vault reader)
    └── skills/                        # 6 PRD skill handlers
        ├── dailyFocusSkill.ts
        ├── taskCaptureSkill.ts
        ├── rescheduleSkill.ts
        ├── knowledgeSearchSkill.ts
        ├── rescueModeSkill.ts
        └── sessionHandoffSkill.ts
```
