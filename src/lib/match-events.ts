import { flags } from '@/lib/flags';
import { createServiceClient } from '@/lib/supabase/server';
import {
  MATCH_MODEL_VERSION,
  buildMatchFeatures,
  sanitizeMatchedSignals,
  type MatchFeatureInput,
} from '@/lib/match-features';
import type { Lawsuit, MatchEventType, MatchLabelKind, Profile } from '@/lib/types';

export const MATCH_EVENT_TYPES: readonly MatchEventType[] = [
  'impression',
  'view',
  'save',
  'dismiss',
  'open_form',
  'filed',
  'user_reported_payout',
];

export const MATCH_LABELS: readonly MatchLabelKind[] = ['not_relevant', 'filed', 'paid'];

export function isMatchEventType(value: unknown): value is MatchEventType {
  return typeof value === 'string' && (MATCH_EVENT_TYPES as readonly string[]).includes(value);
}

export function isMatchLabelKind(value: unknown): value is MatchLabelKind {
  return typeof value === 'string' && (MATCH_LABELS as readonly string[]).includes(value);
}

export interface RecordMatchEventInput {
  userId: string;
  lawsuitId: string;
  eventType: MatchEventType;
  score?: number | null;
  rank?: number | null;
  matchedSignals?: string[];
  matchId?: string | null;
  payoutAmount?: number | null;
  profile?: Pick<Profile, 'state' | 'attributes'> | null;
  lawsuit?: Pick<
    Lawsuit,
    'eligibility' | 'category' | 'deadline' | 'proof_required' | 'proof_verified' | 'payout_min' | 'payout_max'
  > | null;
  modelVersion?: string;
  consented?: boolean;
}

export async function recordMatchEvent(
  input: RecordMatchEventInput,
): Promise<{ eventId: string | null }> {
  if (!flags.matchMetrics()) return { eventId: null };
  if (input.consented === false) return { eventId: null };

  try {
    const svc = createServiceClient();
    const modelVersion = input.modelVersion || MATCH_MODEL_VERSION;
    const { data, error } = await svc
      .from('match_events')
      .insert({
        user_id: input.userId,
        lawsuit_id: input.lawsuitId,
        match_id: input.matchId ?? null,
        event_type: input.eventType,
        score: input.score ?? null,
        rank: input.rank ?? null,
        matched_signals: sanitizeMatchedSignals(input.matchedSignals ?? []),
        model_version: modelVersion,
        payout_amount: input.payoutAmount ?? null,
      })
      .select('id')
      .single();
    if (error || !data) {
      console.error('[match-events] insert failed', { code: error?.code });
      return { eventId: null };
    }

    if (input.profile && input.lawsuit) {
      const features: MatchFeatureInput = buildMatchFeatures(input.profile, input.lawsuit, new Date(), modelVersion);
      const { error: snapError } = await svc.from('match_feature_snapshots').insert({
        user_id: input.userId,
        lawsuit_id: input.lawsuitId,
        match_event_id: data.id,
        attribute_overlap: features.attribute_overlap,
        state: features.state,
        category: features.category,
        deadline_days: features.deadline_days,
        proof_required: features.proof_required,
        payout_size: features.payout_size,
        model_version: features.model_version,
      });
      if (snapError) console.error('[match-events] snapshot failed', { code: snapError.code });
    }

    return { eventId: data.id as string };
  } catch (err) {
    console.error('[match-events] record failed', err);
    return { eventId: null };
  }
}

export async function upsertMatchLabel(input: {
  userId: string;
  lawsuitId: string;
  label: MatchLabelKind;
  payoutAmount?: number | null;
  notes?: string | null;
}): Promise<boolean> {
  if (!flags.matchMetrics()) return false;
  try {
    const svc = createServiceClient();
    const { error } = await svc.from('match_labels').upsert(
      {
        user_id: input.userId,
        lawsuit_id: input.lawsuitId,
        label: input.label,
        payout_amount: input.payoutAmount ?? null,
        notes: input.notes ?? null,
      },
      { onConflict: 'user_id,lawsuit_id' },
    );
    if (error) {
      console.error('[match-events] label failed', { code: error.code });
      return false;
    }
    return true;
  } catch (err) {
    console.error('[match-events] label failed', err);
    return false;
  }
}

export { posthogMatchEventName, posthogMatchProperties } from '@/lib/match-events-shared';
