import type { Env } from '../config';

/**
 * Embeds text using Cloudflare Workers AI embedding model.
 */
export async function embedText(text: string, env: Env): Promise<number[]> {
  try {
    const response = await env.AI.run(env.EMBEDDING_MODEL as any, { text: [text] });
    return (response as any).data[0];
  } catch (error) {
    console.error(JSON.stringify({ error: 'Failed to embed text', details: error }));
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
