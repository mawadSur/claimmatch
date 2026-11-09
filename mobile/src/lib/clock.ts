/**
 * Clock-skew-aware "now" (plan 3.2). The device clock can be wrong. When
 * GET /api/mobile/config reports a server time more than two minutes away
 * from the device clock, `now()` adds the difference. Deadline labels then
 * match the server, which still re-checks every write with its own clock.
 */

const SKEW_THRESHOLD_MS = 2 * 60_000;

let skewMs = 0;

/**
 * Records the server's clock. `sentAt` and `receivedAt` are device
 * timestamps (ms) around the request; their midpoint cancels most latency.
 */
export function recordServerTime(serverTime: string, sentAt: number, receivedAt: number): void {
  const server = Date.parse(serverTime);
  if (!Number.isFinite(server) || receivedAt < sentAt) return;
  const skew = server - (sentAt + receivedAt) / 2;
  skewMs = Math.abs(skew) > SKEW_THRESHOLD_MS ? Math.round(skew) : 0;
}

/** The current time, corrected for a skewed device clock. */
export function now(): Date {
  return new Date(Date.now() + skewMs);
}

/** The correction applied by `now()`, in ms (0 when the device clock is close enough). */
export function clockSkewMs(): number {
  return skewMs;
}

/** Test helper. */
export function resetClockSkew(): void {
  skewMs = 0;
}
