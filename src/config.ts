/**
 * PRJ226 v3.0: Cloudflare Workers Environment Config
 * All environment variables are injected by Cloudflare Workers runtime via wrangler.toml.
 * DO NOT import dotenv here — Workers does not use process.env.
 */

/**
 * Cloudflare Workers Env bindings interface (100% Free Tier Stack).
 */
export interface Env {
  // ─── Bindings ───
  SESSION_KV: KVNamespace;
  FALLBACK_KV: KVNamespace;

  // ─── Secrets ───
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  TELEGRAM_CHAT_ID: string;
  NOTION_API_KEY: string;
  NOTION_TASKS_DB_ID: string;
  NOTION_PROJECTS_DB_ID: string;
  NOTION_AREAS_DB_ID: string;
  NOTION_RESOURCES_DB_ID: string;
  NOTION_DAILY_LOGS_DB_ID: string;
  DATABASE_URL: string;          // Neon connection string
  LLM_FAST_API_KEY: string;      // API key for the fast model provider
  LLM_PRO_API_KEY: string;       // API key for the pro model provider
  GITHUB_TOKEN: string;          // GitHub PAT for vault reads
  GITHUB_VAULT_REPO: string;     // owner/repo of the OKF vault

  // ─── Vars (non-secret, from wrangler.toml [vars]) ───
  FEATURE_DEBOUNCE_BUFFER: string;
  DEBOUNCE_BUFFER_TIME_MS: string;
  DEBOUNCE_MAX_BUFFER_SIZE: string;
  FEATURE_TRIAGE_MODE: string;
  LLM_FAST_PROVIDER: string;     // 'google' | 'openai' | 'anthropic'
  LLM_FAST_MODEL: string;        // e.g. 'gemini-2.0-flash'
  LLM_PRO_PROVIDER: string;      // 'google' | 'openai' | 'anthropic'
  LLM_PRO_MODEL: string;         // e.g. 'gemini-2.5-pro'
  LLM_EMBED_MODEL: string;       // e.g. 'text-embedding-004'
}

/** Debounce buffer feature flags parsed from env */
export function getDebounceConfig(env: Env) {
  return {
    enabled: env.FEATURE_DEBOUNCE_BUFFER !== 'OFF',
    bufferTimeMs: parseInt(env.DEBOUNCE_BUFFER_TIME_MS || '4000', 10),
    maxBufferSize: parseInt(env.DEBOUNCE_MAX_BUFFER_SIZE || '15', 10),
  } as const;
}

/** Task schema contract for task capture skill */
export const TASK_SCHEMA_CONTRACT = {
  required_fields: ['name', 'projectName'],
  optional_fields: ['priority', 'estimate', 'dueDate', 'description'],
} as const;
