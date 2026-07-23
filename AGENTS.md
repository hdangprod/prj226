# PRJ226: AIOS (Agentic Operating System) 5-Layer Framework

Serverless conversational productivity assistant built with TypeScript (v5.3.3) and Node.js (v20+). Orchestrates a Notion Second Brain using Firestore as a state buffer.

---

## Layer 1: Identity & Core Directives

### 1. System Identity & Scope
- **Role**: AI-Native Second Brain Orchestrator & Technical Assistant.
- **System Architecture**: 4-Layer Closed-Loop System (`sensors`, `governance`, `tools`, `skills`).
- **Core Verification Commands**:
  - **Build**: `npm run build`
  - **Local Test Harness**: `npm test` (Offline integration test suite)
  - **Evaluation Suite**: `npm run evals` (Ground-truth dataset accuracy check $\ge 95\%$)
  - **Orchestrator Tick**: `node .agents/skills/orchestrator/scripts/supreme_assistant.js`

### 2. Core Rule (MUST FOLLOW)
> [!IMPORTANT]
> **AUTOMATIC 3-STEP DOCUMENTATION CASCADE**:
> Whenever source code in `src/` or system architecture is modified, the AI agent MUST automatically:
> 1. Update related technical specs ([`docs/spec.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/spec.md), [`docs/agents/context.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/agents/context.md)).
> 2. Sync file paths and sitemap indexes ([`docs/sitemap.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/sitemap.md), [`docs/index.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/index.md)).
> 3. Pass clean compilation (`npm run build`) and integration tests (`npm test`) before reporting work complete.

### 3. Core Restriction (NEVER DO)
> [!CAUTION]
> - Never leave deprecated, orphaned, or unmapped file paths in documentation.
> - Never auto-load or scan files in `docs/artifacts/` (e.g. `PROJECT_JOURNEY.md`, `changelog.md`, `retrospectives/`) during standard coding tasks unless explicitly requested by the user.

### 4. Definition of Done (DoD)
A task or hotfix is considered **Done** ONLY when:
1. Code runs cleanly and passes offline tests (`npm test`).
2. `npm run build` compiles with 0 errors.
3. The 3-Step Documentation Cascade has updated all associated docs, specs, and `docs/sitemap.md`.

---

## AIOS 5-Layer Structure Index

| AIOS Layer | Scope / Responsibilities | Target Directory / Files |
| :--- | :--- | :--- |
| **Layer 1: Identity & Rules** | Global identity, non-negotiable rules & Git SOPs | [`AGENTS.md`](file:///Users/dangnguyen/Desktop/PRJ226/AGENTS.md), [`@.agents/rules/github-workflow.md`](file:///Users/dangnguyen/Desktop/PRJ226/.agents/rules/github-workflow.md) |
| **Layer 2: Memory & Context** | System specs, schemas, and lazy-loading sitemap | [`@docs/sitemap.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/sitemap.md), [`@docs/spec.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/spec.md), [`@docs/agents/context.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/agents/context.md) |
| **Layer 3: Workflows & SOPs** | Bug triage & Cloud Run deployment checklists | [`@.agents/workflows/bug-hunting.md`](file:///Users/dangnguyen/Desktop/PRJ226/.agents/workflows/bug-hunting.md), [`@.agents/workflows/deploy-check.md`](file:///Users/dangnguyen/Desktop/PRJ226/.agents/workflows/deploy-check.md) |
| **Layer 4: Modular Skills** | Multi-agent execution, task capture, weekly plan | [`@.agents/skills/orchestrator/SKILL.md`](file:///Users/dangnguyen/Desktop/PRJ226/.agents/skills/orchestrator/SKILL.md), [`src/skills/`](file:///Users/dangnguyen/Desktop/PRJ226/src/skills/) |
| **Layer 5: Tools & Integrations**| Deterministic API clients (Notion, Firestore, GCal) | [`src/tools/`](file:///Users/dangnguyen/Desktop/PRJ226/src/tools/), [`@.agents/rules/notion-limits.md`](file:///Users/dangnguyen/Desktop/PRJ226/.agents/rules/notion-limits.md) |

---
- Master Sitemap: `@docs/sitemap.md`
