# Platform Adapters — Dynamic Rule Loading Engine

This directory documents how to integrate the Dynamic Rule Loading Engine with different AI coding platforms. The core rule files (`.agents/rules/`) and manifest (`rules-manifest.json`) remain **identical** across all platforms — only the adapter configuration changes.

---

## Antigravity (Current)

Integration via `AGENTS.md` directive. The agent is instructed to run `rule-engine.js` before code tasks.

```markdown
## Dynamic Rule Loading SOP
BEFORE inspecting, creating, or modifying any code in `src/`, you MUST execute:
`node .agents/scripts/rule-engine.js --path <target_file_path>`
Strictly adhere to all domain rules returned in stdout.
```

---

## Claude Code (Anthropic CLI)

Add to `CLAUDE.md` in workspace root:

```markdown
## Dynamic Rule Enforcer
Before inspecting, creating, or modifying code in `src/`, run:
`node .agents/scripts/rule-engine.js --path <target_file_path>`
Include the returned Markdown output as mandatory context for your task.
```

---

## OpenCode

Register as a custom tool in `opencode.json`:

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

---

## Cursor / Windsurf

Cursor uses `.cursor/rules/*.mdc` files with glob matchers. Create a build script that reads `rules-manifest.json` and generates `.mdc` files with correct frontmatter headers.

```bash
node .agents/scripts/build-cursor-rules.js
```

---

## Migration Checklist

1. Keep all files in `.agents/rules/` unchanged
2. Keep `rules-manifest.json` unchanged
3. Keep `.agents/scripts/rule-engine.js` and `add-rule.js` unchanged
4. Apply only the platform-specific adapter configuration above
5. Run `node .agents/scripts/add-rule.js --verify` to confirm integrity
