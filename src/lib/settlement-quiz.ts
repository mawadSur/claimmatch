import { eligibilitySummary } from '@/lib/claim-input';

const MAX_PROMPTS = 5;

/**
 * Checklist prompts taken only from stored eligibility text.
 * Placeholders and empty listings produce no quiz.
 */
export function eligibilityQuizPrompts(text: string | null | undefined): string[] {
  const summary = eligibilitySummary(text);
  if (!summary) return [];
  const parts = summary
    .split(/(?<=[.!?])\s+|\n+|;\s+|•\s+|\u2022\s+/)
    .map((s) => s.replace(/^[-*]\s+/, '').trim())
    .filter((s) => s.length >= 12);
  const unique = [...new Set(parts)];
  return unique.slice(0, MAX_PROMPTS);
}

export function eligibilityQuizResultCopy(input: { yes: number; no: number; total: number }): string {
  if (input.total < 1) {
    return 'Read the official notice to see whether this settlement describes you. This checklist is not a qualification decision.';
  }
  if (input.yes > 0 && input.yes >= input.no) {
    return 'These listing notes may describe you. Read the official notice to confirm. This checklist is not a qualification decision.';
  }
  return 'These listing notes may not describe you. The official notice has the rules. This checklist is not a qualification decision.';
}
