# PRJ226 ("Liam") — Practical Test Suite & Dummy Data Set
*Cross-Source Hybrid Search, Blocker Resolution, and Autonomous Orchestration*

**Scope:** Verifies Liam's role as an autonomous workflow coordinator across the 4 closed-loop data layers — **Vectorize** (semantic), **D1** (SQL), **GitHub** (issues/PRs/commits), and **`.agents/rules/`** (governance docs).

**Harness:** Offline integration harness at `tests/localTest.ts` (run via `npm test`) + evaluation suite at `evals/run-evals.ts` (`npm run evals`, accuracy ≥ 95%).

> [!CAUTION]
> Per `.agents/rules/database-isolation.md`, ALL mock seeds and assertions in this suite target the **development** D1 (`prj226-brain-dev`, `1763f575-...`) and dev Vectorize index (`prj226-wiki-dev`). **NEVER** execute any fixture against `prj226-brain-prod`.

---

## Fixture Primer — Dummy Data Generators

Use these deterministic seeds to build each scenario's mock system state. They are scoped to dev resources only.

### G1. D1 `pending_captures` + `tasks` seed
```sql
-- dev only: prj226-brain-dev
INSERT INTO pending_captures (id, content, source, file_path, status) VALUES
  ('capt_icp_001', 'ICP khách hàng: SME 2-10 nhân viên, ngành logistics VN', 'telegram', 'wiki/competitor/icp-notes.md', 'raw');
INSERT INTO tasks (id, name, status, priority, estimate_hours, scheduled_date, description) VALUES
  ('tsk_ratelimit_001', 'Telegram rate limit handling', 'done', 'high', 2.0, '2026-07-20', 'Throttle sendMessage via .agents/rules/telegram-limits.md'),
  ('tsk_plan_001', 'Begin competitor analysis', 'not_started', 'high', 4.0, '2026-08-05', NULL);
```

### G2. Vectorize indexed chunks (semantic entries)
```json
{ "id": "sha256:.agents/rules/telegram-limits.md:0", "title": "telegram-limits.md",
  "content": "Single message MUST NOT exceed 4096 chars. HTML subset: <b>,<i>,<u>,<s>,<code>,<pre>,<a>,<blockquote>. Max 1 msg/sec per user.",
  "github_path": ".agents/rules/telegram-limits.md" },
{ "id": "sha256:migrations/0002_v4_edge_stack.sql:0", "title": "0002_v4_edge_stack.sql",
  "content": "CREATE TABLE note_chunks_cache (id TEXT PRIMARY KEY, github_path TEXT, chunk_index INTEGER, title TEXT, content TEXT, content_hash TEXT...);",
  "github_path": "migrations/0002_v4_edge_stack.sql" }
```

### G3. GitHub repo snapshot (`hdangprod/hdangprod_wiki_dev`)
```
docs/plans/issue-25/plan.md   -> OPEN, UNMERGED PR #25 (enhance weekly scheduler)
wiki/competitor/icp-notes.md  -> missing (404)
.agents/rules/telegram-limits.md -> committed, latest main
```

---

## Test Case Matrix

| ID | Title | Layers under test | Primary Skill |
| :-- | :-- | :-- | :-- |
| TC-01 | Critical Dependency Blocker | GitHub + D1 | `intentRouter` → gate |
| TC-02 | Redundant Task & De-duplication | Vectorize + D1 + GitHub | `taskCaptureSkill` |
| TC-03 | Fragmented Data Synthesis | Hybrid Search (Vectorize + D1) | `knowledgeSearchSkill` |
| TC-04 | Zero-Planning Action Plan | Workflow Orchestration | `taskCaptureSkill` |
| TC-05 | Conflict Resolution in Strategy | D1 vs Local Docs | `knowledgeSearchSkill` → HITL |

---

### [TC-01]: Critical Dependency Blocker (Unmerged PR + Missing Spec + Incomplete ICP)

**1. User Intent / Telegram Input:**
> "Liam, bắt đầu phân tích đối thủ cạnh tranh cho dự án đi."

**2. Mock System State Data:**
* **D1 Database State:**
  * `tasks` → `tsk_plan_001` (`competitor analysis`, `not_started`, `high`).
  * `pending_captures` → `capt_icp_001` status `raw` (ICP note **flushed, not organized**); no row exists for a competitor spec.
* **Vectorize / Semantic Index:** No chunk exists under `wiki/competitor/*` → retrieval returns empty top-K; `hybridSearch` falls back to FTS5 scan of `note_chunks_fts` with 0 hits for "competitor" / "ICP".
* **GitHub Repository State:**
  * Open **UNMERGED** PR #25 (`docs/plans/issue-25/plan.md`) → pulls latest via `GET /repos/{owner}/{repo}/pulls?state=open`.
  * `wiki/competitor/icp-notes.md` → `GET .../contents/wiki/competitor/icp-notes.md` returns `404` (spec file missing).
* **Active Skill Trigger:** `intentRouter` → maps to `Task_Capture`, but MUST first run the Blocker/Dependency Gate before dispatching `taskCaptureSkill`.

