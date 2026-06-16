import * as dotenv from 'dotenv';
dotenv.config();

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
  LITE: process.env.GEMINI_MODEL_LITE || 'gemini-1.5-flash',
  PRO: process.env.GEMINI_MODEL_PRO || 'gemini-1.5-pro',
} as const;
