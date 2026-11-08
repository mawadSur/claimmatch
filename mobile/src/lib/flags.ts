import { CLIENT_FLAG_NAMES, setFlagOverrides, type ClientFlagName } from '@shared/lib/flags';

export type { ClientFlagName };

/** Server values for the flags the app may see (GET /api/mobile/config). */
export type FlagValues = Readonly<Partial<Record<ClientFlagName, boolean>>>;

/** Keeps only CLIENT_FLAG_NAMES with boolean values; anything else is ignored. */
export function pickClientFlags(raw: Readonly<Record<string, unknown>> | undefined): FlagValues {
  const flags: Partial<Record<ClientFlagName, boolean>> = {};
  for (const name of CLIENT_FLAG_NAMES) {
    const value = raw?.[name];
    if (typeof value === 'boolean') flags[name] = value;
  }
  return flags;
}

/**
 * Feeds server flag values to the shared rule modules, which on a device see
 * no server environment, so every flag reads as off until this runs. Passing
 * null turns every flag off again.
 */
export function applyFlagOverrides(values: FlagValues | null): void {
  setFlagOverrides(values ? { ...values } : null);
}

/**
 * Whether fees are worded for FEE_DISCLOSURE_ENABLED (src/app/signup/page.tsx,
 * src/app/dashboard/page.tsx), given useConfig(). Until the server's flags are
 * known (still loading, or unreachable), the disclosed wording is used:
 * "Official filing … stays free" is true either way, while "free for now"
 * would be false once a fee is live (plan 5).
 */
export function showsFeeDisclosure(config: { status: string; isFlagOn(name: ClientFlagName): boolean }): boolean {
  return config.status !== 'ready' || config.isFlagOn('FEE_DISCLOSURE_ENABLED');
}
