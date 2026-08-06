/**
 * PRJ226 v4.2: Session configuration parsing & validation (§26).
 *
 * Parses string env vars into a validated SessionConfig. Numbers are range
 * checked; security-critical config (allowlists, inactivity window) fails
 * closed rather than defaulting. Non-secret tuning params get safe defaults.
 */

import type { Env } from '../config';
import { SessionConfigError } from './errors';

export interface SessionConfig {
  featureEnabled: boolean;
  allowedUserIds: number[];
  allowedChatIds: number[];

  // Timeout (§9)
  inactivityMinutes: number;
  expiryIngressGraceSeconds: number;
  maxEventClockSkewMs: number;
  maxTurnProcessingMs: number;

  // Debounce (§10.4)
  debounceMs: number;
  debounceMaxWindowMs: number;
  debounceMaxFragments: number;
  debounceMaxChars: number;

  // Backpressure (§10.7)
  maxPendingTurns: number;
  maxPendingTextChars: number;

  // Token budgets (§13.2)
  promptMaxInputTokens: number;
  reservedOutputTokens: number;
  recentTurnsMaxTokens: number;
  summaryMaxTokens: number;
  ragMaxTokens: number;
  maxUserTurnTokens: number;
  maxInputTokensTotal: number;
  maxOutputTokensTotal: number;
  maxLlmCalls: number;

  // Retention (§16.7)
  rawRetentionHours: number;
  summaryRetentionDays: number;

  // Topics (§5.3)
  privateTopicsEnabled: boolean;
}

function num(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  label: string,
): number {
  if (value === undefined || value.trim() === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new SessionConfigError(`invalid ${label}: "${value}"`);
  if (n < min || n > max) {
    throw new SessionConfigError(`${label} out of range [${min},${max}]: ${n}`);
  }
  return n;
}

function idList(value: string | undefined, label: string): number[] {
  if (!value || value.trim() === '') return [];
  return value.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const n = Number(s);
    if (!Number.isInteger(n)) throw new SessionConfigError(`invalid ${label} id: "${s}"`);
    return n;
  });
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  const v = value.trim().toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  throw new SessionConfigError(`invalid boolean: "${value}"`);
}

const DEFAULTS: SessionConfig = {
  featureEnabled: false,
  allowedUserIds: [],
  allowedChatIds: [],
  inactivityMinutes: 30,
  expiryIngressGraceSeconds: 10,
  maxEventClockSkewMs: 120_000,
  maxTurnProcessingMs: 60_000,
  debounceMs: 1500,
  debounceMaxWindowMs: 5000,
  debounceMaxFragments: 5,
  debounceMaxChars: 12_000,
  maxPendingTurns: 10,
  maxPendingTextChars: 50_000,
  promptMaxInputTokens: 24_000,
  reservedOutputTokens: 2048,
  recentTurnsMaxTokens: 8000,
  summaryMaxTokens: 1200,
  ragMaxTokens: 6000,
  maxUserTurnTokens: 6000,
  maxInputTokensTotal: 150_000,
  maxOutputTokensTotal: 30_000,
  maxLlmCalls: 100,
  rawRetentionHours: 24,
  summaryRetentionDays: 90,
  privateTopicsEnabled: false,
};

