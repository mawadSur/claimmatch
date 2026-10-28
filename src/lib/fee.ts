/**
 * Public fee display. The live site stays on “free during beta” until
 * FEE_DISCLOSURE_ENABLED=1 (counsel review). That flag shows the owner’s
 * every-claim recovery share from src/lib/copy.ts.
 *
 * NEXT_PUBLIC_CLAIMMATCH_FEE_DISPLAY is a leftover override. Do not use it
 * on public pages while the beta wording is the default.
 */
export const FEE_DISPLAY = (
  process.env.NEXT_PUBLIC_CLAIMMATCH_FEE_DISPLAY ?? 'TBD'
).trim() || 'TBD';

export function isFeeTbd(): boolean {
  return FEE_DISPLAY.toUpperCase() === 'TBD';
}
