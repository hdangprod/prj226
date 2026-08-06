import { Harness } from './harness';
import {
  MINUTE_MS,
  computeLogicalExpiresAt,
  resolveEventTime,
  classifyExpiry,
  isSessionLogicallyExpired,
} from '../../src/session/timeoutPolicy';

export async function run(h: Harness): Promise<void> {
  const INACTIVITY = 30;
  const GRACE = 10_000;
  const SKEW = 120_000;

  const t0 = 1_700_000_000_000;
  const expires = computeLogicalExpiresAt(t0, INACTIVITY);
  h.assert(expires === t0 + 30 * MINUTE_MS, 'expires_at = last_activity + 30 minutes');

  // Event time resolution
  const inWindow = resolveEventTime(t0 + 1000, t0 + 50_000, SKEW);
  h.assert(inWindow.eventAtMs === t0 + 1000 && !inWindow.clockAnomaly, 'in-window event uses telegram timestamp');

  const skewed = resolveEventTime(t0 - 10_000_000, t0, SKEW);
  h.assert(skewed.eventAtMs === t0 && skewed.clockAnomaly, 'out-of-window event uses receipt time + anomaly flag');

  const missing = resolveEventTime(undefined, t0, SKEW);
  h.assert(missing.eventAtMs === t0 && missing.clockAnomaly, 'missing event timestamp uses receipt time');

  // Boundary rule
  h.assert(
    classifyExpiry(t0 + 1000, expires, t0 + 60_000, GRACE).decision === 'admit_to_active',
    'event before expiry admits to active session',
  );

  h.assert(
    classifyExpiry(expires, expires, expires, GRACE).decision === 'start_new_session',
    'event exactly at expiry starts a new session',
  );

  h.assert(
    classifyExpiry(expires + 1, expires, expires + 1, GRACE).decision === 'start_new_session',
    'event after expiry starts a new session',
  );

  // Ingress grace: sent before expiry, received within grace
  h.assert(
    classifyExpiry(expires - 100, expires, expires + 5_000, GRACE).decision === 'admit_to_active',
    'grace admits event sent just before expiry received within grace',
  );

  h.assert(
    classifyExpiry(expires - 100, expires, expires + 15_000, GRACE).decision === 'start_new_session',
    'receipt beyond grace starts a new session',
  );

  h.assert(
    classifyExpiry(expires - 100, expires, expires + GRACE, GRACE).decision === 'admit_to_active',
    'receipt exactly at expiry+grace is admitted',
  );

  // Logical expiry independent of alarm timing (delayed alarm cannot extend).
  h.assert(isSessionLogicallyExpired(expires, expires) === true, 'logical expiry true at boundary');
  h.assert(isSessionLogicallyExpired(expires - 1, expires) === false, 'logical expiry false just before boundary');

  // Reset semantics: new activity extends window.
  const secondExpires = computeLogicalExpiresAt(t0 + 5 * MINUTE_MS, INACTIVITY);
  h.assert(secondExpires > expires, 'new activity extends expiry window');
}

export default run;
