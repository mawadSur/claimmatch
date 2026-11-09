/**
 * React Query keys for the data layer. 'catalog' and 'settlement' are public
 * (PUBLIC_QUERY_ROOTS in src/lib/query-client.ts); every other root is
 * personal and is dropped from memory on sign-out.
 */
export const dataKeys = {
  catalog: ['catalog'] as const,
  /** Prefix of every settlement screen. */
  settlements: ['settlement'] as const,
  settlement: (slug: string) => ['settlement', slug] as const,
  /** Prefix of every claim screen. */
  claims: ['claim'] as const,
  claim: (slug: string) => ['claim', slug] as const,
  dashboard: ['dashboard'] as const,
  /** Prefix of every signed-in user's profile. */
  profiles: ['profile'] as const,
  profile: (userId: string) => ['profile', userId] as const,
  /** The "Deadline reminders" switch and the notification permission. */
  reminderSetting: ['reminder-setting'] as const,
};
