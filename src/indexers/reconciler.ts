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

  if (lastIndexedSha === currentHeadSha) {
    return { processed: 0, errors: 0 }; // 100% up to date
  }

  // 3. Compare commits to extract changed markdown files
  let changedFiles: Array<{ filename: string; status: 'added' | 'modified' | 'removed' }> = [];

  if (lastIndexedSha) {
    try {
      const compareRes = await fetchWithRetry(`${baseUrl}/compare/${lastIndexedSha}...${currentHeadSha}`, { headers });
      const compareData = (await compareRes.json()) as { files?: Array<{ filename: string; status: string }> };
      changedFiles = (compareData.files || [])
        .filter((f) => f.filename.endsWith('.md'))
        .map((f) => ({
          filename: f.filename,
          status: f.status === 'removed' ? 'removed' : 'modified',
        }));
    } catch (err) {
      console.warn('[Reconciler] Compare API failed; performing full tree audit:', err);
      lastIndexedSha === ''; // Fallback to full tree scan
    }
  }

  let processedCount = 0;
  let errorCount = 0;

  // 4. Re-index missing/modified notes without duplicating existing vectors
  for (const file of changedFiles) {
    try {
      if (file.status === 'removed') {
        const existingChunks = await d1.getChunkHashesByPath(file.filename);
        const vectorIds = existingChunks.map((c) => c.id);
        if (vectorIds.length > 0) {
          await deleteVectors(vectorIds, env).catch(() => {});
        }
        await d1.deleteNoteChunksByPath(file.filename);
      } else {
        const fileContent = await githubReader.fetchFileContent(file.filename);
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

  // 5. Update last_indexed_commit_sha in D1 system_state
  await env.DB.prepare(
    `INSERT INTO system_state (key, value, updated_at) VALUES ('last_indexed_commit_sha', ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
  ).bind(currentHeadSha).run();

  return { processed: processedCount, errors: errorCount };
}
