/** One public "why this matches you" line. Never health or medication text. */
export function MatchReasonLine({ reason }: { reason: string }) {
  return (
    <p className="mt-2 text-sm leading-relaxed text-ink-muted">
      <span className="font-semibold text-ink">Why this matches you: </span>
      {reason}
    </p>
  );
}
