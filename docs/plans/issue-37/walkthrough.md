# Walkthrough: Issue #37 - AIOS 5-Layer Framework & Automatic Documentation Cascade

We have restructured the project rules, directives, and documentation layout to strictly follow the **AIOS (Agentic Operating System) 5-Layer Framework**.

---

## 1. AIOS 5-Layer Structure Mapping

| Layer | Responsibility & Files | Enforced Behavior |
| :--- | :--- | :--- |
| **Layer 1: Identity & Directives** | [`AGENTS.md`](file:///Users/dangnguyen/Desktop/PRJ226/AGENTS.md)<br>[`@.agents/rules/github-workflow.md`](file:///Users/dangnguyen/Desktop/PRJ226/.agents/rules/github-workflow.md) | Global system identity, positive MUST-FOLLOW rules, negative NEVER-DO restrictions, and Git/PR SOPs. |
| **Layer 2: Memory & Context** | [`@docs/sitemap.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/sitemap.md)<br>[`@docs/spec.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/spec.md)<br>[`@docs/agents/context.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/agents/context.md) | Master sitemap index, complete technical specification, and 4-Layer system architecture specs. |
| **Layer 3: Workflows & SOPs** | [`@.agents/workflows/bug-hunting.md`](file:///Users/dangnguyen/Desktop/PRJ226/.agents/workflows/bug-hunting.md)<br>[`@.agents/workflows/deploy-check.md`](file:///Users/dangnguyen/Desktop/PRJ226/.agents/workflows/deploy-check.md) | Standard Operating Procedures for bug triage and GCP Cloud Run deployment verification. |
| **Layer 4: Modular Skills** | [`@.agents/skills/orchestrator/SKILL.md`](file:///Users/dangnguyen/Desktop/PRJ226/.agents/skills/orchestrator/SKILL.md)<br>[`src/skills/`](file:///Users/dangnguyen/Desktop/PRJ226/src/skills/) | Multi-agent execution loop, self-healing runner, task capture & weekly planning skills. |
| **Layer 5: Tools & Integrations**| [`src/tools/`](file:///Users/dangnguyen/Desktop/PRJ226/src/tools/)<br>[`@.agents/rules/notion-limits.md`](file:///Users/dangnguyen/Desktop/PRJ226/.agents/rules/notion-limits.md)<br>[`@.agents/rules/centralized-messages.md`](file:///Users/dangnguyen/Desktop/PRJ226/.agents/rules/centralized-messages.md) | Deterministic clients for Notion, Firestore, Google Calendar, and Telegram, plus rate-limit rules. |

---

## 2. Automatic 3-Step Documentation Cascade Rule

Added directly into **Definition of Done (DoD)** in [`AGENTS.md`](file:///Users/dangnguyen/Desktop/PRJ226/AGENTS.md) and [`.agents/rules/github-workflow.md`](file:///Users/dangnguyen/Desktop/PRJ226/.agents/rules/github-workflow.md):

> **Whenever source code in `src/` or system architecture is modified, the AI agent MUST automatically:**
> 1. Update related technical specs ([`docs/spec.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/spec.md), [`docs/agents/context.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/agents/context.md)).
> 2. Sync file paths and sitemap indexes ([`docs/sitemap.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/sitemap.md), [`docs/index.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/index.md)).
> 3. Pass clean compilation (`npm run build`) and integration tests (`npm test`) before reporting work complete.

---

## 3. Verification & Execution Results
- `npm run build`: Compiled with 0 errors.
- `npm test`: Passed all 14 offline integration test suites.
- `AGENTS.md`, `docs/sitemap.md`, and `docs/index.md` updated and cross-linked.
