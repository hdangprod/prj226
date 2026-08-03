import { batchCommitCaptures } from '../src/tools/gitBatchClient';
import { Env } from '../src/config';
import { embedText } from '../src/lib/embeddings';
import { chunkByHeadings } from '../src/lib/chunking';
import crypto from 'node:crypto';

// Load env secrets from environment or wrangler bindings
const env: Env = {
  GITHUB_OWNER: 'hdangprod',
  GITHUB_REPO: 'hdangprod_wiki_dev',
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',
  EMBEDDING_MODEL: '@cf/baai/bge-base-en-v1.5',
  EMBEDDING_DIMENSIONS: '768',
} as unknown as Env;

const dummyFiles = [
  {
    path: 'wiki/projects/prj226-competitor-benchmark.md',
    title: 'PRJ226 Competitor Benchmark & Market Analysis',
    content: `---
title: "PRJ226 Competitor Benchmark & Market Analysis"
tags: ["prj226", "competitive-analysis", "benchmarks"]
created: "2026-08-03"
source: "wiki"
---
# PRJ226 Competitor Benchmark & Market Analysis

Key competitors in the AI Second Brain space: Obsidian AI, Mem.ai, Notion AI, and Reflect Notes.

## PRJ226 Competitive Advantages:
1. Zero Cold Starts & Sub-25ms Vector Latency: Powered by Cloudflare Workers D1 SQLite + Vectorize.
2. 100% Data Ownership: Native sync to private GitHub repository with Markdown OKF format.
3. Multimodal Edge Voice Capture: Powered by Cloudflare Workers AI Whisper.
4. Closed-Loop AIOS 5-Layer Framework: Autonomous intent routing and self-healing error recovery.

## Action Items:
- Conduct feature parity audit against Notion AI database views.
- Benchmark pricing models: PRJ226 serverless edge execution is 95% cheaper than traditional cloud servers.
`,
  },
  {
    path: 'wiki/architecture/prj226-security-hardening.md',
    title: 'PRJ226 Security Hardening & Edge Encryption',
    content: `---
title: "PRJ226 Security Hardening & Edge Encryption"
tags: ["prj226", "security", "architecture"]
created: "2026-08-03"
source: "wiki"
---
# PRJ226 Security Hardening & Edge Encryption

Security guidelines for PRJ226 AIOS deployment:

1. Strict Webhook Verification: HMAC SHA-256 secret token validation on all Telegram updates.
2. Database Isolation: Dev (prj226-brain-dev) and Prod (prj226-brain-prod) D1 databases are strictly isolated.
3. Zero-Loss Local Buffer: Pending captures buffered in D1 before committing to GitHub.
4. Input Sanitization: SQL injection and prompt injection filtering on all natural language queries.
`,
  },
  {
    path: 'tasks/2026-08-03-prj226-roadmap.md',
    title: 'PRJ226 Q3 Release Milestone & Feature Roadmap',
    content: `---
title: "PRJ226 Q3 Release Milestone & Feature Roadmap"
tags: ["prj226", "roadmap", "tasks"]
created: "2026-08-03"
source: "tasks"
---
# PRJ226 Q3 Release Milestone & Feature Roadmap

Active tasks for PRJ226 AIOS:

- [ ] Finalize competitive matrix against Notion AI and Reflect Notes.
- [ ] Validate sub-25ms hybrid search latency under 10,000 note chunks.
- [ ] Implement automated weekly focus handoff summary in Telegram.
- [ ] Audit OpenRouter model fallbacks for 100% uptime SLA.
`,
  },
];

async function seed() {
  console.log('=== Seeding Dummy PRJ226 Notes & Tasks to GitHub & D1 ===');

  // 1. Commit to GitHub
  console.log('Step 1: Batch committing dummy notes to GitHub dev repo...');
  const filesToCommit = dummyFiles.map((f) => ({
    path: f.path,
    content: f.content,
  }));
  const commitSha = await batchCommitCaptures(filesToCommit, 'feat(wiki): add dummy PRJ226 competitive research and architecture notes', env);
  console.log(`✅ GitHub commit successful! SHA: ${commitSha}`);

  console.log('\nDone! Now executing D1 & Vectorize indexing...');
}

seed().catch(console.error);
