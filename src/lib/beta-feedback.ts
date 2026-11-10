/**
 * In-app beta feedback + interview opt-in. Free text stays in Supabase;
 * PostHog only gets booleans / enums. Never sends email.
 */
import { flags } from '@/lib/flags';
import type { BetaFeedbackTrigger } from '@/lib/analytics/events';
import { BETA_FEEDBACK_TRIGGERS } from '@/lib/analytics/events';

export const BETA_FEEDBACK_MAX_CHARS = 500;

export interface BetaFeedbackInput {
  almostStopped: string | null;
  whatsMissing: string | null;
  interviewOptIn: boolean;
  dismissed: boolean;
  trigger: BetaFeedbackTrigger | null;
}

export interface BetaFeedbackRow {
  id: string;
  user_id: string;
  almost_stopped: string | null;
  whats_missing: string | null;
  interview_opt_in: boolean;
  dismissed: boolean;
  created_at: string;
  email?: string | null;
}

export function isBetaFeedbackEnabled(): boolean {
  return flags.betaFeedback();
}

export function isBetaFeedbackTrigger(value: unknown): value is BetaFeedbackTrigger {
  return typeof value === 'string' && (BETA_FEEDBACK_TRIGGERS as readonly string[]).includes(value);
}

function clipText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, BETA_FEEDBACK_MAX_CHARS);
  return trimmed || null;
}

export type BetaFeedbackParseResult =
  | { ok: true; input: BetaFeedbackInput }
  | { ok: false; error: string };

export function parseBetaFeedbackInput(body: unknown): BetaFeedbackParseResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Invalid request body.' };
  }
  const record = body as Record<string, unknown>;
  const dismissed = record.dismissed === true;
  const interviewOptIn = record.interview_opt_in === true;
  const almostStopped = clipText(record.almost_stopped);
  const whatsMissing = clipText(record.whats_missing);
  const trigger = isBetaFeedbackTrigger(record.trigger) ? record.trigger : null;

  if (!dismissed && !interviewOptIn && !almostStopped && !whatsMissing) {
    return { ok: false, error: 'Add a short answer, opt in to a call, or dismiss.' };
  }
  return {
    ok: true,
    input: {
      almostStopped: dismissed ? null : almostStopped,
      whatsMissing: dismissed ? null : whatsMissing,
      interviewOptIn: dismissed ? false : interviewOptIn,
      dismissed,
      trigger,
    },
  };
}

export function betaFeedbackInsertRow(userId: string, input: BetaFeedbackInput) {
  return {
    user_id: userId,
    almost_stopped: input.almostStopped,
    whats_missing: input.whatsMissing,
    interview_opt_in: input.interviewOptIn,
    dismissed: input.dismissed,
    updated_at: new Date().toISOString(),
  };
}
