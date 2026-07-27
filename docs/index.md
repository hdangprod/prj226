# PRJ226 Documentation Index

Welcome to the PRJ226 (Liam Persona - AI-Native Second Brain) Documentation Index.

## Core Technical Specs
- [`docs/spec.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/spec.md) — System Specification (v3.0.0)
- [`docs/sitemap.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/sitemap.md) — AI & System Sitemap
- [`docs/agents/context.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/agents/context.md) — Architecture & Database Reference

## Architecture Overview
- **Runtime**: Cloudflare Workers (Hono framework)
- **Database**: Neon Serverless Postgres (`pgvector`)
- **LLM Abstraction**: Vercel AI SDK (`ai`) in `src/router/llmRouter.ts`
- **State & Queue**: Cloudflare Durable Objects + Cloudflare Queues
- **Cold Path**: OpenWiki Personal Brain (GitHub Actions)

## Active & Archived Plans
- [`docs/plans/issue-50/plan.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/plans/issue-50/plan.md) — Greenfield Rewrite Plan
- [`docs/plans/issue-50/solution_report.md`](file:///Users/dangnguyen/Desktop/PRJ226/docs/plans/issue-50/solution_report.md) — Solution & Implementation Report
