import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config();

export interface Config {
  TELEGRAM_BOT_TOKEN: string;
  NOTION_TOKEN: string;
  PROJECTS_DB_ID: string;
  DAILY_LOGS_DB_ID: string;
  TASKS_DB_ID: string;
  AREAS_DB_ID: string;
  RESOURCES_DB_ID: string;
  GEMINI_API_KEY: string;
}

function getEnvOrThrow(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable missing: ${name}. Please set it in your .env file.`);
  }
  return value.trim();
}

export function loadConfig(): Config {
  return {
    TELEGRAM_BOT_TOKEN: getEnvOrThrow('TELEGRAM_BOT_TOKEN'),
    NOTION_TOKEN: getEnvOrThrow('NOTION_TOKEN'),
    PROJECTS_DB_ID: getEnvOrThrow('PROJECTS_DB_ID'),
    DAILY_LOGS_DB_ID: getEnvOrThrow('DAILY_LOGS_DB_ID'),
    TASKS_DB_ID: getEnvOrThrow('TASKS_DB_ID'),
    AREAS_DB_ID: getEnvOrThrow('AREAS_DB_ID'),
    RESOURCES_DB_ID: getEnvOrThrow('RESOURCES_DB_ID'),
    GEMINI_API_KEY: getEnvOrThrow('GEMINI_API_KEY'),
  };
}

export const config = loadConfig();
