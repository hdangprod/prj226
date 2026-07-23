# Dynamic Rules Operating & Migration Guide (PRJ226)

This document serves as the Standard Operating Procedure (SOP) for managing, extending, and migrating the **Dynamic Rule Loading Engine** across AI coding platforms (Antigravity, Claude Code, OpenCode, Cursor/Windsurf).

---

## 1. Architecture Overview

To prevent context window saturation and token waste, rule files are loaded dynamically on demand. The architecture relies on the **Adapter Pattern**, decoupling rule content from AI platform specifics.

```text
.agents/
├── rules/                       <-- [PURE DATA] Raw Markdown rule files
│   ├── github-workflow.md
│   ├── centralized-messages.md
│   ├── notion-limits.md
│   ├── redis-state-rules.md
│   └── telegram-limits-rules.md
├── rules-manifest.json          <-- [SINGLE SOURCE OF TRUTH] Mapping manifest
├── scripts/
│   ├── rule-engine.js           <-- [CORE ENGINE] Evaluates inputs and outputs rules
│   └── add-rule.js              <-- [CLI SOP ENFORCER] Automated rule generator
└── adapters/                    <-- [PLATFORM ADAPTERS]
    └── README.md                (Migration instructions for all platforms)
```

### Manifest Schema (`rules-manifest.json`)

Each rule entry contains:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique rule identifier |
| `description` | string | Human-readable purpose |
| `file` | string | Relative path to Markdown rule file |
| `always_on` | boolean | If `true`, rule is always emitted regardless of match |
| `match_keywords` | string[] | Context keywords that trigger this rule |
| `match_paths` | string[] | Glob patterns for file paths that trigger this rule |

---

## 2. Strict SOP: Adding or Modifying Rules

> **⚠️ MANDATORY RULE:** NEVER manually create `.md` files inside `.agents/rules/` without updating the manifest. Manual creation bypasses indexing, rendering rules invisible to AI agents.

### Official Rule Creation Workflow

Always use the CLI tool to generate new rules:

```bash
node .agents/scripts/add-rule.js --id <rule-id> --keywords <keyword1,keyword2> --paths <glob-pattern>
```

#### Example:

```bash
node .agents/scripts/add-rule.js --id notion-schema --keywords notion,schema,database --paths "src/tools/notion/**"
```

#### Automated Actions Performed by the CLI:

1. Generates boilerplate file: `.agents/rules/notion-schema-rules.md`
2. Appends the exact schema entry into `rules-manifest.json`
3. Validates JSON syntax and confirms file creation

#### Creating Always-On Rules:

```bash
node .agents/scripts/add-rule.js --id security-policy --keywords security --always-on
```

### Manifest Integrity Audit

```bash
node .agents/scripts/add-rule.js --verify
```

Reports orphaned files (in filesystem but not manifest) and missing files (in manifest but not filesystem).

---

## 3. Platform Migration Manual

When migrating to a new coding platform, **keep all files in `.agents/rules/` and `rules-manifest.json` intact**. Only apply the corresponding adapter settings below:

### Antigravity (Current)

Integrated via `AGENTS.md` directive:
```markdown
## Dynamic Rule Loading SOP
BEFORE inspecting, creating, or modifying any code in `src/`, you MUST execute:
`node .agents/scripts/rule-engine.js --path <target_file_path>`
Strictly adhere to all domain rules returned in stdout.
```

### Claude Code (Anthropic CLI)

Add the following directive to `CLAUDE.md` in the workspace root:
```markdown
## Dynamic Rule Enforcer
Before inspecting, creating, or modifying code in `src/`, run:
`node .agents/scripts/rule-engine.js --path <target_file_path>`
Include the returned Markdown output as mandatory context for your task.
```

### OpenCode

Register `rule-engine.js` as an internal custom tool inside `opencode.json`:

```json
{
  "tools": {
    "get_domain_rules": {
      "command": "node .agents/scripts/rule-engine.js --keyword $KEYWORD --path $FILE_PATH",
      "description": "Loads specific domain rules before code implementation."
    }
  }
}
```

### Cursor / Windsurf

Cursor utilizes `.cursor/rules/*.mdc` files with explicit glob matchers. Execute a sync script to generate Cursor rules automatically from the manifest.

---

## 4. Verification & Audit Matrix

Run these diagnostic commands to verify system integrity:

| Diagnostic Task | Command | Expected Output |
|---|---|---|
| **Verify Path Matcher** | `node .agents/scripts/rule-engine.js --path src/tools/notionClient.ts` | Displays `github-workflow` (always_on) + `notion-limits` (path match) |
| **Verify Keyword Matcher** | `node .agents/scripts/rule-engine.js --keyword telegram` | Displays `github-workflow` (always_on) + `telegram-limits` (keyword match) |
| **Manifest Audit** | `node .agents/scripts/add-rule.js --verify` | Confirms all rules in `.agents/rules/` are indexed |
| **Always-On Test** | `node .agents/scripts/rule-engine.js --path src/index.ts` | Displays only `github-workflow` (always_on) |
