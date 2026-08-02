/**
 * PRJ226 v4.1: Cloudflare Workers Environment Config
 * All environment variables are injected by Cloudflare Workers runtime via wrangler.toml.
 * DO NOT import dotenv here — Workers does not use process.env.
 */

/**
 * Cloudflare Workers Env bindings interface (v4.1 Pure Edge Stack).
 */
export interface Env {
  // ─── Cloudflare Bindings ───
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  AI: Ai;
  SESSION_KV: KVNamespace;
  AUDIO_BUCKET?: R2Bucket;
  R2_PUBLIC_DOMAIN?: string;

  // ─── Secrets ───
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  TELEGRAM_CHAT_ID: string;
  GITHUB_TOKEN: string;
  GITHUB_WEBHOOK_SECRET: string;
  LLM_FAST_API_KEY?: string;
  LLM_PRO_API_KEY?: string;
  GEMINI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;

  // ─── Vars (non-secret, from wrangler.toml [vars]) ───
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  EMBEDDING_MODEL: string;
  EMBEDDING_DIMENSIONS: string;
  TELEGRAM_BOT_USERNAME: string;
  LLM_FAST_PROVIDER: string;
  LLM_FAST_MODEL: string;
  LLM_PRO_PROVIDER: string;
  LLM_PRO_MODEL: string;
}

/** Task schema contract for task capture skill */
export const TASK_SCHEMA_CONTRACT = {
  required_fields: ['name', 'projectName'],
  optional_fields: ['priority', 'estimate', 'dueDate', 'description'],
} as const;
