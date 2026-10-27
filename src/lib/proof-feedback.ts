export const PROOF_FEEDBACK_ANSWERS = ['yes', 'no', 'not_sure'] as const;

export type ProofFeedbackAnswer = (typeof PROOF_FEEDBACK_ANSWERS)[number];

export const PROOF_FEEDBACK_PROMPT = 'Did the official site ask for proof?';

export interface ProofFeedbackCounts {
  yes: number;
  no: number;
  not_sure: number;
  total: number;
}

export function isProofFeedbackAnswer(value: unknown): value is ProofFeedbackAnswer {
  return typeof value === 'string' && (PROOF_FEEDBACK_ANSWERS as readonly string[]).includes(value);
}

export function emptyProofFeedbackCounts(): ProofFeedbackCounts {
  return { yes: 0, no: 0, not_sure: 0, total: 0 };
}

export function tallyProofFeedback(
  rows: readonly { lawsuit_id: string; answer: string }[],
): Map<string, ProofFeedbackCounts> {
  const byLawsuit = new Map<string, ProofFeedbackCounts>();
  for (const row of rows) {
    if (!isProofFeedbackAnswer(row.answer)) continue;
    const current = byLawsuit.get(row.lawsuit_id) ?? emptyProofFeedbackCounts();
    current[row.answer] += 1;
    current.total += 1;
    byLawsuit.set(row.lawsuit_id, current);
  }
  return byLawsuit;
}

export function formatProofFeedbackCounts(counts: ProofFeedbackCounts): string {
  if (counts.total === 0) return 'No proof-feedback answers yet';
  return `Proof feedback (unverified crowd signal): yes ${counts.yes} · no ${counts.no} · not sure ${counts.not_sure}`;
}
