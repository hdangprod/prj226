/**
 * PRJ226 v4.1: Reconciliation Cron Trigger
 * Prevents Edge Cache staleness from dropped GitHub Webhooks by comparing
 * last_indexed_commit_sha against GitHub main HEAD SHA periodically.
 */

import type { Env } from '../config';
import { fetchWithRetry } from '../lib/fetchUtils';
import { chunkByHeadings } from '../lib/chunking';
import { embedText, computeContentHash } from '../lib/embeddings';
import { upsertVectors, deleteVectors } from '../tools/vectorizeClient';
import { D1Client } from '../tools/d1Client';
import { GitHubReader } from '../tools/githubClient';

// Bounded per-invocation workload: a full resync of a large wiki exceeds the
// Worker subrequest budget in a single run, so the audit drains across crons.
const MAX_FILES_PER_RUN = 6;
const REINDEX_QUEUE_KEY = 'reindex_remaining_files';

export async function reconcileVaultIndexCron(env: Env): Promise<{ processed: number; errors: number }> {
  const d1 = new D1Client(env);
  const githubReader = new GitHubReader(env);

  // 1. Fetch last indexed commit SHA from D1 system state
  const stateRes = await env.DB.prepare(
    `SELECT value FROM system_state WHERE key = 'last_indexed_commit_sha'`
  ).first<{ value: string }>();
  const lastIndexedSha = stateRes?.value || '';

  const headers = {
    Authorization: `token ${env.GITHUB_TOKEN}`,
    'User-Agent': 'PRJ226-Liam/4.1',
  };
  const baseUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;

  // 2. Fetch current GitHub main HEAD SHA
  let currentHeadSha = '';
  try {
    const headRes = await fetchWithRetry(`${baseUrl}/git/refs/heads/main`, { headers });
    const headData = (await headRes.json()) as { object: { sha: string } };
    currentHeadSha = headData.object.sha;
  } catch (err) {
    console.error('[Reconciler Error] Failed to fetch remote HEAD SHA:', err);
    return { processed: 0, errors: 1 };
  }

  // A resync is in progress when no baseline exists (fresh/cleared index) or a
  // persisted drain queue is present.
  const isResync = !lastIndexedSha;
  const queueRow = await env.DB.prepare('SELECT value FROM system_state WHERE key = ?').bind(REINDEX_QUEUE_KEY).first<{ value: string }>();
  const queuedRaw = queueRow?.value || '';

  if (lastIndexedSha === currentHeadSha && !queuedRaw) {
    return { processed: 0, errors: 0 }; // 100% up to date
  }

  // Resolve the current repo tree once (path → blob SHA). This powers both the
  // per-file content fetch (GitHubReader.fetchBlob requires a blob SHA) and the
  // full tree audit below.
  const fileShas = new Map<string, string>();
  try {
    const commitRes = await fetchWithRetry(`${baseUrl}/git/commits/${currentHeadSha}`, { headers });
    const commitData = (await commitRes.json()) as { tree: { sha: string } };
    const treeRes = await fetchWithRetry(`${baseUrl}/git/trees/${commitData.tree.sha}?recursive=1`, { headers });
    const treeData = (await treeRes.json()) as { tree: Array<{ path: string; type: string; sha: string }> };
    for (const node of treeData.tree) {
      if (node.type === 'blob' && node.path.endsWith('.md')) fileShas.set(node.path, node.sha);
    }
  } catch (err) {
    console.error('[Reconciler Error] Failed to resolve repo tree:', err);
    return { processed: 0, errors: 1 };
  }

  // 3. Decide this run's work: (a) drain a persisted resync queue in bounded
  // batches, (b) start a fresh resync from a full-tree audit, or (c) process the
  // small incremental diff when a baseline exists.
  let workFiles: Array<{ filename: string; status: 'added' | 'modified' | 'removed' }> = [];
  let remainingFiles: string[] = [];

  if (queuedRaw) {
    try {
      const parsed = JSON.parse(queuedRaw);
      remainingFiles = Array.isArray(parsed) ? parsed : [];
    } catch {
      remainingFiles = [];
    }
    const batch = remainingFiles.slice(0, MAX_FILES_PER_RUN);
    remainingFiles = remainingFiles.slice(batch.length);
    workFiles = batch.map((f) => ({ filename: f, status: 'modified' as const }));
    console.log(JSON.stringify({ event: 'reconciler_resync_batch', batch: workFiles.length, remaining: remainingFiles.length }));
  } else if (isResync) {
    const auditFiles = Array.from(fileShas.keys()).filter((p) => p.endsWith('.md'));
    remainingFiles = auditFiles.slice(MAX_FILES_PER_RUN);
    workFiles = auditFiles.slice(0, MAX_FILES_PER_RUN).map((f) => ({ filename: f, status: 'modified' as const }));
    console.log(JSON.stringify({ event: 'reconciler_full_audit', files: auditFiles.length, batch: workFiles.length }));
  } else {
    try {
      const compareRes = await fetchWithRetry(`${baseUrl}/compare/${lastIndexedSha}...${currentHeadSha}`, { headers });
      const compareData = (await compareRes.json()) as { files?: Array<{ filename: string; status: string }> };
      workFiles = (compareData.files || [])
        .filter((f) => f.filename.endsWith('.md'))
        .map((f) => ({
          filename: f.filename,
          status: f.status === 'removed' ? 'removed' as const : 'modified' as const,
        }));
    } catch (err) {
      console.warn('[Reconciler] Compare API failed; processing nothing this run:', err);
    }
  }

  let processedCount = 0;
  let errorCount = 0;

  // 4. Re-index missing/modified notes without duplicating existing vectors
  for (const file of workFiles) {
    try {
      if (file.status === 'removed') {
        const existingChunks = await d1.getChunkHashesByPath(file.filename);
        const vectorIds = existingChunks.map((c) => c.id);
        if (vectorIds.length > 0) {
          await deleteVectors(vectorIds, env).catch(() => {});
        }
        await d1.deleteNoteChunksByPath(file.filename);
      } else {
        const sha = fileShas.get(file.filename);
        if (!sha) {
          console.warn(JSON.stringify({ event: 'reconciler_missing_sha', path: file.filename }));
          errorCount++;
          continue;
        }
        const fileContent = await githubReader.fetchBlob(sha);
        const chunks = await chunkByHeadings(fileContent, file.filename);
        const existingHashes = await d1.getChunkHashesByPath(file.filename);
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
          if (existingHashMap.get(chunk.id) === contentHash) continue;

          let embedding: number[] | null = null;
          try {
            embedding = await embedText(chunk.content, env);
          } catch {
            await d1.stagePendingEmbedding(chunk.id, chunk.content, file.filename);
          }

          d1ChunksToUpsert.push({
            id: chunk.id,
            githubPath: file.filename,
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
              metadata: { path: file.filename, title: chunk.title || file.filename },
            });
          }
        }

        if (d1ChunksToUpsert.length > 0) {
          await d1.bulkUpsertNoteChunksAndFts(d1ChunksToUpsert);
        }
        if (vectorsToUpsert.length > 0) {
          await upsertVectors(vectorsToUpsert, env);
        }
      }
      processedCount++;
    } catch (err) {
      console.error(`[Reconciler Error] File ${file.filename}:`, err);
      errorCount++;
    }
  }

  // 5. Persist the remaining resync queue, or finalize the sync when drained.
  if (remainingFiles.length > 0) {
    await env.DB.prepare(
      `INSERT INTO system_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
    ).bind(REINDEX_QUEUE_KEY, JSON.stringify(remainingFiles)).run();
  } else {
    await env.DB.prepare('DELETE FROM system_state WHERE key = ?').bind(REINDEX_QUEUE_KEY).run();
    await env.DB.prepare(
      `INSERT INTO system_state (key, value, updated_at) VALUES ('last_indexed_commit_sha', ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
    ).bind(currentHeadSha).run();
  }

  return { processed: processedCount, errors: errorCount };
}
