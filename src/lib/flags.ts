// Server-side switches. Each defaults to the safe Phase 0 behavior and turns on
// only when its env var is exactly "1". Vercel applies env changes on the next
// deploy, so no code change is needed to flip one.

function on(name: string): boolean {
  return process.env[name] === '1';
}

export const flags = {
  /** D50: the daily state-only match email. Off until the Phase 1 engine ships. */
  matchEmails: () => on('MATCH_EMAILS_ENABLED'),
  /** D50: the Monday digest. Off until the Phase 1 engine ships. */
  digest: () => on('DIGEST_ENABLED'),
  /** Admin money actions on legacy recovery rows (record received, mark paid). */
  adminRecoveries: () => on('ADMIN_RECOVERIES_ENABLED'),
  /** The fictional sample adapter. Never runs in production, even if set. */
  sampleSource: () => on('ENABLE_SAMPLE_SOURCE') && process.env.NODE_ENV !== 'production',
};
