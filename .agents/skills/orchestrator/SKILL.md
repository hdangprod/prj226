---
name: orchestrator
description: Controls the multi-agent execution loop, self-healing test logic, and human-in-the-loop (HITL) triggers for PRJ226. Apply this skill when analyzing requirements, drafting specifications, or processing automated tickets.
---

# Orchestrator Workflow & Self-Healing Law

## 1. Phase 1: Interrogation (GRILL ME Agent)
- Every new user feature request must be processed by the GRILL ME worker using the layout rules specified in `resources/grill_me_prompt.md`.
- You must generate a Confidence Score strictly using the mathematical matrix:
  Confidence = (0.4 * D) + (0.4 * F) - (0.2 * R)
  Where D = Layer Separation, F = Flexibility, R = Failure Risk.
- If the calculated score is < 90%, execution terminates immediately. Output `[HITL_TRIGGER: CONFIDENCE_BELOW_90]`.
- If score is >= 90%, commit the output directly to a project spec and initialize `resources/agent_kanban.md`.

## 2. Phase 2: Execution & Self-Healing Loop
- The Supreme Agent creates an isolated Git branch named `feature/ticket-<id>` for each target task.
- The Execution Worker receives an isolated system state window, referencing only the active ticket and `resources/execution_prompt.md`.
- **Checkpoint 1 (npm test)**: Run `scripts/test_runner.js`.
  * If tests fail: Extract a maximum of 30 lines of error log. Increments `retryCount` inside `resources/orchestrator_state.json`.
  * If `retryCount` > 3: Trigger Escalation Gate and throw flow to user terminal.
  * If `retryCount` <= 3: Perform Context Refresh by flushing error logs into `resources/execution_debug_box.json` and restarting the worker phase.
- **Checkpoint 2 (Code Review)**: Run `scripts/review_dispatcher.js` using the compliance metrics from `resources/reviewer_prompt.md`.
  * Reject code smells (coupling, unthrottled calls) by generating `review.md`.
  * Merge to main branch automatically upon receiving 100% approval confirmation.
