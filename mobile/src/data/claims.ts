import {
  parseClaimPatch,
  parseStartTracking,
  type ClaimAction,
  type ClaimView,
  type StartIntent,
} from '@shared/lib/claims';
import type { ClaimScreenError, ClaimScreenResponse } from '@shared/lib/mobile-contract';
import { useMutation, useQuery, useQueryClient, type Query, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { z } from 'zod';

import { ApiRequestError, getApi, unwrap } from '@/lib/api';
import { now } from '@/lib/clock';
import { useAuth } from '@/providers/AuthProvider';

import { refreshDashboardSoon } from './dashboard';
import { invalidInput } from './errors';
import { dataKeys } from './keys';
import {
  acknowledgeFictionalResponseSchema,
  claimChangeResponseSchema,
  claimViewSchema,
  parseClaimScreenResponse,
  startTrackingResponseSchema,
} from './schemas';

/**
 * The claim screen and every claim write (plan 1.1). The server is the only
 * writer of claims: writes go to the web API with the bearer token, and the
 * claim it answers with replaces the one on screen.
 */

export type ClosedClaimScreen = Extract<ClaimScreenResponse, { kind: 'closed' }>;
export type FlowClaimScreen = Extract<ClaimScreenResponse, { kind: 'flow' }>;

/**
 * GET /api/mobile/claim/{slug}, one value per outcome the screen shows.
 * Failures are thrown as ApiRequestError (network, auth_unavailable, rate
 * limit, a malformed answer, and the 503 load_error, see claimLoadErrorWhat),
 * so React Query shows them as errors and a reload that fails keeps the
 * screen it had, with anything typed into it.
 */
export type ClaimScreenResult =
  /** 200: the settlement is closed and the user has no claim (the closed card). */
  | ClosedClaimScreen
  /** 200: the claim flow. */
  | FlowClaimScreen
  /** 404 not_found: the root not-found copy. */
  | { kind: 'not_found' }
  /** 401: no session, or this request signed the user out (`loggedOut`). Show the claim log-in prompt. */
  | { kind: 'signed_out'; loggedOut: boolean };

export type LoadErrorWhat = Extract<ClaimScreenError, { code: 'load_error' }>['what'];

const loadErrorWhatSchema = z.object({ what: z.enum(['this settlement', 'your claim']) });

/**
 * For an error from the claim screen's 503 load_error ("We couldn't load
 * {what}"): the server's `what`, or null when it names neither. Undefined
 * for any other error.
 */
export function claimLoadErrorWhat(error: unknown): LoadErrorWhat | null | undefined {
  if (!(error instanceof ApiRequestError) || error.status !== 503 || error.code !== 'load_error') return undefined;
  const parsed = loadErrorWhatSchema.safeParse(error.body);
  return parsed.success ? parsed.data.what : null;
}

/** "." and ".." would leave /api/mobile/claim/ once the URL is resolved. */
function requestableSlug(slug: string): boolean {
  return slug.length > 0 && slug !== '.' && slug !== '..';
}

export async function fetchClaimScreen(slug: string, signal?: AbortSignal): Promise<ClaimScreenResult> {
  if (!requestableSlug(slug)) return { kind: 'not_found' };
  const result = await getApi().request(`/api/mobile/claim/${encodeURIComponent(slug)}`, {
    parse: parseClaimScreenResponse,
    signal,
  });
  if (result.ok) return result.data;
  if (result.status === 404 && result.code === 'not_found') return { kind: 'not_found' };
  if (result.status === 401 && result.code === 'logged_out') return { kind: 'signed_out', loggedOut: result.loggedOut };
  throw new ApiRequestError(result);
}

/**
 * The claim screen (key ['claim', slug], always stale, so every focus and
 * foreground loads it again). Loads again for the new session when someone
 * logs in on top of it.
 */
export function useClaimScreen(slug: string) {
  const { status, user } = useAuth();
  const query = useQuery({
    queryKey: dataKeys.claim(slug),
    queryFn: ({ signal }) => fetchClaimScreen(slug, signal),
    staleTime: 0,
    enabled: status !== 'loading',
  });
  const { refetch } = query;
  const userId = user?.id ?? null;
  const shownFor = useRef(userId);
  useEffect(() => {
    if (shownFor.current === userId) return;
    shownFor.current = userId;
    if (userId) void refetch();
  }, [userId, refetch]);
  return query;
}

/** A claim write's answer. `changed` is false when the server had nothing to change (a repeated tap). */
export interface ClaimWriteResult {
  claim: ClaimView;
  changed: boolean;
}

/**
 * Puts the server's claim into every cached claim screen for its settlement.
 * A reload of that screen that is still running may have read the claim
 * before the write saved it. It is cancelled first (React Query keeps the
 * screen it had), so its later answer cannot replace the write's claim.
 */
async function showClaim(client: QueryClient, claim: ClaimView): Promise<void> {
  const forSettlement = (query: Query) => {
    const current = query.state.data as ClaimScreenResult | undefined;
    return current?.kind === 'flow' && current.settlement.id === claim.lawsuit_id;
  };
  await client.cancelQueries({ queryKey: dataKeys.claims, predicate: forSettlement });
  client.setQueriesData<ClaimScreenResult>({ queryKey: dataKeys.claims, predicate: forSettlement }, (current) =>
    current?.kind === 'flow' ? { ...current, claim } : current,
  );
}

export interface StartTrackingInput {
  /** The settlement's id (a UUID). */
  lawsuitId: string;
  /** 'track' saves it before filing (open settlements only); 'report_filed' starts it to report filing. */
  intent?: StartIntent;
}

/**
 * POST /api/claims: starts tracking a settlement, or returns the claim the
 * user already has. Checked on the device first (parseStartTracking).
 */
export function useStartTracking() {
  const client = useQueryClient();
  return useMutation<ClaimWriteResult, ApiRequestError, StartTrackingInput>({
    mutationFn: async ({ lawsuitId, intent = 'track' }) => {
      const checked = parseStartTracking({ lawsuit_id: lawsuitId, intent });
      if (!checked.ok) throw invalidInput(checked.message);
      const data = unwrap(
        await getApi().request('/api/claims', {
          method: 'POST',
          body: { lawsuit_id: checked.value.lawsuitId, intent: checked.value.intent },
          parse: (json) => startTrackingResponseSchema.parse(json),
        }),
      );
      return { claim: data.claim, changed: data.created };
    },
    onSuccess: async ({ claim }) => {
      refreshDashboardSoon(client);
      await showClaim(client, claim);
    },
  });
}

/** A PATCH /api/claims/[id] body. Withdrawing is not in v1. */
export type ClaimPatchBody = Exclude<ClaimAction, { action: 'withdraw' }>;

export interface ClaimActionInput {
  claimId: string;
  body: ClaimPatchBody;
}

/**
 * PATCH /api/claims/{id}: report filed, add or correct the confirmation
 * number, undo a report, or answer a corrective notice. The body is checked
 * on the device first (parseClaimPatch: confirmation number and filing date
 * rules) and sent as normalized.
 */
export function useClaimAction() {
  const client = useQueryClient();
  return useMutation<ClaimWriteResult, ApiRequestError, ClaimActionInput>({
    mutationFn: async ({ claimId, body }) => {
      const checked = parseClaimPatch(body, now());
      if (!checked.ok) throw invalidInput(checked.message);
      return unwrap(
        await getApi().request(`/api/claims/${encodeURIComponent(claimId)}`, {
          method: 'PATCH',
          body: checked.value,
          parse: (json) => claimChangeResponseSchema.parse(json),
        }),
      );
    },
    onSuccess: async ({ claim }) => {
      refreshDashboardSoon(client);
      await showClaim(client, claim);
    },
  });
}

const savedClaimsSchema = z.object({ claims: z.array(claimViewSchema) });

/**
 * The claims acknowledge-fictional closed out before it failed: its 500
 * answer lists them ({error, claims, acknowledged}), and they count as
 * answered (src/components/claims/CorrectiveNoticeList.tsx). Empty for any
 * other failure.
 */
export function savedFictionalClaims(error: unknown): ClaimView[] {
  if (!(error instanceof ApiRequestError)) return [];
  const parsed = savedClaimsSchema.safeParse(error.body);
  return parsed.success ? parsed.data.claims : [];
}

/**
 * POST /api/claims/acknowledge-fictional (body {}): "Got it" for every claim
 * on a fictional settlement. Resolves with the claims it closed out; on a
 * failure, savedFictionalClaims(error) lists the ones saved before it. The
 * dashboard reloads after a failure too, since those rows count.
 */
export function useAcknowledgeFictional() {
  const client = useQueryClient();
  return useMutation<ClaimView[], ApiRequestError, void>({
    mutationFn: async () => {
      const data = unwrap(
        await getApi().request('/api/claims/acknowledge-fictional', {
          method: 'POST',
          body: {},
          parse: (json) => acknowledgeFictionalResponseSchema.parse(json),
        }),
      );
      return data.claims;
    },
    onSuccess: async (claims) => {
      await Promise.all(claims.map((claim) => showClaim(client, claim)));
    },
    onError: async (error) => {
      await Promise.all(savedFictionalClaims(error).map((claim) => showClaim(client, claim)));
    },
    onSettled: () => refreshDashboardSoon(client),
  });
}