**3. Expected Behavior & Orchestration:**
* **Data Retrieval Validation:** Must query (a) `vectorizeClient.query` + `d1Client.getChunksByIds`, (b) `d1Client.getPendingCaptures` for ICP status, (c) `githubClient` PR list + contents check for `issue-25`.
* **Blocker / Duplicate Alert:** MUST NOT emit generic competitive-analysis steps. Instead flag:
  * `[BLOCKER] PR #25 unmerged` → spec for Weekly Scheduler still open; competitor analysis may conflict with in-flight scheduler changes.
  * `[BLOCKER] missing spec` → `wiki/competitor/icp-notes.md` absent.
  * `[BLOCKER] ICP incomplete` → `pending_captures/capt_icp_001` still `raw`, not organized to notes.
* **Actionable Execution Output:**
  ```
  1. Resolve PR #25 first: review `docs/plans/issue-25/plan.md`, merge or close.
  2. Flush ICP: `d1.createCapture(icp_content, wiki/competitor/icp-notes.md)` → set status `organized`.
  3. Create spec task: `docs/plans/issue-{NEW}/plan.md` for competitor analysis.
  4. Re-run `/analyze competitor` once steps 1–3 are green.
  ```

**4. Assertion Criteria (Pass/Fail):**
* [ ] Assert A1: Liam queries BOTH GitHub API (open PRs) AND D1 (`getPendingCaptures`) — no single-source-only answer.
* [ ] Assert A2: Liam HALTs task creation when PR #25 is unmerged and `icp-notes.md` returns 404 — no generic `Research competitor...` output.
* [ ] Assert A3: Output contains ≥ 3 explicit `[BLOCKER]` labels plus an ordered resolution path.
* [ ] Assert A4: No D1 `tasks` INSERT is performed on the competitor task in this turn.

---

### [TC-02]: Redundant Task & De-duplication Handling

**1. User Intent / Telegram Input:**
> "Thêm task xử lý rate limit cho Telegram bot."

**2. Mock System State Data:**
* **D1 Database State:** `tasks` contains `tsk_ratelimit_001` = `Telegram rate limit handling`, status `done`, resolved on `2026-07-20`.
* **Vectorize / Semantic Index:** Top-1 hit `chunk(.agents/rules/telegram-limits.md:0)` (4096-char / 1-msg-per-sec rules), score `0.87`.
* **GitHub Repository State:** `.agents/rules/telegram-limits.md` present on `main` with latest commit authored 2026-07-21; no open issue on Telegram limits.
* **Active Skill Trigger:** `taskCaptureSkill` (`handleTaskCapture`, `src/skills/taskCaptureSkill.ts`).

**3. Expected Behavior & Orchestration:**
* **Data Retrieval Validation:** `extractSearchKeywords("telegram rate limit")` → `cleanTopic`; `embedText`; `hybridSearch` returns rule chunk; `d1Client.getChunksByIds` resolves full content; `d1Client.getActionableTasks` checks for duplicate names.
* **Duplicate Alert:** flags `[DUPLICATE]` referencing `tsk_ratelimit_001` (already `done`) and linking `[[telegram-limits.md]]` + remote URL.
* **Execution Output:** recommends **updating** `.agents/rules/telegram-limits.md` (e.g. add chunking/429-backoff note) rather than creating a new task; optionally proposes `docs/plans/issue-{N}/` only if the rule needs a code change.

**4. Assertion Criteria (Pass/Fail):**
* [ ] Assert A1: Must call `hybridSearch` (non-empty result) AND `d1Client.getActionableTasks` before writing.
* [ ] Assert A2: No new `tasks` row created when duplicate `done` task exists.
* [ ] Assert A3: Output references `.agents/rules/telegram-limits.md` by path (filesystem truth) — not hallucinated.
* [ ] Assert A4: if the user force-proceeds, Liam proposes an edit to the rule doc instead of `INSERT INTO tasks`.

---

### [TC-03]: Fragmented Data Synthesis (database isolation + migrations)

**1. User Intent / Telegram Input:**
> "Chúng ta đã quyết định gì về database isolation và các bước migration?"

**2. Mock System State Data:**
* **D1 State:** `note_chunks_cache` contains only `content_hash` fragments (no full-isolation prose stored as authoritative).
* **Vectorize / Index:** Indexed chunks (→ `migrations/0002_v4_edge_stack.sql` (schema DDL), `0003`, `0004`, `0005`).
* **GitHub State:** `.agents/rules/database-isolation.md` on `main`. Commit log shows the 4-step migration history.
* **Active Skill Trigger:** `knowledgeSearchSkill`.

**3. Expected Behavior & Orchestration:**
* **Data Retrieval Validation:** `hybridSearch` returns Top-K of `0002_v4_edge_stack.sql` chunk; `knowledgeSearchSkill` ALSO fetches raw sql via path + `githubClient` for commit log to confirm `prj226-brain-dev` vs `prod`.
* **Blocker**: none — this is a synthesis query; but MUST NOT fabricate a schema rollback or guess `--env` flags.
* **Execution Output:** A synthesized answer linking **both** sources, with an explicit pointer: "Schema 0002 → dev D1 `prj226-brain-dev`; prod uses `prj226-brain-prod` (isolation per `.agents/rules/database-isolation.md`)". Lists each migration step (0002→0003→0004→0005) with correct SQL filename and what it adds.

