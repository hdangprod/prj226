import type { Env } from '../config';

const RRF_K = 60;
const VECTOR_WEIGHT = 0.7;
const FTS_WEIGHT = 0.3;

export interface HybridSearchResult {
  id: string;
  score: number;
}

/**
 * Performs reciprocal rank fusion search using Vectorize and D1 FTS5.
 */
export async function hybridSearch(
  query: string,
  queryVector: number[],
  env: Env,
): Promise<HybridSearchResult[]> {
  let vectorResults: Array<{ id: string; score: number }> = [];
  let ftsResults: Array<{ id: string; rank: number }> = [];

  const [vectorRes, ftsRes] = await Promise.allSettled([
    env.VECTORIZE.query(queryVector, { topK: 20, returnMetadata: 'all' }),
    (async () => {
      const stmt = env.DB.prepare(
        'SELECT id, title, bm25(note_chunks_fts) as rank FROM note_chunks_fts WHERE note_chunks_fts MATCH ? ORDER BY rank LIMIT 20'
      ).bind(query);
      const res = await stmt.all<{ id: string; title: string; rank: number }>();
      return res.results || [];
    })()
  ]);

  if (vectorRes.status === 'fulfilled') {
    vectorResults = vectorRes.value.matches.map((m) => ({ id: m.id, score: m.score }));
  } else {
    console.warn(JSON.stringify({ warning: 'Vectorize query failed, falling back to FTS5', error: vectorRes.reason }));
  }

  if (ftsRes.status === 'fulfilled') {
    ftsResults = ftsRes.value;
  } else {
    console.error(JSON.stringify({ error: 'FTS5 query failed', details: ftsRes.reason }));
  }

  const scores = new Map<string, number>();

  // RRF for Vector
  vectorResults.forEach((res, index) => {
    const rank = index + 1;
    const rrfScore = 1 / (RRF_K + rank);
    scores.set(res.id, (scores.get(res.id) || 0) + rrfScore * VECTOR_WEIGHT);
  });

  // RRF for FTS
  ftsResults.forEach((res, index) => {
    const rank = index + 1;
    const rrfScore = 1 / (RRF_K + rank);
    scores.set(res.id, (scores.get(res.id) || 0) + rrfScore * FTS_WEIGHT);
  });

  const merged = Array.from(scores.entries()).map(([id, score]) => ({ id, score }));
  merged.sort((a, b) => b.score - a.score);

  return merged.slice(0, 5);
}
