---
name: orchestrator
description: Controls the multi-agent execution loop, self-healing test logic, and human-in-the-loop (HITL) triggers for PRJ226. Apply this skill when analyzing requirements, drafting specifications, or processing automated tickets. Orchestrates the generic production-grade agent skills -- it does NOT re-implement their logic.
---

# Orchestrator Workflow (PRJ226 Delegation Layer)

> [!IMPORTANT]
> The `orchestrator` skill is a thin PRJ226-specific delegation layer. It does **NOT** re-implement generic engineering workflows. Each lifecycle phase is delegated to the installed production-grade skill listed below. The orchestrator owns ONLY the PRJ226-specific gates:
> - Confidence Formula + `[HITL_TRIGGER: CONFIDENCE_BELOW_90]`
> - Feature branch naming (`feature/ticket-<id>`)
> - Dynamic Rule Engine injection pre-execution
> - Retry <= 3 self-healing loop with Escalation Gate
> - 3-Step Documentation Cascade (PRJ226 doc paths)
> - Ground-Truth Evals Gate (>= 95%)

## Skill Delegation Map (Lifecycle -> Skill)

| Orchestrator Step | Delegated Skill |
| :--- | :--- |
| Requirement interrogation | `interview-me` (grill the user) / `idea-refine` (vague concept) |
| Spec drafting & kanban init | `spec-driven-development` + `planning-and-task-breakdown` |
| Implementation (multi-file) | `incremental-implementation` |
| Logic / bug fixes | `test-driven-development` |
| Debugging failed tests | `debugging-and-error-recovery` |
| Code review gates | `code-review-and-quality` |
| Documentation & ADRs | `documentation-and-adrs` |
| Git branching / PR / commit | `git-workflow-and-versioning` |
| Context / worker isolation | `context-engineering` + `using-agent-skills` |

Load delegated skills in lifecycle order via the `skill` tool. NEVER skip a required phase's delegated skill; NEVER re-implement its rules inline here.

## Phase 1: Interrogation (Delegate + PRJ226 Gate)
- Delegate requirement interrogation to **`interview-me`** / **`idea-refine`** (see `resources/grill_me_prompt.md` for the PRJ226 lens on edge-cases, scaling, rate-limit, and decoupling).
- Compute the PRJ226 Confidence Score using the mathematical matrix:
  `Confidence = (0.4 * D) + (0.4 * F) - (0.2 * R)` where D = Layer Separation, F = Flexibility, R = Failure Risk.
- If score < 90%: terminate immediately. Output `[HITL_TRIGGER: CONFIDENCE_BELOW_90]`.
- If score >= 90%: delegate spec commit to **`spec-driven-development`** and initialize `resources/agent_kanban.md` via **`planning-and-task-breakdown`**.

## Phase 2: Execution & Self-Healing Loop
- **Pre-execution Gate**: Before executing code for any ticket, run `node .agents/scripts/rule-engine.js --path <target_file>` to load file-level domain rules.
- **Branch Isolation**: Create isolated Git branch `feature/ticket-<id>` (see **`git-workflow-and-versioning`**).
- **Delegated Build**: Implement the ticket via **`incremental-implementation`** + **`test-driven-development`**, scoped to the single active ticket only.
- **Checkpoint 1 (Test & Self-Healing)**:
  * Run the repo tests (`npm test`). See **`test-driven-development`** and **`debugging-and-error-recovery`**.
  * If tests fail: Extract max 30 lines of error log. Increment `retryCount` in `resources/orchestrator_state.json`.
  * If `retryCount` > 3: Trigger **Escalation Gate**. Export git patch to `.agents/artifacts/failed-ticket-<id>.patch`, run `git reset --hard HEAD`, and halt to user.
  * If `retryCount` <= 3: Context Refresh (flush error logs into `resources/execution_debug_box.json`) and restart the phase.
- **Checkpoint 2 (Review + Doc Cascade Gate)**: Delegate static review to **`code-review-and-quality`** (using `resources/reviewer_prompt.md`).
  * Reject code smells by generating `review.md`.
  * Enforce **3-Step Documentation Cascade** via **`documentation-and-adrs`**: sync `docs/spec.md`, `docs/agents/context.md`, `docs/sitemap.md`, verify `npm run build` exits 0. Otherwise reject with `[DOC_CASCADE_FAILED]`.
  * Merge to main upon 100% approval.
- **Checkpoint 3 (Ground-Truth Evals Gate)**: Before final ticket merge, run `npm run evals`; require accuracy >= 95%. Reject if < 95%.

## Defined Boundaries (NOT owned here)
Reasoning engines for planning, code, review, debugging, and archiving are owned by the delegated skills above. `orchestrator` never maintains parallel copies of those instructions.