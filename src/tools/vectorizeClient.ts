import type { Env } from '../config';

/**
 * Upserts vectors in batches of 100 to respect Vectorize limits.
 */
export async function upsertVectors(
  vectors: Array<{ id: string; values: number[]; metadata?: Record<string, string> }>,
  env: Env,
): Promise<void> {
  const batchSize = 100;
  for (let i = 0; i < vectors.length; i += batchSize) {
    const batch = vectors.slice(i, i + batchSize);
    try {
      await env.VECTORIZE.upsert(batch as any);
      console.log(JSON.stringify({ info: `Upserted vector batch`, count: batch.length }));
    } catch (error) {
      console.error(JSON.stringify({ error: 'Failed to upsert vector batch', details: error }));
      throw error;
    }
  }
}

/**
 * Deletes vectors by their IDs.
 */
export async function deleteVectors(ids: string[], env: Env): Promise<void> {
  if (ids.length === 0) return;
  try {
    await env.VECTORIZE.deleteByIds(ids);
    console.log(JSON.stringify({ info: `Deleted vectors`, count: ids.length }));
  } catch (error) {
    console.error(JSON.stringify({ error: 'Failed to delete vectors', details: error }));
    throw error;
  }
}
