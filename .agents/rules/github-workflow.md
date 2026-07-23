---
trigger: always_on
---

# GitHub & Git Workflow Specification

## 1. Workflow Routing

### A. Standard Flow (Features, Major Refactors, Complex Fixes)
1. **Create Issue**: Use `gh issue create` with Title & 5-W Description.
2. **Checkout Branch**: Dedicated branch from `main` named `issue-[ID]-[short-description]` (e.g. `issue-28/optimize-notion`). Do NOT code directly on `main`.
3. **Plan First**: Create plan file at `docs/plans/issue-[ID]-[short-description].md`. Wait for explicit user "Proceed" before coding.
4. **Code & Cascade Docs**: Implement approved changes and run the 3-Step Documentation Cascade to sync specs and sitemaps.
5. **Report & PR**: Run `npm run build` and `npm test`, post Implementation Report, push branch, and create PR to `main` using:
   ```bash
   gh pr create --base main --head <branch-name> --title "<PR Title>" --body "<Report>"
   ```
   *Note*: **Do NOT self-merge.** Only the repository owner approves and merges PRs.

### B. Fast-Track Flow (Typos, Config Adjustments, Urgent 1-2 Line Hotfixes)
- No Issue, Plan, or PR required.
- Commit directly to `main` or via a short temporary branch using `fix(hotfix):` or `docs(hotfix):` commit prefix.

### C. Auto Routing Rules
- **Fast-Track**: Single file touch, < 5 lines changed, typos, docs update, `.env`/`package.json` minor tweaks.
- **Standard Flow**: Features, API additions, schema changes, tests, multi-file refactors.
- **Fallback**: Default to Standard Flow when ambiguous.

## 2. Commit & Technical Standards
- **Commit Format**: Conventional Commits: `<type>(<scope>): <description> (#<issue_number>)`
- **Definition of Done (DoD)**:
  1. Code runs cleanly and tested locally (`npm test`).
  2. `npm run build` passes 100%.
  3. **3-Step Documentation Cascade Completed**: Related specs, DB schemas, and `docs/sitemap.md` are updated in the exact same pull request.

## 3. 5-W Report Framework
Issue descriptions and PR reports must follow:
1. **Context & Problem**: Why now? What broke or is missing?
2. **Solution & Trade-offs**: Chosen approach and rationale.
3. **Blast Radius**: Affected files list.
4. **Future Proofing**: Scalability notes.
5. **Acceptance Criteria**: DoD checklist.

---
⚠️ **AI Self-Check**: Verify git branch, build state, and documentation sync before reporting work or making PRs.