export function parseSessionConfig(env: Partial<Env> | Record<string, string | undefined>): SessionConfig {
  const cfg: SessionConfig = {
    featureEnabled: bool(env.SESSION_FEATURE_ENABLED, false),
    allowedUserIds: idList(env.TELEGRAM_ALLOWED_USER_IDS, 'TELEGRAM_ALLOWED_USER_IDS'),
    allowedChatIds: idList(env.TELEGRAM_ALLOWED_CHAT_IDS, 'TELEGRAM_ALLOWED_CHAT_IDS'),
    inactivityMinutes: num(env.SESSION_INACTIVITY_MINUTES, 30, 1, 1440, 'SESSION_INACTIVITY_MINUTES'),
    expiryIngressGraceSeconds: num(env.SESSION_EXPIRY_GRACE_SECONDS, 10, 0, 300, 'SESSION_EXPIRY_GRACE_SECONDS'),
    maxEventClockSkewMs: num(env.SESSION_MAX_EVENT_CLOCK_SKEW_MS, 120_000, 1000, 3_600_000, 'SESSION_MAX_EVENT_CLOCK_SKEW_MS'),
    maxTurnProcessingMs: num(env.SESSION_MAX_TURN_PROCESSING_MS, 60_000, 5000, 300_000, 'SESSION_MAX_TURN_PROCESSING_MS'),
    debounceMs: num(env.SESSION_DEBOUNCE_MS, 1500, 0, 30_000, 'SESSION_DEBOUNCE_MS'),
    debounceMaxWindowMs: num(env.SESSION_DEBOUNCE_MAX_WINDOW_MS, 5000, 0, 60_000, 'SESSION_DEBOUNCE_MAX_WINDOW_MS'),
    debounceMaxFragments: num(env.SESSION_DEBOUNCE_MAX_FRAGMENTS, 5, 1, 50, 'SESSION_DEBOUNCE_MAX_FRAGMENTS'),
    debounceMaxChars: num(env.SESSION_DEBOUNCE_MAX_CHARS, 12_000, 100, 100_000, 'SESSION_DEBOUNCE_MAX_CHARS'),
    maxPendingTurns: num(env.SESSION_MAX_PENDING_TURNS, 10, 1, 100, 'SESSION_MAX_PENDING_TURNS'),
    maxPendingTextChars: num(env.SESSION_MAX_PENDING_TEXT_CHARS, 50_000, 100, 500_000, 'SESSION_MAX_PENDING_TEXT_CHARS'),
    promptMaxInputTokens: num(env.SESSION_PROMPT_MAX_INPUT_TOKENS, 24_000, 1000, 200_000, 'SESSION_PROMPT_MAX_INPUT_TOKENS'),
    reservedOutputTokens: num(env.SESSION_RESERVED_OUTPUT_TOKENS, 2048, 128, 32_000, 'SESSION_RESERVED_OUTPUT_TOKENS'),
    recentTurnsMaxTokens: num(env.SESSION_RECENT_TURNS_MAX_TOKENS, 8000, 128, 100_000, 'SESSION_RECENT_TURNS_MAX_TOKENS'),
    summaryMaxTokens: num(env.SESSION_SUMMARY_MAX_TOKENS, 1200, 64, 32_000, 'SESSION_SUMMARY_MAX_TOKENS'),
    ragMaxTokens: num(env.SESSION_RAG_MAX_TOKENS, 6000, 64, 100_000, 'SESSION_RAG_MAX_TOKENS'),
    maxUserTurnTokens: num(env.SESSION_MAX_USER_TURN_TOKENS, 6000, 64, 100_000, 'SESSION_MAX_USER_TURN_TOKENS'),
    maxInputTokensTotal: num(env.SESSION_MAX_INPUT_TOKENS_TOTAL, 150_000, 1000, 10_000_000, 'SESSION_MAX_INPUT_TOKENS_TOTAL'),
    maxOutputTokensTotal: num(env.SESSION_MAX_OUTPUT_TOKENS_TOTAL, 30_000, 128, 1_000_000, 'SESSION_MAX_OUTPUT_TOKENS_TOTAL'),
    maxLlmCalls: num(env.SESSION_MAX_LLM_CALLS, 100, 1, 10_000, 'SESSION_MAX_LLM_CALLS'),
    rawRetentionHours: num(env.SESSION_RAW_RETENTION_HOURS, 24, 1, 720, 'SESSION_RAW_RETENTION_HOURS'),
    summaryRetentionDays: num(env.SESSION_SUMMARY_RETENTION_DAYS, 90, 1, 3650, 'SESSION_SUMMARY_RETENTION_DAYS'),
    privateTopicsEnabled: bool(env.TELEGRAM_PRIVATE_TOPICS_ENABLED, false),
  };

  // Fail closed when the session feature is enabled but authorization config is missing.
  if (cfg.featureEnabled) {
    if (cfg.allowedUserIds.length === 0) {
      throw new SessionConfigError('SESSION_FEATURE_ENABLED=true requires non-empty TELEGRAM_ALLOWED_USER_IDS');
    }
    if (cfg.allowedChatIds.length === 0) {
      throw new SessionConfigError('SESSION_FEATURE_ENABLED=true requires non-empty TELEGRAM_ALLOWED_CHAT_IDS');
    }
  }

  return cfg;
}

export { DEFAULTS as SESSION_CONFIG_DEFAULTS };
