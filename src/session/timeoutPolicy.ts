/**
 * PRJ226 v4.2: Sliding user-inactivity timeout policy (§9).
 *
 * logical_expires_at = last_accepted_user_activity_at + inactivity window.
 * Boundary rule: event_at < expires_at admits to the active session;
 * event_at >= expires_at starts a new session. Ingress grace is transport
 * tolerance, not extra inactivity time.
 */

export const MINUTE_MS = 60_000;

export function computeLogicalExpiresAt(
  lastUserActivityAtMs: number,
  inactivityMinutes: number,
): number {
  return lastUserActivityAtMs + inactivityMinutes * MINUTE_MS;
}

export interface ResolvedEventTime {
  eventAtMs: number;
  clockAnomaly: boolean;
}

/**
 * Use the Telegram event timestamp only when it is within the ingress window
 * around worker receipt; otherwise use receipt time and record an anomaly
 * (§9.3).
 */
export function resolveEventTime(
  telegramEventAtMs: number | undefined,
  receivedAtMs: number,
  maxSkewMs: number,
): ResolvedEventTime {
  if (telegramEventAtMs === undefined) {
    return { eventAtMs: receivedAtMs, clockAnomaly: true };
  }
  if (Math.abs(telegramEventAtMs - receivedAtMs) <= maxSkewMs) {
    return { eventAtMs: telegramEventAtMs, clockAnomaly: false };
  }
  return { eventAtMs: receivedAtMs, clockAnomaly: true };
}

export type ExpiryDecision =
  | { decision: 'admit_to_active' }
  | { decision: 'start_new_session' };

/**
 * Admission rule (§9.4, §9.5):
 *   telegram_event_at < logical_expires_at
 *   AND received_at <= logical_expires_at + EXPIRY_INGRESS_GRACE
 * -> admit to the active session. Otherwise the message starts a new session.
 */
export function classifyExpiry(
  eventAtMs: number,
  logicalExpiresAtMs: number,
  receivedAtMs: number,
  ingressGraceMs: number,
): ExpiryDecision {
  if (
    eventAtMs < logicalExpiresAtMs &&
    receivedAtMs <= logicalExpiresAtMs + ingressGraceMs
  ) {
    return { decision: 'admit_to_active' };
  }
  return { decision: 'start_new_session' };
}

export function isSessionLogicallyExpired(
  eventAtMs: number,
  logicalExpiresAtMs: number,
): boolean {
  return eventAtMs >= logicalExpiresAtMs;
}
