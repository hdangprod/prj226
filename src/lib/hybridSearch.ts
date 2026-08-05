import type { Env } from '../config';

const RRF_K = 60;
const VECTOR_WEIGHT = 0.7;
const FTS_WEIGHT = 0.3;
const VECTOR_TIMEOUT_MS = 8000;
const FTS_TIMEOUT_MS = 8000;

export interface HybridSearchResult {
  id: string;
  score: number;
  relevancePercent: number;
}

/**
 * Rejects a promise if it does not settle within `ms`. Prevents a single
 * upstream hang (e.g. Vectorize or D1) from blocking the whole search.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

/**
 * Performs reciprocal rank fusion search using Vectorize and D1 FTS5.
 * Each query runs under its own timeout and degrades gracefully, so a slow
 * or failing Vectorize query falls back to FTS5-only results instead of hanging.
 */
export async function hybridSearch(
  query: string,
  queryVector: number[],
  env: Env,
  ftsQuery?: string,
): Promise<HybridSearchResult[]> {
  let vectorResults: Array<{ id: string; score: number }> = [];
  let ftsResults: Array<{ id: string; rank: number }> = [];

  const ftsMatch = (ftsQuery || query).trim();

  const [vectorRes, ftsRes] = await Promise.allSettled([
    withTimeout(
      env.VECTORIZE.query(queryVector, { topK: 20, returnMetadata: 'all' }),
      VECTOR_TIMEOUT_MS,
      'Vectorize query',
    ),
    withTimeout(
      (async () => {
        const stmt = env.DB.prepare(
          'SELECT id, title, bm25(note_chunks_fts) as rank FROM note_chunks_fts WHERE note_chunks_fts MATCH ? ORDER BY rank LIMIT 20'
        ).bind(ftsMatch);
        const res = await stmt.all<{ id: string; title: string; rank: number }>();
        return res.results || [];
      })(),
      FTS_TIMEOUT_MS,
      'FTS5 query',
    ),
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

  const vectorScoreMap = new Map<string, number>(vectorResults.map((v) => [v.id, v.score]));
  const maxRrf = (1 / (RRF_K + 1)) * VECTOR_WEIGHT + (1 / (RRF_K + 1)) * FTS_WEIGHT;

  const merged = Array.from(scores.entries()).map(([id, rrfScore]) => {
    const vecScore = vectorScoreMap.get(id);
    let relevancePercent: number;
    if (vecScore !== undefined && vecScore > 0) {
      relevancePercent = Math.min(99, Math.max(10, Math.round(vecScore > 1 ? (vecScore / 2) * 100 : vecScore * 100)));
    } else {
      relevancePercent = Math.min(95, Math.max(15, Math.round((rrfScore / maxRrf) * 85)));
    }
    return { id, score: rrfScore, relevancePercent };
  });

  merged.sort((a, b) => b.score - a.score);

  // Only surface FTS5-only matches (not semantically corroborated by Vectorize)
  // when Vectorize returned nothing — otherwise keyword noise (e.g. stray inbox
  // captures) pollutes the source list with low-relevance, unexplained results.
  const vectorIdSet = new Set(vectorResults.map((v) => v.id));
  const vectorCorroborated = merged.filter((r) => vectorIdSet.has(r.id));

  return (vectorCorroborated.length > 0 ? vectorCorroborated : merged).slice(0, 5);
}
