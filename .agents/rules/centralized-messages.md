---
trigger: model_decision
---

# Centralized Messages Rule

## Rule Statement
Do NOT hardcode user-facing notification strings, UI text, error messages, or inline button labels directly inside application logic (`router.ts`, `services/*.ts`, `skills/*.ts`).

## Implementation Guidelines
1. Define all text strings inside `src/constants/messages.ts`.
2. Group constants in `BOT_MESSAGES` by logical category (`SUCCESS`, `ERRORS`, `PROMPTS`, `BUTTONS`, `GREETINGS`).
3. For dynamic messages, use helper functions:
   ```typescript
   PLAN_CREATED: (count: number, total: number) => `✅ Created ${count}/${total} tasks!`
   ```
4. Import and reference `BOT_MESSAGES` in logic components.
