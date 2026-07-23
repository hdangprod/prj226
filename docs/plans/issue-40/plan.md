# Implementation Plan: Issue #40 - Dynamic Rule Loading Engine (Adapter Pattern)

Implement a strict, vendor-agnostic Dynamic Rule Loading Engine for PRJ226 using the Adapter Pattern to prevent context window saturation and prompt rot.

## User Review Required

> [!IMPORTANT]
> **Dynamic Rule Loading Architecture**:
> - **Manifest (`.agents/rules-manifest.json`)**: Single Source of Truth mapping rule IDs to keywords, glob path patterns, and file paths with support for `always_on: true` global governance.
> - **Execution Engine (`.agents/scripts/rule-engine.js`)**: Evaluates `--path` and `--keyword` flags dynamically and outputs concatenated Markdown rules.
> - **Creation Enforcer (`.agents/scripts/add-rule.js`)**: CLI enforcing rule creation SOPs and manifest auditing (`--verify`).
> - **Absorbed Native Rules**: Stripped native Antigravity frontmatter (`trigger: model_decision`, `trigger: always_on`) from `centralized-messages.md`, `notion-limits.md`, and `github-workflow.md` to make rule files framework-agnostic.

## Proposed Changes

### Core Engine & Rules
- `[NEW]` `.agents/rules-manifest.json`
- `[NEW]` `.agents/scripts/rule-engine.js`
- `[NEW]` `.agents/scripts/add-rule.js`
- `[NEW]` `.agents/adapters/README.md`
- `[NEW]` `.agents/rules/redis-state-rules.md`
- `[NEW]` `.agents/rules/telegram-limits-rules.md`
- `[MODIFY]` `.agents/rules/centralized-messages.md`
- `[MODIFY]` `.agents/rules/github-workflow.md`
- `[MODIFY]` `.agents/rules/notion-limits.md`

### System Directives & Documentation Cascade
- `[MODIFY]` `AGENTS.md`
- `[NEW]` `docs/DYNAMIC_RULES_GUIDE.md`
- `[MODIFY]` `docs/spec.md`
- `[MODIFY]` `docs/agents/context.md`
- `[MODIFY]` `docs/sitemap.md`

## Verification Plan

### Automated Tests
- `node .agents/scripts/add-rule.js --verify` - Audit manifest integrity.
- `node .agents/scripts/rule-engine.js --path src/tools/redis/redisClient.ts` - Path match test.
- `node .agents/scripts/rule-engine.js --keyword telegram` - Keyword match test.
- `npm run build` - TypeScript compilation check.
- `npm test` - Offline integration test suite.
