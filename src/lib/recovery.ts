/**
 * Money helpers for the legacy recoveries ledger (admin only, behind
 * flags.adminRecoveries). ClaimMatch never handles settlement money and takes
 * no cut. There is no per-settlement value estimate and no "total" anywhere.
 *
 * FEE_PCT, feeAmount and netAmount are deprecated: they remain only because
 * public pages owned by the copy workstream still import them. Delete them
 * once those imports are gone.
 */

/** @deprecated The fee rate of the retired agreement. Never show it to users. */
export const FEE_PCT = (() => {
  const v = Number(process.env.NEXT_PUBLIC_CLAIMMATCH_FEE_PCT);
  return Number.isFinite(v) && v > 0 && v < 1 ? v : 0.15;
})();

/** @deprecated See FEE_PCT. */
export function feeAmount(gross: number): number {
  return round2(gross * FEE_PCT);
}
/** @deprecated See FEE_PCT. */
export function netAmount(gross: number): number {
  return round2(gross * (1 - FEE_PCT));
}
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatUSD(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '$0';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
