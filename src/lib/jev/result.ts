/**
 * Turning collected issues into a JevResult: duplicates dropped, a
 * member-safe issue added when only staff can see why a packet is blocked,
 * a stable order, counts, the outcome and the rule-set hash.
 */
import { MEMBER_FIELDS, type FilingSpecContent } from '../filing/v2/contract-spec';
import { canonicalJsonOf, sha256Hex } from './hash';
import { MEMBER } from './messages';
import {
  JEV_GLOBAL_RULE_IDS,
  type JevIssue,
  type JevOutcome,
  type JevResult,
  type JevRule,
  type JevSeverity,
} from './types';

const SEVERITY_RANK: Record<JevSeverity, number> = { block: 0, warn: 1, info: 2 };

/** Jev paths in the official form's order (documents.<kind> is doc_count.<kind>), then the rest of the spec. */
function fieldRanks(content: FilingSpecContent | null): Map<string, number> {
  const ranks = new Map<string, number>();
  (content?.form_field_order ?? []).forEach((path, i) => {
    ranks.set(path.startsWith('documents.') ? `doc_count.${path.slice(10)}` : path, i);
  });
  let next = 10_000;
  const add = (field: string) => {
    if (!ranks.has(field)) ranks.set(field, next++);
  };
  MEMBER_FIELDS.forEach((m) => add(`member.${m}`));
  (content?.questions ?? []).forEach((q) => add(`answers.${q.key}`));
  add('benefit_tier');
  add('payout_method');
  (content?.benefit_tiers ?? []).forEach((t) => (t.proof ?? []).forEach((p) => add(`doc_count.${p.kind}`)));
  return ranks;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Member issues that say the same thing once (two rules may both say the
 * claim cannot go through Lawsuit AI); staff issues are kept per rule.
 */
function dedupe(issues: JevIssue[]): JevIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = JSON.stringify([
      issue.audience === 'member' ? '' : issue.rule_id,
      issue.source,
      issue.severity,
      issue.code,
      issue.field,
      issue.audience,
      issue.message,
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Ordered: block, warn, info; then the field's place in the official form (general issues first); then rule id. */
export function orderIssues(issues: JevIssue[], content: FilingSpecContent | null): JevIssue[] {
  const ranks = fieldRanks(content);
  const rank = (field: string | null) => (field === null ? -1 : (ranks.get(field) ?? 1_000_000));
  return [...issues].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      rank(a.field) - rank(b.field) ||
      compareText(a.field ?? '', b.field ?? '') ||
      compareText(a.rule_id, b.rule_id) ||
      compareText(a.code, b.code) ||
      compareText(a.audience, b.audience) ||
      compareText(a.message, b.message),
  );
}

/**
 * When a staff-audience issue blocks and no member issue explains it, the
 * member gets one plain, member-safe line, so a blocked claim never looks
 * blocked for no reason once staff issues are stripped.
 */
function withMemberExplanation(issues: JevIssue[]): JevIssue[] {
  const staffBlocks = issues.filter((i) => i.audience === 'staff' && i.severity === 'block');
  if (staffBlocks.length === 0 || issues.some((i) => i.audience === 'member' && i.severity === 'block')) return issues;
  const first = staffBlocks[0];
  return [
    ...issues,
    { rule_id: first.rule_id, source: first.source, severity: 'block', code: 'staff_check_required', message: MEMBER.staffCheck, field: null, audience: 'member' },
  ];
}

export function countIssues(issues: readonly JevIssue[]): JevResult['counts'] {
  const counts = { block: 0, warn: 0, info: 0 };
  for (const issue of issues) counts[issue.severity] += 1;
  return counts;
}

export function outcomeOf(issues: readonly JevIssue[]): JevOutcome {
  if (issues.some((i) => i.severity === 'block')) return 'block';
  if (issues.some((i) => i.severity === 'warn')) return 'warn';
  return 'pass';
}

export function finalizeIssues(issues: JevIssue[], content: FilingSpecContent | null): JevIssue[] {
  return orderIssues(withMemberExplanation(dedupe(issues)), content);
}

/** SHA-256 of the canonical JSON of what was evaluated: engine version, global rule ids, the spec's rules. */
export function ruleSetHash(engineVersion: string, settlementRules: readonly JevRule[]): string {
  return sha256Hex(
    canonicalJsonOf({ engine_version: engineVersion, global_rules: JEV_GLOBAL_RULE_IDS, settlement_rules: settlementRules }),
  );
}
