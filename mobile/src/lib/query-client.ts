import { QueryClient } from '@tanstack/react-query';

import { ApiRequestError } from './api';

/**
 * React Query keys whose data is public (no personal data). Everything else
 * is treated as personal and dropped from memory when the user signs out.
 * The cache is memory only: nothing is persisted, so no personal data sits
 * on disk (plan 3.2).
 */
export const PUBLIC_QUERY_ROOTS: ReadonlySet<string> = new Set(['config', 'catalog', 'settlement']);

export const queryKeys = {
  config: ['config'] as const,
};

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiRequestError) {
    // Client errors (signed out, not found, invalid input) do not get better on retry.
    if (error.loggedOut || (error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429)) {
      return false;
    }
  }
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        staleTime: 60_000,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

/**
 * Removes every non-public query and every mutation, for sign-out and account
 * switches. Mutations go too: their variables and results hold personal data
 * (settings payloads with name, phone and address; confirmation numbers).
 */
export function clearPersonalQueries(client: QueryClient): void {
  client.removeQueries({ predicate: (query) => !PUBLIC_QUERY_ROOTS.has(String(query.queryKey[0])) });
  const mutationCache = client.getMutationCache();
  const mutations = mutationCache.getAll();
  mutationCache.clear();
  // clear() keeps each mutation's garbage-collection timer, which holds the
  // mutation (and its variables) in memory until it fires; destroy() stops it.
  mutations.forEach((mutation) => mutation.destroy());
}
