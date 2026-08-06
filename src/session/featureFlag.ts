import type { Env } from '../config';

/** Feature flag for the session-based workflow (§27 Phase 0). Defaults to off. */
export function isSessionFeatureEnabled(env: Env): boolean {
  const raw = env.SESSION_FEATURE_ENABLED?.trim().toLowerCase();
  return raw === 'true' || raw === '1';
}
