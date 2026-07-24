import * as dotenv from 'dotenv';
dotenv.config();

// Hỗ trợ GCP Secret Manager: 
// Nếu Sếp map Secret JSON vào biến môi trường APP_CONFIG, hệ thống sẽ tự động bóc tách.
if (process.env.APP_CONFIG) {
  try {
    const secrets = JSON.parse(process.env.APP_CONFIG);
    for (const [key, value] of Object.entries(secrets)) {
      if (typeof value === 'string') {
        process.env[key] = value;
      }
    }
  } catch (err) {
    console.error('[Config] Failed to parse APP_CONFIG JSON:', err);
  }
}

const REQUIRED_ENV_VARS = [
  'TELEGRAM_BOT_TOKEN',
  'NOTION_API_KEY',
  'NOTION_TASKS_DB_ID',
  'NOTION_PROJECTS_DB_ID',
  'NOTION_AREAS_DB_ID',
  'NOTION_RESOURCES_DB_ID',
  'NOTION_DAILY_LOGS_DB_ID',
  'GEMINI_API_KEY',
] as const;

type EnvKey = typeof REQUIRED_ENV_VARS[number];

function validateEnv(): Record<EnvKey, string> {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `[Config] Missing required environment variables: ${missing.join(', ')}\n` +
      `Please copy .env.example to .env and fill in all values.`
    );
  }
  return Object.fromEntries(
    REQUIRED_ENV_VARS.map((key) => [key, process.env[key] as string])
  ) as Record<EnvKey, string>;
}

export const config = validateEnv();

/**
 * Centralized Gemini model tiers.
 * Model names change over time, so they are env-driven and must NOT be hardcoded
 * elsewhere in the codebase. Defaults point to real, currently-available models.
 *   - LITE: high-frequency, deterministic NLP (parsing, translation, filtering)
 *   - PRO:  low-frequency, complex reasoning (bulk planning, retrospective)
 */
export const MODELS = {
  LITE: process.env.GEMINI_MODEL_LITE || 'gemini-3.1-flash-lite',
  PRO: process.env.GEMINI_MODEL_PRO || 'gemini-3.5-flash',
} as const;

export const TRIAGE_CONFIG = {
  FEATURE_TRIAGE_MODE: process.env.FEATURE_TRIAGE_MODE !== 'OFF',
  THROTTLE_MSG_DELAY_MS: parseInt(process.env.THROTTLE_MSG_DELAY_MS || '300', 10),
  REDIS_TTL_SOFT_LOCK: parseInt(process.env.REDIS_TTL_SOFT_LOCK || '120', 10),
  REDIS_TTL_HARD_LOCK: parseInt(process.env.REDIS_TTL_HARD_LOCK || '600', 10),
} as const;

export const DEBOUNCE_CONFIG = {
  /** Kill-switch: set FEATURE_DEBOUNCE_BUFFER=OFF to bypass debounce entirely */
  FEATURE_DEBOUNCE_BUFFER: process.env.FEATURE_DEBOUNCE_BUFFER !== 'OFF',
  /** Debounce window in ms (default 4000ms, configurable for A/B testing) */
  BUFFER_TIME_MS: parseInt(process.env.DEBOUNCE_BUFFER_TIME_MS || '4000', 10),
  /** Redis key TTL in seconds (fail-safe against memory leak ERR-03) */
  REDIS_KEY_TTL_S: parseInt(process.env.DEBOUNCE_REDIS_TTL_S || '30', 10),
  /** Max messages per buffer before spam truncation (ERR-02) */
  MAX_BUFFER_SIZE: parseInt(process.env.DEBOUNCE_MAX_BUFFER_SIZE || '15', 10),
  /** Optional: Whitelist chat IDs for phased rollout (comma-separated) */
  WHITELIST_CHAT_IDS: process.env.DEBOUNCE_WHITELIST_CHAT_IDS
    ? process.env.DEBOUNCE_WHITELIST_CHAT_IDS.split(',').map(Number)
    : null,
} as const;

export const TASK_SCHEMA_CONTRACT = {
  required_fields: ['name', 'projectName'],
  optional_fields: ['priority', 'estimate', 'dueDate', 'description', 'checklist'],
} as const;

