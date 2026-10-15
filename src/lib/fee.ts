/**
 * Public fee display. The amount is undecided (Mohammed, Oct 2026), so the
 * default is TBD and the UI says ClaimMatch is free during beta.
 *
 * NEXT_PUBLIC_CLAIMMATCH_FEE_PCT is kept for later accounting. Do not use it
 * on public pages until a fee is announced.
 */
export const FEE_DISPLAY = (
  process.env.NEXT_PUBLIC_CLAIMMATCH_FEE_DISPLAY ?? 'TBD'
).trim() || 'TBD';

export function isFeeTbd(): boolean {
  return FEE_DISPLAY.toUpperCase() === 'TBD';
}
