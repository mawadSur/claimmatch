/**
 * One public "why this matches you" line from matcher reasons.
 * Health and medication answers never appear. Generic filler is skipped
 * when a more specific reason exists.
 */

const HEALTH_RE = /medic(?:ation|ine)?|health|prescription|medical|took[_\s-]?medication/i;

const GENERIC_RE =
  /^(Open nationwide|You may qualify|May relate to your profile|Related to )/i;

export function isHealthMatchReason(reason: string): boolean {
  return HEALTH_RE.test(reason);
}

/** Reasons safe to show: non-empty, no health/medication wording. */
export function publicMatchReasons(reasons: readonly string[]): string[] {
  return reasons
    .map((reason) => reason.trim())
    .filter((reason) => reason.length > 0 && !isHealthMatchReason(reason));
}

function formatMatchReason(reason: string): string {
  const state = /^Available in your state \(([^)]+)\)$/.exec(reason);
  if (state) return `You said you live in ${state[1]}`;

  const lived = /^Lived in ([^,]+)/.exec(reason);
  if (lived) return `You said you lived in ${lived[1]}`;

  if (/^Bought /.test(reason) || /^Worked /.test(reason) || /^Used /.test(reason)) {
    return `You said you ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`;
  }

  return reason;
}

/**
 * One plain line quoting the rule and the user's answer.
 * Null when nothing public remains.
 */
export function matchReasonLine(reasons: readonly string[]): string | null {
  const visible = publicMatchReasons(reasons);
  if (visible.length === 0) return null;
  const specific = visible.filter((reason) => !GENERIC_RE.test(reason));
  const picked = specific[0] ?? visible[0];
  return formatMatchReason(picked);
}
