# Plan: Issue #50 — PRJ226 v3.0 Greenfield Rewrite

## Goal
Rebuild PRJ226 (Liam Second Brain) from scratch as a zero-infrastructure-cost dual-speed personal assistant on Cloudflare Workers + Neon Postgres (pgvector) + Vercel AI SDK.

## Key Changes
1. **Runtime**: Migrate GCP Cloud Run → Cloudflare Workers (Hono framework).
2. **State Store**: Migrate Firestore → Neon Serverless Postgres (`pgvector`).
3. **Queuing**: Migrate Upstash Redis/QStash → Cloudflare Durable Objects + Cloudflare Queues.
4. **LLM Abstraction**: Implement provider-agnostic `LLMRouter` using Vercel AI SDK (`ai` package).
5. **Cold Path**: OpenWiki Personal Brain GitHub Actions workflow + Neon pgvector vault indexer script.
6. **Skills**: Implement 6 PRD skill intents (`Daily_Focus`, `Task_Capture`, `Reschedule`, `Knowledge_Search`, `Rescue_Mode`, `Session_Handoff`).

## Verification Plan
- `npm run typecheck` (`tsc --noEmit`) passes with 0 errors.
- `npm test` passes 100% on offline integration test suite.
- `npm run evals` passes ≥ 95% on 22 Golden Commands dataset.
- `npm run build` (`wrangler build`) compiles cleanly.
