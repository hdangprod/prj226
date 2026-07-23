# Implementation Plan: Issue #37 - AIOS 5-Layer Architecture Alignment & Token Optimization

Align PRJ226 with the 5-Layer AIOS (Agentic Operating System) Framework, establishing strict single-responsibility homes for Identity, Memory, Workflows, Skills, and Tools while enforcing a mandatory **3-Step Documentation Cascade Rule** to eliminate context rot and manual checking fatigue.

## User Review Required

> [!IMPORTANT]
> **AIOS 5-Layer Structure:**
> - **Layer 1: Identity & Core Directives** ([`AGENTS.md`](file:///Users/dangnguyen/Desktop/PRJ226/AGENTS.md)): Global system identity, positive MUST-FOLLOW rules, negative NEVER-DO restrictions, and anti-rot DoD.
> - **Layer 2: Memory & Context** ([`docs/sitemap.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/sitemap.md), [`docs/spec.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/spec.md), [`docs/agents/context.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/agents/context.md)): System specs, DB schemas, and lazy-loading sitemap index.
> - **Layer 3: Workflows & SOPs** ([`.agents/rules/github-workflow.md`](file:///Users/dangnguyen/Desktop/PRJ226/.agents/rules/github-workflow.md), [`.agents/workflows/`](file:///Users/dangnguyen/Desktop/PRJ226/.agents/workflows/)): SOPs for Git/PRs, bug hunting, and GCP deployments.
> - **Layer 4: Modular Skills** ([`.agents/skills/orchestrator/`](file:///Users/dangnguyen/Desktop/PRJ226/.agents/skills/orchestrator/), [`src/skills/`](file:///Users/dangnguyen/Desktop/PRJ226/src/skills/)): Multi-agent orchestration, task capture, weekly planning.
> - **Layer 5: Tools & Integrations** ([`src/tools/`](file:///Users/dangnguyen/Desktop/PRJ226/src/tools/)): Deterministic API clients (Notion, Firestore, Google, Telegram).

> [!CAUTION]
> **Mandatory 3-Step Documentation Cascade Rule**:
> Whenever source code in `src/` or architecture is modified, the AI agent MUST automatically:
> 1. Update layer-specific specs ([`docs/spec.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/spec.md), [`docs/agents/context.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/agents/context.md)).
> 2. Sync sitemap & file paths ([`docs/sitemap.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/sitemap.md), [`docs/index.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/index.md)).
> 3. Verify clean build (`npm run build`) and test suite (`npm test`) before declaring completion.

## Proposed Changes

### Layer 1: Identity & Directives

#### [MODIFY] [AGENTS.md](file:///Users/dangnguyen/Desktop/PRJ226/AGENTS.md)
- Restructure into explicit AIOS 5-Layer system format.
- Add positive MUST-FOLLOW rule (Automatic 3-Step Documentation Cascade).
- Add negative NEVER-DO restriction (No orphaned docs, no auto-reading `docs/artifacts/`).
- Update Definition of Done (DoD) to mandate doc & sitemap sync on every commit.

---

### Layer 2 & 3: Memory & Workflows Sync

#### [MODIFY] [github-workflow.md](file:///Users/dangnguyen/Desktop/PRJ226/.agents/rules/github-workflow.md)
- Add 3-Step Documentation Cascade requirement to Definition of Done section.

#### [MODIFY] [sitemap.md](file:///Users/dangnguyen/Desktop/PRJ226/docs/sitemap.md)
- Update sitemap table to explicitly categorize files into AIOS Layers 1 to 5.

#### [MODIFY] [index.md](file:///Users/dangnguyen/Desktop/PRJ226/docs/index.md)
- Structure Knowledge Base index into AIOS Layers 1 to 5.

## Verification Plan

### Automated Tests
- `npm run build` - Ensure clean TypeScript compilation.
- `npm test` - Verify all 14 integration test suites pass.

### Manual Verification
- Check that all file links resolve correctly across `AGENTS.md`, `docs/sitemap.md`, and `docs/index.md`.
