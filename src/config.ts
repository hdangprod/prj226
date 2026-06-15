import * as dotenv from 'dotenv';

dotenv.config();

function getEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
}

export const config = {
  NOTION_TOKEN: getEnv('NOTION_TOKEN'),
  TELEGRAM_BOT_TOKEN: getEnv('TELEGRAM_BOT_TOKEN'),
  GEMINI_API_KEY: getEnv('GEMINI_API_KEY'),
  NOTION_DB_TASKS: getEnv('TASKS_DB_ID'),
  NOTION_DB_PROJECTS: getEnv('PROJECTS_DB_ID'),
  NOTION_DB_DAILY_LOGS: getEnv('DAILY_LOGS_DB_ID'),
  NOTION_DB_AREAS: getEnv('AREAS_DB_ID'),
  NOTION_DB_RESOURCES: getEnv('RESOURCES_DB_ID'),
};
