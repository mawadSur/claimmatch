/**
 * Money helpers for the legacy recoveries ledger (admin only, behind
 * flags.adminRecoveries). ClaimMatch never handles settlement money and takes
 * no cut. There is no per-settlement value estimate and no "total" anywhere.
 * Legacy rows carry their own fee_pct; there is no app-wide fee rate.
 */

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
