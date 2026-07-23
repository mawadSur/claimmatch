import { describe, it } from 'vitest';

/**
 * PLACEHOLDER — intentionally skipped.
 *
 * src/lib/recovery.ts is being reworked concurrently by another agent to bring
 * it in line with the locked business model: ClaimMatch is FREE to users and
 * earns referral/lead fees. It NEVER takes a percentage of a user's recovery.
 * Writing live tests against it now would race a moving API, so this file only
 * records the coverage a follow-up pass MUST add once that module settles.
 *
 * When recovery.ts stabilizes, un-skip this block and implement:
 *
 *  1. FEE REMOVAL — the old 15% contingency fee is gone. Whatever shape the new
 *     estimate takes, assert there is no `fee_pct` / `fee_amount` deduction and
 *     that the user-facing net equals the gross recovery (we take $0 from it).
 *
 *  2. HONEST ESTIMATE — the estimate should reflect the settlement's published
 *     range (estimated_value_min / estimated_value_max), not an inflated or
 *     fabricated number. Assert min <= estimate <= max, and that a mid/typical
 *     estimate falls inside the range.
 *
 *  3. NULL / MISSING HANDLING — lawsuits with no value data
 *     (estimated_value_min == null && estimated_value_max == null, and/or a
 *     null typical_payout) must not throw and must not invent a dollar figure.
 *     Assert the function returns a clearly "unknown"/null estimate instead of
 *     NaN, 0-as-if-real, or a crash.
 *
 *  4. RANGE-ONLY INPUTS — only a min, or only a max, present. Assert the
 *     estimate degrades gracefully rather than treating the missing bound as 0.
 */
describe.skip('recovery — follow-up coverage (blocked on concurrent rewrite)', () => {
  it('takes no fee from the user recovery', () => {
    // TODO: implement once src/lib/recovery.ts lands the fee-free model.
  });

  it('returns an honest estimate within the published settlement range', () => {
    // TODO: implement once the estimate API is finalized.
  });

  it('handles null / missing value data without inventing a figure', () => {
    // TODO: implement once null-handling behavior is finalized.
  });
});
