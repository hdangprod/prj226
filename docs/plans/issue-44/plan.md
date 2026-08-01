# Plan - Issue #41: MOD-08 Triage Skill (Multi-threaded Inbox Routing)

## Context & Problem
Users accumulate raw notes/links in Obsidian Inbox Tray but lack time to open Obsidian to classify them. Handling sequential calls on Telegram creates cognitive friction.

## Solution & Trade-offs
Implement MOD-08 Triage Skill with 4-stage lifecycle:
1. Stage 1: Bubble Flush (max 5 items, delay 300ms, Hard Lock `triage_map:chatId:message_id`).
2. Stage 2: Smart Context Routing & Nested Replies (`active_triage_session` soft lock & recursive tree expansion).
3. Stage 3: Dynamic Validation (diff schema contract, `SETNX` distributed lock, turn counter max 3).
4. Stage 4: Garbage Collection & UI Closure (strikethrough `editMessageText` & status tag).

## Blast Radius
- `src/config.ts`
- `src/tools/triageLockTool.ts`
- `src/index.ts`
- `src/governance/intentRouter.ts`
- `src/skills/triageSkill.ts`
- `tests/triageSkill.test.ts`
