# PRJ226 Documentation Index

Welcome to the PRJ226 (Liam Persona - AI-Native Second Brain) Documentation Index.

## Core Technical Specs
- [`docs/spec.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/spec.md) — System Specification (v4.1.0)
- [`docs/sitemap.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/sitemap.md) — AI & System Sitemap
- [`docs/agents/context.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/agents/context.md) — Architecture & Database Reference

## Dev Tooling
- [`scripts/seed-dev.sql`](file:///Users/dangnguyen/Desktop/PRJ226/scripts/seed-dev.sql) — Wipes & seeds demo data in `prj226-brain-dev` (dev ONLY)

## Architecture Overview
- **Human Interface & SOT**: Obsidian Local Vault (Markdown `.md`)
- **Remote Cold Storage**: GitHub Repository (`hdangprod/hdangprod_wiki`)
- **Runtime**: Cloudflare Workers (Hono framework v4.7.0)
- **Database & FTS**: Cloudflare D1 (SQLite at edge) + FTS5
- **Vector Search**: Cloudflare Vectorize (768-dim cosine index)
- **AI & Voice Engine**: Cloudflare Workers AI (`bge-base-en-v1.5` embeddings, `whisper-large-v3-turbo` voice)
- **LLM Abstraction**: Vercel AI SDK (`ai` + `@ai-sdk/google`) in `src/router/llmRouter.ts`
- **Git Sync Engine**: GitHub Git Data API batched commits (5-min Cron Trigger)

## Active & Archived Plans
- [`docs/plans/issue-50/plan.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/plans/issue-50/plan.md) — Greenfield Rewrite Plan
- [`docs/plans/issue-52/plan.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/plans/issue-52/plan.md) — OpenWiki Vault Setup
- [`docs/plans/issue-54/plan.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/plans/issue-54/plan.md) — HNSW Vector Index Migration
- [`docs/plans/issue-56/plan.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/plans/issue-56/plan.md) — PRJ226 v4.1 Obsidian Edge Stack Migration Plan
- [`docs/plans/issue-56/solution_report.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/plans/issue-56/solution_report.md) — PRJ226 v4.1 Solution & Completion Report
- [`docs/plans/issue-67/plan.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/plans/issue-67/plan.md) — Whole-Picture Knowledge Search (query sanitizer + topic census + reindex self-heal)
- [`docs/plans/issue-67/solution_report.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/plans/issue-67/solution_report.md) — Whole-Picture Knowledge Search: Completion & Solution Report
- [`docs/plans/issue-70/session-based-telegram-workflow.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/plans/issue-70/session-based-telegram-workflow.md) — Session-Based Telegram Workflow (13 phases; Phases 0–3 landed)
