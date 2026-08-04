# PRJ226 Kanban Board — Cloudflare Edge Stack (v4.1)

| ID | Title | Layer | Status |
|---|---|---|---|
| EDGE-01 | d1Client: add typed eval-history & prompt-version helpers (insertEvalHistory, insertEvalIteration, getFailedEvals, getEvalIterationsByIds, insertPromptVersion) used by reflectionLoop & nightlyOptimizer | Tools | DONE |
| EDGE-02 | telegramWebhook: wire batch-commit flush via gitBatchClient (resolve missing import) | Sensors | TODO |
| EDGE-03 | llmRouter: align fast/pro generation options with current Vercel AI SDK | Router | TODO |
| EDGE-04 | hybridSearch: extend offline RRF merge coverage in tests/localTest.ts | Tests | TODO |
| EDGE-05 | centralized-messages: consolidate bot reply strings into src/constants/messages.ts | Skills | TODO |
| EDGE-06 | reconciler: add catch-up reconcile for dropped github-webhooks | Indexers | TODO |
| EDGE-07 | intentRouter: add Auto-Capture & HITL edge cases to offline harness | Governance | TODO |