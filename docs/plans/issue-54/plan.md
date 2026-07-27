# Issue #54 Plan: Migrate Vector Indexes from IVFFLAT to HNSW (notes_staging & knowledge_wiki)

## 1. Context & Problem
Currently, our Neon Postgres schema uses `IVFFLAT` vector indexes with `lists = 100` on tables with a small dataset (< 1,000 rows):
- `notes_staging.embedding`
- `knowledge_wiki.embedding`

Because `IVFFLAT` requires thousands of rows to build effective clusters, having `lists = 100` on a small corpus causes low recall and skips search results during vector similarity search (`Knowledge_Search` skill). We need to migrate these indexes to **HNSW (Hierarchical Navigable Small World)**.

## 2. Solution & Architecture
1. **Migration File**: Create `src/db/migrations/001_convert_ivfflat_to_hnsw.sql` dropping `ivfflat` indexes and creating `hnsw (embedding vector_cosine_ops)` indexes.
2. **Schema SSOT**: Update `src/db/schema.sql` to maintain schema Single Source of Truth.
3. **Integration Test**: Extend `tests/localTest.ts` to assert presence of migration file and verify `schema.sql` strictly uses HNSW.
4. **Documentation Cascade**: Update `docs/spec.md`, `docs/agents/context.md`, and `docs/sitemap.md`.

## 3. Blast Radius
- `src/db/schema.sql`
- `src/db/migrations/001_convert_ivfflat_to_hnsw.sql`
- `tests/localTest.ts`
- `docs/spec.md`
- `docs/agents/context.md`
- `docs/sitemap.md`
- `docs/plans/issue-54/plan.md`

## 4. Acceptance Criteria
- [x] Integration tests pass (`npm test`)
- [x] Build compiles with 0 errors (`npm run build`)
- [x] Evals pass (`npm run evals`)
- [x] 3-Step Documentation Cascade completed
