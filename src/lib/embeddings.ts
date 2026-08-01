import type { Env } from '../config';

/**
 * Embeds text using Cloudflare Workers AI embedding model.
 */
export async function embedText(text: string, env: Env): Promise<number[]> {
  const model = env.EMBEDDING_MODEL || '@cf/baai/bge-base-en-v1.5';
  try {
    const response = await env.AI.run(model as any, { text: [text] });
    const vector = (response as any)?.data?.[0];
    if (!vector || !Array.isArray(vector) || vector.length !== 768) {
      throw new Error(`Invalid vector embedding output format or length (expected 768, got ${vector?.length})`);
    }
    return vector;
  } catch (error) {
    console.error(JSON.stringify({ error: 'Failed to embed text using Workers AI BGE model', details: error }));
    throw error;
  }
}

/**
 * Computes a SHA-256 hash of the content combined with the embedding model.
 */
export async function computeContentHash(content: string, env: Env): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${content}:${env.EMBEDDING_MODEL}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hashBuffer)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
