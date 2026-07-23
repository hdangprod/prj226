# Comprehensive Solution Report & Setup Guide: Issue #37

**Issue URL**: https://github.com/hdangprod/prj226/issues/37  
**PR URL**: https://github.com/hdangprod/prj226/pull/38  
**Branch**: `issue-37-aios-5layer-framework`  

---

## 1. 🚨 Context & Root Cause Analysis

### Problem Statement
Over time, LLM-assisted software projects suffer from **Context Rot**, **Prompt Bloat**, and **Architectural Drift**. In PRJ226:
1. **Context Bloat**: Rule files like `github-workflow.md` were configured with `trigger: always_on`, injecting ~1,500 tokens of redundant instructions into every turn of conversation regardless of whether Git was involved.
2. **Specification Drift**: Specifications (`docs/spec.md`) referenced obsolete pre-4-layer system directories (`src/services/`, `src/notion/`, `src/gemini/`) rather than the active 4-Layer Closed-Loop Architecture (`sensors`, `governance`, `tools`, `skills`).
3. **Lack of AI Sitemap & Lazy-Loading**: AI agents lacked a structured index telling them where files lived and when to load them, leading to agents scanning whole file trees or re-reading historical documents (`PROJECT_JOURNEY.md`, `changelog.md`, retrospectives).
4. **Manual Checking Fatigue**: Developers had to manually inspect documentation files after code edits to ensure no broken paths or deprecated references remained.

---

## 2. 💡 Architecture Solution (AIOS 5-Layer System)

We structured the project into 5 decoupled, single-responsibility layers:

```
+-------------------------------------------------------+
|  Layer 1: Identity & Core Directives (AGENTS.md)      |
+-------------------------------------------------------+
|  Layer 2: Memory & Context Management (Sitemap/Specs) |
+-------------------------------------------------------+
|  Layer 3: Workflows & SOPs (.agents/workflows/)       |
+-------------------------------------------------------+
|  Layer 4: Modular Skills (.agents/skills/ & src/skills)|
+-------------------------------------------------------+
|  Layer 5: Tools & System Integrations (src/tools/)    |
+-------------------------------------------------------+
```

### Layer Details & Setup Strategy

1. **Layer 1: Identity & Core Directives (`AGENTS.md`)**:
   - Master entry point setting global identity, positive MUST-FOLLOW rules, negative NEVER-DO restrictions, and anti-rot Definition of Done (DoD).
   - **Automatic 3-Step Documentation Cascade Rule**: Whenever source code in `src/` or architecture changes, the AI agent MUST automatically:
     1. Update layer-specific specs (`docs/spec.md`, `docs/agents/context.md`).
     2. Sync sitemap & file paths (`docs/sitemap.md`, `docs/index.md`).
     3. Verify clean build (`npm run build`) and test suite (`npm test`) before reporting work complete.

2. **Layer 2: Memory & Context Management (`docs/sitemap.md`, `docs/spec.md`, `docs/agents/context.md`)**:
   - Created `docs/sitemap.md` as the master lazy-loading matrix mapping task intents to specific files.
   - Updated `docs/spec.md` to v2.0.0 reflecting the 4-Layer Closed-Loop Architecture (`sensors`, `governance`, `tools`, `skills`).

3. **Layer 3: Workflows & SOPs (`.agents/rules/github-workflow.md`, `.agents/workflows/`)**:
   - Merged `git-branching.md` into `github-workflow.md` to streamline Git rules into a single high-density file.

4. **Layer 4: Modular Skills (`.agents/skills/orchestrator/`, `src/skills/`)**:
   - Preserved stateful workflow subroutines (`taskCaptureSkill`, `weeklyPlanningSkill`).

5. **Layer 5: Tools & System Integrations (`src/tools/`, `.agents/rules/notion-limits.md`, `.agents/rules/centralized-messages.md`)**:
   - Deterministic client wrappers and Notion 3 rps rate-limiting rules.

6. **Artifact Hub (`docs/artifacts/`)**:
   - Consolidated human reviewer documents (`PROJECT_JOURNEY.md`, `changelog.md`, `retrospectives/`) with AI token guards to prevent auto-loading during coding tasks.

---

## 3. 🛠️ How to Setup in Future Projects (Reusable Template)

When starting or refactoring a new project to prevent context decay:

1. **Create `AGENTS.md` (or `CLAUDE.md`) in root**:
   Set System Identity, 1 Positive Rule (Doc Cascade on every edit), 1 Negative Restriction (No orphaned docs or reading history hubs), and DoD.
2. **Create `docs/sitemap.md`**:
   Map task intents to exact file paths with explicit token policies (`Always On`, `On-Demand`, `Human Request Only`).
3. **Consolidate Git Rules in `.agents/rules/github-workflow.md`**:
   Specify Standard Flow (Issue -> Branch -> Plan -> Code -> PR) vs Fast-Track Flow (Hotfix on main).
4. **Separate Core Specs (`docs/`) from Historical Artifacts (`docs/artifacts/`)**:
   Keep `docs/` clean with static specs. Move past retrospectives, changelogs, and journey logs into `docs/artifacts/` with AI token guards (`ai_policy: human_reviewer_only`).
5. **Organize Task Plans into `docs/plans/issue-[ID]/`**:
   Store `plan.md`, `walkthrough.md`, and `solution_report.md` inside `docs/plans/issue-[ID]/` for future post-mortem review.

---

## 4. ✅ Acceptance Criteria & Verification

- [x] Code compiles cleanly (`npm run build`).
- [x] All 14 offline integration test suites pass (`npm test`).
- [x] AIOS 5-Layer structure established in `AGENTS.md` and `docs/sitemap.md`.
- [x] Ephemeral root files cleaned up and Artifact Hub established.
- [x] Issue #37 & PR #38 created and linked.
