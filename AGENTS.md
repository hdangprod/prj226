# PRJ226: Telegram Bot Notion Second Brain Orchestrator

This is a serverless conversational productivity assistant built with TypeScript (v5.3.3) and Node.js (v20+). It orchestrates a Notion Second Brain using Firestore as a state buffer.

## Execution & Verification Commands
- **Build Project**: `npm run build`
- **Local Test Harness**: `npm test` (Runs in-memory mocks for Firestore, Notion, and Gemini)
- **Evaluation Suite**: `npm run evals` (Enforces >= 95% intent classification accuracy)
- **Trigger Orchestrator Tick**: `node .agents/skills/orchestrator/scripts/supreme_assistant.js`

## Layer Rules & Constraints
The codebase is strictly organized into a 4-Layer Closed-Loop System. Do NOT mix layer responsibilities:
- `src/sensors/`: Intake webhooks and raw signal processing (audio/voice processing via Gemini LITE).
- `src/governance/`: Intent classification, probabilistic routing, and HITL state management.
- `src/tools/`: Deterministic external API clients (Notion SDK, Firestore, Google Calendar).
- `src/skills/`: Multi-tool stateful workflow orchestration (Task Capture, Weekly Planning V2).

## External File Loading
CRITICAL: When you encounter a file reference (e.g., @.agents/rules/github-workflow.md), use your Read tool to load it on a need-to-know basis. They are relevant to the SPECIFIC task at hand.
- Do NOT preemptively load all references - use lazy loading based on actual need.
- When loaded, treat content as mandatory instructions that override defaults.
- Follow references recursively when needed.

## Mandatory Guidelines References
- Master Rules Specification: `@.agents/skills/orchestrator/SKILL.md`
- Database Schemas & Gemini Strategy: `@docs/agents/context.md`

## Workspace Rules & Workflows
### Rules (under `.agents/rules/`)
- Git & GitHub Flow: `@.agents/rules/github-workflow.md`
- Git Branching conventions: `@.agents/rules/git-branching.md`
- Notion API rate-limiting rules: `@.agents/rules/notion-limits.md`
- Centralized message templates: `@.agents/rules/centralized-messages.md`

### Workflows (under `.agents/workflows/`)
- Bug Hunting flow: `@.agents/workflows/bug-hunting.md`
- Deploy Check flow: `@.agents/workflows/deploy-check.md`
