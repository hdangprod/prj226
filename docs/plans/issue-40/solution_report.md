# Comprehensive Solution Report & Setup Guide: Issue #40

**Issue URL**: https://github.com/hdangprod/prj226/issues/40  
**PR URL**: https://github.com/hdangprod/prj226/pull/41  
**Branch**: `issue-40/dynamic-rule-engine`  

---

## 1. 🚨 Context & Root Cause Analysis

### Problem Statement
Static rule injection loaded all `.md` files under `.agents/rules/` into agent context regardless of whether they were relevant to the current file or task. This caused:
1. **Token Bloat & Context Decay**: Loading ~1,500+ tokens of unused rule text into every prompt.
2. **Platform Lock-In**: Relying on proprietary Antigravity frontmatter (`trigger: model_decision`, `trigger: always_on`).
3. **Manifest Drift Risk**: Creating new rule files manually without updating index manifests led to unindexed, invisible rules.

---

## 2. 💡 Architecture Solution (Adapter Pattern Engine)

We implemented a vendor-agnostic Dynamic Rule Loading Engine using the Adapter Pattern:

```text
.agents/
├── rules/                       <-- [PURE DATA] Framework-agnostic Markdown rules
│   ├── github-workflow.md       (always_on: true)
│   ├── centralized-messages.md
│   └── notion-limits.md
├── rules-manifest.json          <-- [SINGLE SOURCE OF TRUTH] Mapping manifest
├── scripts/
│   ├── rule-engine.js           <-- [CORE ENGINE] CLI input evaluator
│   └── add-rule.js              <-- [CLI SOP ENFORCER] Generator & manifest auditor
└── adapters/
    └── README.md                <-- Migration manual (Antigravity, Claude, OpenCode, Cursor)
```

### Key Components

1. **Manifest (`.agents/rules-manifest.json`)**: Single Source of Truth mapping rule IDs to keywords, glob paths, and an `always_on` boolean for global rules.
2. **Rule Engine (`.agents/scripts/rule-engine.js`)**: Evaluates `--path` and `--keyword` flags dynamically and outputs concatenated Markdown rules.
3. **Rule Creation CLI (`.agents/scripts/add-rule.js`)**: Enforces rule creation SOPs and manifest auditing (`node .agents/scripts/add-rule.js --verify`).
4. **Platform Migration Manual (`docs/DYNAMIC_RULES_GUIDE.md`)**: Complete guide for extending and migrating rules across platform adapters.

---

## 3. 🛠️ How to Setup in Future Projects (Reusable SOP)

1. **Initialize Manifest**: Create `rules-manifest.json` defining rule IDs, `match_keywords`, `match_paths`, and `always_on` flags.
2. **Create Core Resolver**: Implement a lightweight JS CLI script to resolve globs using `minimatch` and format output for LLM prompts.
3. **Enforce Rule Generator**: Use `add-rule.js` CLI to generate rule Markdown files and append manifest entries atomically.
4. **Strip Proprietary Frontmatter**: Ensure rule files contain pure Markdown without vendor-specific metadata.
5. **Add Directive**: Add a standard instruction directive in `AGENTS.md` (or `CLAUDE.md`) requiring rule lookup before file modification.

---

## 4. ✅ Acceptance Criteria & Verification

- [x] Manifest audit passed (`node .agents/scripts/add-rule.js --verify`).
- [x] Path & keyword matching verified across test suite.
- [x] `npm run build` compiled with 0 TS errors.
- [x] `npm test` passed 100% of offline integration suite.
- [x] Merged to `main` via PR #41.
