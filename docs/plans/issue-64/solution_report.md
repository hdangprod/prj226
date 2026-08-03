# 5-W Completion Report: Issue #64 — Self-Evaluation Reflection Loop & Nightly Prompt Optimizer

## 1. Context & Problem
When creating tasks (e.g. *"Task - doing competitive research for PRJ226"*), retrieved notes (`prj226-competitor-benchmark.md`, `prj226-roadmap.md`) were truncated to 350 characters and passed to a single-pass LLM. The generated To-do list was generic ("Review requirements", "Document results"), completely ignoring concrete entities, metrics, and Action Items present in the retrieved notes.

## 2. Solution & Architecture
1. **Foundation & LLM Router Upgrade**: Upgraded `LLMRouter` methods (`callFast`, `callFastStructured`, `callPro`) to return `{ data, usage }` with optional `temperature` control and token usage tracking.
2. **Database Migration (`migrations/0005_eval_history.sql`)**: Added `eval_history`, `eval_iterations`, and `prompt_versions` tables for evaluation trace tracking and prompt versioning.
3. **Reflection Loop Core (`src/lib/reflectionLoop.ts`)**:
   - `buildSmartContext()`: Expands note context limit to 3,000 chars/note while preserving Action Items sections.
   - `generateTaskWithReflection()`: Multi-pass Generate→Judge→Refine loop enforcing `GeneratedTasksSchema` and `JudgeEvaluationSchema` (score ≥ 0.8 threshold). Retries with critique injection and temperature decay.
   - Guardrails: 20s wall-clock timeout and 15,000 token budget limit per execution.
4. **Task Capture Refactor (`src/skills/taskCaptureSkill.ts`)**: Integrated reflection loop, non-blocking D1 trace logging (`persistEvalTrace`), and UI quality badges (`✅ AI-Verified` / `⚠️ Needs Review`).
5. **Nightly Prompt Optimizer (`src/skills/nightlyOptimizer.ts`)**: Scheduled cron at `0 20 * * *` (03:00 UTC+7) that analyzes failed eval traces, generates proposed prompt improvements, saves them as `pending` in `prompt_versions`, and sends a digest to Telegram.

## 3. Blast Radius & Files Modified
- `migrations/0005_eval_history.sql`: Created D1 eval tables.
- `src/lib/reflectionLoop.ts`: Implemented core reflection loop & smart context builder.
- `src/skills/nightlyOptimizer.ts`: Implemented cron prompt optimizer.
- `src/router/llmRouter.ts`: Breaking change returning `{ data, usage }`.
- `src/tools/d1Client.ts`: Added eval persistence and query methods.
- `src/skills/taskCaptureSkill.ts`: Rewrote To-do generation with reflection loop.
- `src/skills/dailyFocusSkill.ts`, `src/skills/knowledgeSearchSkill.ts`, `src/skills/rescheduleSkill.ts`, `src/skills/sessionHandoffSkill.ts`, `src/skills/inboxOrganizeSkill.ts`, `src/governance/intentRouter.ts`: Updated caller signatures.
- `src/index.ts`, `wrangler.toml`: Added cron trigger and branching.
- `src/types/index.ts`: Re-exported new types.
- `tests/localTest.ts`: Expanded test harness with 17 new assertions (45 total).

## 4. Future Proofing
- Trace persistence in `eval_history` enables continuous offline prompt evaluation and regression tracking.
- Staging prompt rule diffs in `prompt_versions` ensures human-in-the-loop governance before applying prompt changes.

## 5. Acceptance Criteria Verification
- [x] `npm test` 45/45 passed cleanly.
- [x] `npm run build` 0 errors.
- [x] 3-Step Documentation Cascade completed (`docs/spec.md`, `docs/agents/context.md`, `docs/sitemap.md`).
