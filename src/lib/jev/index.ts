/**
 * Jev entry points. The signatures and comments of runJev, validateJevRules
 * and JEV_ENGINE_VERSION are the CONTRACT; B1 owns the bodies and the modules
 * under src/lib/jev/** (tests: tests/jev-*.test.ts).
 * Types: ./types.ts. Rule meanings: docs/designs/one-click-filing.md, section 7.
 *
 * Modules: context.ts (the facts of one run), rules-settlement-level.ts and
 * rules-packet-level.ts (the global rules), answers.ts (answer types),
 * spec-rules.ts (per-settlement rules), conditions.ts, pattern.ts (safe
 * patterns, linear-time matcher), formats.ts, dates.ts, result.ts, hash.ts
 * (pure SHA-256, so Jev also runs in the browser and the app), messages.ts,
 * validate.ts (validateJevRules) and spec-check.ts (jevSpecProblems: a whole
 * spec's rules, visible_when conditions and question patterns).
 */
import { buildContext, makeIssue, type JevContext } from './context';
import { STAFF } from './messages';
import { countIssues, finalizeIssues, outcomeOf, ruleSetHash } from './result';
import { PACKET_LEVEL_RULES } from './rules-packet-level';
import { SETTLEMENT_LEVEL_RULES } from './rules-settlement-level';
import { runSpecRules } from './spec-rules';
import type { JevInput, JevIssue, JevMode, JevResult, JevRule, JevRuleContext, JevRulesValidation } from './types';
import { validateRules } from './validate';

/** Stored in jev_runs.engine_version and folded into rule_set_hash. Bump on any rule change. */
export const JEV_ENGINE_VERSION = 'jev-1';

const GLOBAL_RULES = [...SETTLEMENT_LEVEL_RULES, ...PACKET_LEVEL_RULES];

function describe(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return text.slice(0, 200);
}

function settlementRulesOf(input: JevInput): readonly JevRule[] {
  try {
    return input.spec?.content?.jev_rules ?? [];
  } catch {
    return [];
  }
}

function resultOf(input: JevInput, mode: JevMode, collected: JevIssue[], ctx: JevContext | null): JevResult {
  const issues = finalizeIssues(collected, ctx?.content ?? null);
  return {
    engine_version: JEV_ENGINE_VERSION,
    mode,
    outcome: outcomeOf(issues),
    issues,
    counts: countIssues(issues),
    rule_set_hash: ruleSetHash(JEV_ENGINE_VERSION, settlementRulesOf(input)),
    packet_hash: input.packetHash ?? null,
    evaluated_at: input.now,
  };
}

/**
 * Checks a packet: every global rule (JEV_GLOBAL_RULE_IDS) that applies to
 * input.mode, then the spec's own rules (input.spec.content.jev_rules).
 * Pure, synchronous and deterministic: same input, same result, no I/O.
 *
 *   partial   while the member fills the packet: missing required answers are
 *             `info` (to-do hints), rules whose fields are all empty are
 *             skipped, invalid or never-collected values are still `block`.
 *   pre_sign  the full check before "File my claim": any `block` stops signing.
 *   pre_send  right before a channel sends: pre_sign plus the time-sensitive
 *             and binding rules (deadline cutoff, lane still allowed, spec not
 *             retired, live signature whose packet_hash equals input.packetHash,
 *             statement unchanged). Any `block` stops the send.
 *
 * Staff-audience issues (audience 'staff') are for the desk and console only;
 * callers strip them before anything reaches a member (toMemberResult).
 *
 * Never throws: a rule that fails to run, or input it cannot read, becomes a
 * staff-audience `block` with code engine_unavailable (the detail is in its
 * message) plus a member-safe line, so a broken check stops the claim instead
 * of letting it through; the send sweep treats that code as "try again later",
 * never as something the member must fix.
 */
