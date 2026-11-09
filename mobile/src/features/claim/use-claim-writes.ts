import type { ClaimView } from '@shared/lib/claims';
import { useQueryClient } from '@tanstack/react-query';

import {
  useClaimAction,
  useStartTracking,
  type ClaimActionInput,
  type ClaimWriteResult,
  type StartTrackingInput,
} from '@/data/claims';
import { dataKeys } from '@/data/keys';

/**
 * The claim writes the screen makes, through the shared mutations (which put
 * the server's claim into the cached screen). A claim screen load still on
 * its way (a refetch on focus, say) is cancelled first: it was read before
 * the write and would otherwise put the old claim back when it lands.
 */
export function useClaimWrites() {
  const client = useQueryClient();
  const start = useStartTracking();
  const action = useClaimAction();
  const settle = () => client.cancelQueries({ queryKey: dataKeys.claims });
  return {
    async startTracking(input: StartTrackingInput): Promise<ClaimWriteResult> {
      await settle();
      return start.mutateAsync(input);
    },
    async changeClaim(input: ClaimActionInput): Promise<ClaimWriteResult> {
      await settle();
      return action.mutateAsync(input);
    },
  };
}

/** Called after a claim change succeeds: the new claim and what to announce. */
export type OnClaimChange = (next: ClaimView, message: string, options?: { reported?: boolean }) => void;
