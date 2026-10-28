import { MATCH_MODEL_VERSION, sanitizeMatchedSignals } from '@/lib/match-features';
import type { MatchEventType } from '@/lib/types';

// Client-safe helpers (no server-only imports), so client components can use them.
/** PostHog event names for the key match interactions. */
export function posthogMatchEventName(type: MatchEventType): string {
  switch (type) {
    case 'impression':
      return 'match_impression';
    case 'view':
      return 'match_viewed';
    case 'save':
      return 'match_saved';
    case 'dismiss':
      return 'match_dismissed';
    case 'open_form':
      return 'official_form_opened';
    case 'filed':
      return 'match_filed';
    case 'user_reported_payout':
      return 'match_payout_reported';
    default:
      return `match_${type}`;
  }
}

export function posthogMatchProperties(input: {
  lawsuitId: string;
  score?: number | null;
  rank?: number | null;
  matchedSignals?: string[];
  modelVersion?: string;
}): Record<string, unknown> {
  return {
    lawsuit_id: input.lawsuitId,
    score: input.score ?? null,
    rank: input.rank ?? null,
    matched_signals: sanitizeMatchedSignals(input.matchedSignals ?? []),
    model_version: input.modelVersion || MATCH_MODEL_VERSION,
  };
}