export function runJev(input: JevInput): JevResult {
  let ctx: JevContext;
  try {
    ctx = buildContext(input);
  } catch (error) {
    const issue = makeIssue('jev.engine', 'block', 'engine_unavailable', null, STAFF.inputInvalid(describe(error)), 'staff');
    return resultOf(input, input.mode, [issue], null);
  }
  for (const rule of GLOBAL_RULES) {
    if (!rule.modes.includes(ctx.mode)) continue;
    try {
      rule.run(ctx, rule.id);
    } catch (error) {
      ctx.add(makeIssue(rule.id, 'block', 'engine_unavailable', null, STAFF.ruleError(rule.id, describe(error)), 'staff'));
    }
  }
  try {
    runSpecRules(ctx);
  } catch (error) {
    ctx.add(makeIssue('jev.settlement_rules', 'block', 'engine_unavailable', null, STAFF.ruleError('the settlement rules', describe(error)), 'staff', 'settlement'));
  }
  return resultOf(input, ctx.mode, ctx.issues, ctx);
}

/**
 * Validates staff-drafted per-settlement rules before a spec draft is saved
 * or approved: the JevRuleSetSchema shape, unique rule ids, depth at most 6
 * and at most 50 nodes per rule, every answers.<key> / doc_count.<kind> /
 * benefit_tier / payout_method value naming something in `context`, safe
 * `matches` patterns (at most 200 characters, compiles, no back-references,
 * no nested quantifiers), and length_between with min <= max.
 */
export function validateJevRules(rules: unknown, context: JevRuleContext): JevRulesValidation {
  return validateRules(rules, context);
}

/**
 * The member's copy of a result: staff-audience issues removed, counts and
 * outcome recomputed from what is left (what claim_packets.jev_result and
 * PacketView.jev should hold). A staff-only block always leaves a member-safe
 * block behind (staff_check_required), so a blocked packet stays blocked.
 */
export function toMemberResult(result: JevResult): JevResult {
  const issues = result.issues.filter((i) => i.audience === 'member');
  return { ...result, issues, counts: countIssues(issues), outcome: outcomeOf(issues) };
}

/**
 * Block codes the member can clear by editing, uploading, confirming or
 * signing again (a pre_send block made only of these sends the claim to
 * needs_you; anything else is a hand-back to self_file).
 */
export const JEV_MEMBER_FIXABLE_CODES: ReadonlySet<string> = new Set([
  'required_missing',
  'invalid_value',
  'invalid_type',
  'invalid_email',
  'invalid_phone',
  'invalid_state',
  'invalid_zip',
  'invalid_date',
  'invalid_number',
  'invalid_money',
  'invalid_option',
  'invalid_vin',
  'vin_check_digit',
  'not_whole_number',
  'out_of_range',
  'too_short',
  'too_long',
  'too_few_choices',
  'too_many_choices',
  'pattern_mismatch',
  'unknown_question',
  'secret_like_value',
  'answer_too_long',
  'packet_too_large',
  'not_collected',
  'health_consent_required',
  'health_consent_needed',
  'class_definition_not_confirmed',
  'class_definition_changed',
  'statement_text_changed',
  'spec_changed',
  'proof_too_few',
  'proof_too_many',
  'proof_wrong_type',
  'proof_too_large',
  'document_limit',
  'settlement_rule',
  'signature_missing',
  'signature_voided',
  'signature_hash_mismatch',
  'signature_lane_mismatch',
  'packet_hash_missing',
  'typed_name_mismatch',
  'statement_changed',
]);

/** True when the result blocks and every block (member and staff) is one the member can clear. */
export function memberCanFix(result: JevResult): boolean {
  const blocks = result.issues.filter((i) => i.severity === 'block');
  return blocks.length > 0 && blocks.every((i) => JEV_MEMBER_FIXABLE_CODES.has(i.code));
}

/** The PacketItemView.path a Jev issue field belongs to (doc_count.<kind> is documents.<kind>; meta.* has none). */
export function packetPathOfField(field: string | null): string | null {
  if (!field || field.startsWith('meta.')) return null;
  return field.startsWith('doc_count.') ? `documents.${field.slice(10)}` : field;
}

export { checkPattern, testPattern, PATTERN_MAX_LENGTH } from './pattern';
export { jevSpecProblems, ruleContextOf, type SpecProblem } from './spec-check';
