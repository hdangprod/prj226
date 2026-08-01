---
trigger: model_decision
---

# Pre-Deploy Checklist Workflow (Cloudflare Workers)

Run this 3-step verification before deploying to Cloudflare Workers:

1. **Environment & Binding Validation (`wrangler.toml`)**:
   Ensure all Cloudflare bindings (D1 `DB`, Vectorize `VECTORIZE`, Workers AI `AI`, KV `SESSION_KV`) and secrets (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `GITHUB_TOKEN`, `LLM_FAST_API_KEY`, `LLM_PRO_API_KEY`) are properly configured in `wrangler.toml` or set via `wrangler secret put`.

2. **TypeScript Compilation & Dry Run Check**:
   Run `npm run build` (`wrangler build`) and `npm run typecheck` (`tsc --noEmit`) locally. Do NOT deploy if compilation fails or import paths break.

3. **Offline Integration & Evaluation Suite**:
   Run `npm test` and `npm run evals` to ensure all 22 offline integration tests pass and intent routing accuracy is ≥ 95%.