**4. Assertion Criteria (Pass/Fail):**
* [ ] Assert A1: Response cites BOTH `migrations/0002_v4_edge_stack.sql` AND `.agents/rules/database-isolation.md` (cross-source).
* [ ] Assert A2: No hallucinated schema: every table named must exist in `src/config.ts`/migrations or D1 response.
* [ ] Assert A3: Identifies prod-vs-dev isolation correctly (never says tests touch **`prod`** ).

---

### [TC-04]: Zero-Planning Workflow Orchestration (New Skill / Route)

**1. User Intent / Telegram Input:**
> "Liam, hãy implement skill mới `rescueService` tương tự `rescueModeSkill`."

**2. Mock System State Data:**
* **D1 State:** no active task `rescueService` — **cold start**.
* **Vectorize State:** empty (no prior note).
* **GitHub State:** existing pattern skills (`src/skills/rescueModeSkill.ts`, `src/skills/inboxOrganizeSkill.ts`) + `docs/plans/` templates.
* **Active Skill Trigger:** `taskCaptureSkill` + planning path.

**3. Expected Behavior & Orchestration:**
* **Data Retrieval Validation:** D1 query zero results → do NOT fabricate past work; source-of-truth patterns pulled from `src/skills/rescueModeSkill.ts` (implements `base.ts` + `SkillContext`).
* **Blocker:** if the requested route requires a new persisted model, must flag the missing `0006_...` migration before planning.
* **Actionable Output:** Decomposed plan + GitHub issue payload:
  ```
  Title: [task] Implement rescue route
  Body:
  1. Create `migrations/0006_rescue_route.sql` (add table `rescue_queue` if new model)
  2. Implement `src/skills/rescueService.ts` mirroring `rescueModeSkill.ts` (base.ts interface)
  3. Register intent in `src/governance/intentRouter.ts`
  4. Define strings in `src/constants/messages.ts` (per centralized-messages rule)
  5. Add unit test to `tests/localTest.ts`; run `npm test` + `npm run build`
  ```

**4. Assertion Criteria (Pass/Fail):**
* [ ] Assert A1: Output includes concrete GitHub issue payload (title, body with D1 migration, skill file, intentRouter registration).
* [ ] Assert A2: Uses real PRJ226 patterns — references `base.ts`, `intentRouter.ts`, `centralized-messages`. 
* [ ] Assert A3: Flags the missing `0006_...` migration before planning if the route needs a new model.
* [ ] Assert A4: Step ordering matches `migrations → skill → router → constants → build/test`.

---

### [TC-05]: Conflict Resolution in Architecture (D1 vs Local Docs)

**1. User Intent / Telegram Input:**
> "Sao `hybridSearch.ts` queries lại đột nhiên thay đổi logic gộp kết quả?"

**2. Mock System State Data:**
* **D1 State:** `working_memory.last_action` references OLD `hybridSearch` 0.5 merge ratio.
* **GitHub State:** A git commit `2026-07-28 abc123 "normalize merge in hybridSearch"` contradicts that snapshot.
* **Active Skill Trigger:** `knowledgeSearchSkill` → `reflectionLoop` (`src/lib/reflectionLoop.ts`).

**3. Expected Behavior & Orchestration:**
* **Data Retrieval:** Reads `working_memory.last_action`; cross-checks commit log via `githubClient.getCommit` (current `src/lib/hybridSearch.ts`); pulls current implementation.
* **Blocker:** `[CONFLICT] D1 snapshot (merge 0.5) vs commit abc123 (normalize to 0.4)`.
* **Execution Output:** Resolves via a resolution card:
  ```
  Conflict file: src/lib/hybridSearch.ts:120
  D1 notes: ratio 0.5 → commit abc123 says 0.4 → please confirm ratio/merge strategy in `docs/spec.md` §HybridSearch
  Path: update `docs/spec.md`, then refresh `note_chunks_cache` metadata to point to the new content_hash.
  ```

**4. Assertion Criteria (Pass/Fail):**
* [ ] Assert A1: Response flags `[CONFLICT]` referencing BOTH `working_memory` and latest git commit SHA.
* [ ] Assert A2: Resolution supplies exact `src/` file path + merge payload.
* [ ] Assert A3: Does not silently overwrite either source; requests human confirm.

---

## Harness Notes (how to wire into `tests/`)

* Each scenario is an **offline integration stub** — seed the dev DB via the SQL in **G1**, fetch GitHub state from a fixture stub (no real network to `hdangprod`), and drive `intentRouter` with the canned Telegram text.
* Assertions map to the pass/fail lists above.
* Keep the golden vector chunks in **G2** deterministic so the harness is reproducible.

Rely on a `FakeGitHubClient` / fake Vectorize in the harness, never the real prod cluster.