# Issue 64: Self-Evaluation Reflection Loop & Nightly Prompt Optimizer

## Context & Problem
The Task Capture skill was generating generic, ungrounded To-do lists (e.g. "Review requirements", "Document results") even when rich retrieved notes were available. This was caused by:
1. Hard 350-character note truncation cutting off Action Items.
2. Single-pass LLM generation without evaluation or self-correction.
3. Lack of structured grounding requirements.

## Solution & Architecture
1. **Smart Context Builder**: Expand note context limit to 3,000 chars/note while preserving Action Items/TODO headers during truncation.
2. **Reflection Loop (`Generate → Judge → Refine`)**:
   - Structured JSON generation via `GeneratedTasksSchema`.
   - Structured evaluation via `JudgeEvaluationSchema` scoring 4 criteria: `actionable`, `grounded`, `specific`, `executable` (threshold ≥ 0.8).
   - Up to 3 retries with critique injection and temperature decay (0.7 → 0.6 → 0.5 → 0.4).
   - Dual guardrails: 20s wall-clock deadline + 15,000 token budget.
3. **Trace Persistence**: Asynchronously record execution history in D1 (`eval_history`, `eval_iterations`).
4. **Nightly Prompt Optimizer**: Cron `0 20 * * *` (03:00 UTC+7) queries failed evals, synthesizes prompt improvements, and stores proposed rule diffs in `prompt_versions` (`pending` status) with Telegram review notification.

## Files Touched
- `migrations/0005_eval_history.sql` [NEW]
- `src/lib/reflectionLoop.ts` [NEW]
- `src/skills/nightlyOptimizer.ts` [NEW]
- `src/router/llmRouter.ts` [MODIFY]
- `src/tools/d1Client.ts` [MODIFY]
- `src/skills/taskCaptureSkill.ts` [MODIFY]
- `src/skills/dailyFocusSkill.ts` [MODIFY]
- `src/skills/knowledgeSearchSkill.ts` [MODIFY]
- `src/skills/rescheduleSkill.ts` [MODIFY]
- `src/skills/sessionHandoffSkill.ts` [MODIFY]
- `src/skills/inboxOrganizeSkill.ts` [MODIFY]
- `src/governance/intentRouter.ts` [MODIFY]
- `src/index.ts` [MODIFY]
- `wrangler.toml` [MODIFY]
- `src/types/index.ts` [MODIFY]
- `tests/localTest.ts` [MODIFY]
