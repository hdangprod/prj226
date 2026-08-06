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
  TELEGRAM_SESSIONS?: DurableObjectNamespace;
  SESSION_ARCHIVE_QUEUE?: Queue<any>;

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

  // ─── Session-Based Workflow (v4.2) ───
  SESSION_FEATURE_ENABLED?: string;
  TELEGRAM_ALLOWED_USER_IDS?: string;
  TELEGRAM_ALLOWED_CHAT_IDS?: string;
  SESSION_INACTIVITY_MINUTES?: string;
  SESSION_EXPIRY_GRACE_SECONDS?: string;
  SESSION_DEBOUNCE_MS?: string;
  SESSION_DEBOUNCE_MAX_WINDOW_MS?: string;
  SESSION_DEBOUNCE_MAX_FRAGMENTS?: string;
  SESSION_DEBOUNCE_MAX_CHARS?: string;
  SESSION_MAX_PENDING_TURNS?: string;
  SESSION_MAX_PENDING_TEXT_CHARS?: string;
  SESSION_PROMPT_MAX_INPUT_TOKENS?: string;
  SESSION_RESERVED_OUTPUT_TOKENS?: string;
  SESSION_RECENT_TURNS_MAX_TOKENS?: string;
  SESSION_SUMMARY_MAX_TOKENS?: string;
  SESSION_RAG_MAX_TOKENS?: string;
  SESSION_MAX_USER_TURN_TOKENS?: string;
  SESSION_MAX_INPUT_TOKENS_TOTAL?: string;
  SESSION_MAX_OUTPUT_TOKENS_TOTAL?: string;
  SESSION_MAX_LLM_CALLS?: string;
  SESSION_MAX_TURN_PROCESSING_MS?: string;
  SESSION_MAX_EVENT_CLOCK_SKEW_MS?: string;
  SESSION_RAW_RETENTION_HOURS?: string;
  SESSION_SUMMARY_RETENTION_DAYS?: string;
  TELEGRAM_PRIVATE_TOPICS_ENABLED?: string;
}

/** Task schema contract for task capture skill */
export const TASK_SCHEMA_CONTRACT = {
  required_fields: ['name', 'projectName'],
  optional_fields: ['priority', 'estimate', 'dueDate', 'description'],
} as const;
