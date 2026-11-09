import { APP_LEGAL_DISCLAIMER, APP_SHORT_DISCLAIMER } from '@shared/lib/disclaimer';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Application from 'expo-application';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { z } from 'zod';

import {
  applyConfigGuides,
  configGuidesSchema,
  guidesInUse,
  guidesVersionSchema,
  refetchGuidedQueries,
  type GuidesInUse,
} from '@/data/guides';
import { getApi, unwrap } from '@/lib/api';
import { recordServerTime } from '@/lib/clock';
import { applyFlagOverrides, pickClientFlags, type ClientFlagName, type FlagValues } from '@/lib/flags';
import { queryKeys } from '@/lib/query-client';

/**
 * GET /api/mobile/config (plan S5): server flags, server time, legal text,
 * the minimum supported build and the official-notice guides. The endpoint
 * needs no auth. While it has not answered, or when it fails, every flag
 * stays off, the bundled legal text (src/lib/disclaimer.ts, the app's
 * wording) and the bundled guides are used, and the app stays usable.
 */

const optionalText = z.string().trim().min(1).optional().catch(undefined);
const buildNumber = z.coerce.number().int().nonnegative().optional().catch(undefined);

const configResponseSchema = z.object({
  apiVersion: z.number().int().positive(),
  serverTime: z.string(),
  todayDeadlineZone: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  flags: z.record(z.string(), z.unknown()).optional().catch(undefined),
  legal: z
    .object({ disclaimer: optionalText, short: optionalText, contactEmail: optionalText })
    .optional()
    .catch(undefined),
  minBuild: z.object({ ios: buildNumber, android: buildNumber }).optional().catch(undefined),
  guidesVersion: guidesVersionSchema,
  guides: configGuidesSchema,
});

export interface ClientConfig {
  flags: FlagValues;
  legal: { disclaimer: string | null; short: string | null; contactEmail: string | null };
  minBuild: { ios: number; android: number };
  todayDeadlineZone: string | null;
  /** The official-notice guides in use after this answer (src/data/guides.ts). */
  guides: GuidesInUse;
}

/**
 * Reads the config. The request names the guides the app has, so the server
 * sends its list only when it differs; `onGuidesChanged` runs when the answer
 * changes the guides the catalog and settlement screens apply.
 */
export async function fetchClientConfig(signal?: AbortSignal, onGuidesChanged?: () => void): Promise<ClientConfig> {
  const sentAt = Date.now();
  const path = `/api/mobile/config?guides=${encodeURIComponent(guidesInUse().version)}`;
  const response = unwrap(
    await getApi().request(path, {
      auth: false,
      parse: (json) => configResponseSchema.parse(json),
      signal,
    }),
  );
  recordServerTime(response.serverTime, sentAt, Date.now());
  // Applied before React renders the new data, so screens read the new values.
  const flags = pickClientFlags(response.flags);
  applyFlagOverrides(flags);
  const guidesChanged = applyConfigGuides(response);
  const config: ClientConfig = {
    flags,
    legal: {
      disclaimer: response.legal?.disclaimer ?? null,
      short: response.legal?.short ?? null,
      contactEmail: response.legal?.contactEmail ?? null,
    },
    minBuild: { ios: response.minBuild?.ios ?? 0, android: response.minBuild?.android ?? 0 },
    todayDeadlineZone: response.todayDeadlineZone ?? null,
    guides: guidesInUse(),
  };
  if (guidesChanged) onGuidesChanged?.();
  return config;
}

/** True when this binary is older than the minimum the server supports. An unknown build never locks anyone out. */
export function isUpdateRequired(
  minBuild: ClientConfig['minBuild'] | undefined,
  platform: string,
  nativeBuildVersion: string | null,
): boolean {
  const minimum = platform === 'ios' ? minBuild?.ios : platform === 'android' ? minBuild?.android : undefined;
  if (!minimum) return false;
  const current = Number.parseInt(nativeBuildVersion ?? '', 10);
  return Number.isFinite(current) && current < minimum;
}

export interface ConfigContextValue {
  /** 'unavailable' means the request failed and the safe defaults are in use. */
  status: 'loading' | 'ready' | 'unavailable';
  flags: FlagValues;
  /** Read flags through this (or after useConfig) so the screen re-renders when they arrive. */
  isFlagOn(name: ClientFlagName): boolean;
  legal: { disclaimer: string; short: string; contactEmail: string | null; fromServer: boolean };
  updateRequired: boolean;
  /** Today's date in the deadline zone per the server (YYYY-MM-DD), when known. */
  todayDeadlineZone: string | null;
  /**
   * The official-notice guides the catalog and settlement screens apply: the
   * server's when its config has them, otherwise the ones bundled with the app.
   */
  guides: GuidesInUse;
  /** True while the config is being fetched again (for example after refetch()). */
  refreshing: boolean;
  refetch(): void;
}

const NO_FLAGS: FlagValues = {};

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.config,
    // When the answer changes the guides, the catalog and settlement screens are read again with them.
    queryFn: ({ signal }) => fetchClientConfig(signal, () => void refetchGuidedQueries(client)),
    staleTime: 15 * 60_000,
  });
  const { data, status, isFetching, refetch } = query;

  const value = useMemo<ConfigContextValue>(() => {
    const flags = data?.flags ?? NO_FLAGS;
    return {
      status: data ? 'ready' : status === 'pending' ? 'loading' : 'unavailable',
      flags,
      isFlagOn: (name) => flags[name] === true,
      legal: {
        disclaimer: data?.legal.disclaimer ?? APP_LEGAL_DISCLAIMER,
        short: data?.legal.short ?? APP_SHORT_DISCLAIMER,
        contactEmail: data?.legal.contactEmail ?? null,
        fromServer: Boolean(data?.legal.disclaimer),
      },
      updateRequired: isUpdateRequired(data?.minBuild, Platform.OS, Application.nativeBuildVersion),
      todayDeadlineZone: data?.todayDeadlineZone ?? null,
      guides: data?.guides ?? guidesInUse(),
      refreshing: isFetching,
      refetch: () => {
        void refetch();
      },
    };
  }, [data, status, isFetching, refetch]);

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigContextValue {
  const value = useContext(ConfigContext);
  if (!value) throw new Error('useConfig must be used inside ConfigProvider');
  return value;
}
