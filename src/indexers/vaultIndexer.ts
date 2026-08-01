/**
 * PRJ226 v4.1: Vault Indexer (GitHub Push Webhook → D1 + Vectorize Cache)
 *
 * Pipeline:
 *   1. Verify HMAC-SHA256 signature
 *   2. Parse push event for changed .md files
 *   3. Fetch blob content via Git Data API
 *   4. Chunk by headings, compute content hashes
 *   5. Skip unchanged chunks, embed changed ones
 *   6. Upsert to D1 note_chunks_cache + Cloudflare Vectorize
 *   7. Clean up removed files from D1 + Vectorize
 */

import type { Env } from '../config';
import { D1Client } from '../tools/d1Client';
import { GitHubReader } from '../tools/githubClient';
import { chunkByHeadings } from '../lib/chunking';
import { embedText, computeContentHash } from '../lib/embeddings';
import { upsertVectors, deleteVectors } from '../tools/vectorizeClient';
import { fetchWithRetry } from '../lib/fetchUtils';

// ─── HMAC-SHA256 Verification ─────────────────────────────────────────────────

async function verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const expectedSig =
    'sha256=' +
    [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return signature === expectedSig;
}

// ─── Push Webhook Handler ────────────────────────────────────────────────────

export async function handleGitHubPushWebhook(
  request: Request,
  env: Env,
): Promise<Response> {
  const startTime = Date.now();

  try {
    // 1. Verify webhook signature
    const signature = request.headers.get('x-hub-signature-256');
    if (!signature) {
      return new Response('Missing signature', { status: 401 });
    }

    const payloadText = await request.text();
    const isValid = await verifySignature(payloadText, signature, env.GITHUB_WEBHOOK_SECRET);
    if (!isValid) {
      return new Response('Invalid signature', { status: 401 });
    }

    const payload = JSON.parse(payloadText) as {
      after: string;
      commits: Array<{
        added?: string[];
        modified?: string[];
        removed?: string[];
      }>;
    };

    if (!payload.commits || !payload.after) {
      return new Response('Not a push event with commits', { status: 200 });
    }

    // 2. Collect changed .md files (deduplicated)
    const added = new Set<string>();
    const modified = new Set<string>();
    const removed = new Set<string>();

    for (const commit of payload.commits) {
      commit.added?.forEach((f) => f.endsWith('.md') && added.add(f));
      commit.modified?.forEach((f) => f.endsWith('.md') && modified.add(f));
      commit.removed?.forEach((f) => f.endsWith('.md') && removed.add(f));
    }

    // Resolve conflicts: removed > modified > added
    for (const file of removed) {
      added.delete(file);
      modified.delete(file);
    }
    for (const file of modified) {
      added.delete(file);
    }

    const toProcess = new Set([...added, ...modified]);
    if (toProcess.size === 0 && removed.size === 0) {
      return new Response('No markdown files changed', { status: 200 });
    }

    const d1 = new D1Client(env);
    const githubReader = new GitHubReader(env);

    // 3. Get file SHAs via recursive tree API
    const headers = {
      Authorization: `token ${env.GITHUB_TOKEN}`,
      'User-Agent': 'PRJ226-Liam/4.1',
    };

    const headCommitRes = await fetchWithRetry(
      `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/git/commits/${payload.after}`,
      { headers },
    );
    const headCommit = (await headCommitRes.json()) as { tree: { sha: string } };

    const treeRes = await fetchWithRetry(
      `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/git/trees/${headCommit.tree.sha}?recursive=1`,
      { headers },
    );
    const treeData = (await treeRes.json()) as {
      tree: Array<{ path: string; type: string; sha: string }>;
    };

    const fileShas = new Map<string, string>();
    for (const node of treeData.tree) {
      if (node.type === 'blob') {
        fileShas.set(node.path, node.sha);
      }
    }

    // 4. Process removals (Query vector IDs BEFORE deleting D1 records)
    for (const path of removed) {
      const existingChunks = await d1.getChunkHashesByPath(path);
      const vectorIds = existingChunks.map((c) => c.id);

      if (vectorIds.length > 0) {
        // Delete from Vectorize in batches of 500
        const BATCH_SIZE = 500;
        for (let i = 0; i < vectorIds.length; i += BATCH_SIZE) {
          const chunkBatch = vectorIds.slice(i, i + BATCH_SIZE);
          try {
            await deleteVectors(chunkBatch, env);
          } catch (err) {
            console.error(`[Vectorize Clean Error] Staging failed delete IDs for ${path}:`, err);
            await d1.stageFailedVectorDeletions(chunkBatch.map((id) => ({ vectorId: id, githubPath: path })));
          }
        }
      }

      const deletedIds = await d1.deleteNoteChunksByPath(path);
      console.log(JSON.stringify({ event: 'chunks_removed', path, count: deletedIds.length }));
    }

    // 5. Process additions and modifications
    let chunksProcessed = 0;
    let chunksSkipped = 0;

    for (const path of toProcess) {
      const sha = fileShas.get(path);
      if (!sha) {
        console.warn(JSON.stringify({ event: 'missing_blob_sha', path }));
        continue;
      }

      // Fetch and parse
      const rawMarkdown = await githubReader.fetchBlob(sha);
      const chunks = await chunkByHeadings(rawMarkdown, path);

      // Get existing hashes for diffing
      const existingHashes = await d1.getChunkHashesByPath(path);
      const existingHashMap = new Map(existingHashes.map((h) => [h.id, h.content_hash]));

      const vectorsToUpsert: Array<{ id: string; values: number[]; metadata?: Record<string, string> }> = [];
      const d1ChunksToUpsert: Array<{
        id: string;
        githubPath: string;
        chunkIndex: number;
        title: string | null;
        content: string;
        contentHash: string;
        tags: string | null;
      }> = [];

      for (const chunk of chunks) {
        const contentHash = await computeContentHash(chunk.content, env);

        // Skip unchanged chunks
        if (existingHashMap.get(chunk.id) === contentHash) {
          chunksSkipped++;
          continue;
        }

        // Generate embedding (with graceful quota handling)
        let embedding: number[] | null = null;
        try {
          embedding = await embedText(chunk.content, env);
        } catch (embErr) {
          console.warn(`[Embedding Quota/Failure] Staging chunk ${chunk.id} for deferred retry:`, embErr);
          await d1.stagePendingEmbedding(chunk.id, chunk.content, path);
        }

        d1ChunksToUpsert.push({
          id: chunk.id,
          githubPath: path,
          chunkIndex: chunk.chunkIndex,
          title: chunk.title,
          content: chunk.content,
          contentHash,
          tags: chunk.tags,
        });

        if (embedding) {
          vectorsToUpsert.push({
            id: chunk.id,
            values: embedding,
            metadata: { path, title: chunk.title || path },
          });
        }

        chunksProcessed++;
      }

      // Bulk upsert to D1 cache + FTS5 in a single atomic batch payload
      if (d1ChunksToUpsert.length > 0) {
        await d1.bulkUpsertNoteChunksAndFts(d1ChunksToUpsert);
      }

      // Batch upsert vectors to Cloudflare Vectorize
      if (vectorsToUpsert.length > 0) {
        await upsertVectors(vectorsToUpsert, env);
      }
    }

    const latencyMs = Date.now() - startTime;
    console.log(
      JSON.stringify({
        event: 'push_webhook_success',
        added: added.size,
        modified: modified.size,
        removed: removed.size,
        chunks_processed: chunksProcessed,
        chunks_skipped: chunksSkipped,
        latency_ms: latencyMs,
        timestamp: new Date().toISOString(),
      }),
    );

    return new Response('OK', { status: 200 });
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    console.error(
      JSON.stringify({
        event: 'push_webhook_error',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        latency_ms: latencyMs,
        timestamp: new Date().toISOString(),
      }),
    );
    return new Response('Internal Server Error', { status: 500 });
  }
}
