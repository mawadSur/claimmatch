/**
 * Per-settlement Jev rules: the approved spec's jev_rules, drafted by staff
 * and approved by a legal_reviewer. A rule applies when its `when` holds (or
 * always, without one) and fails when its `check` does not hold; it then
 * reports its own message at its severity (code settlement_rule).
 *
 * While filling (partial) a rule whose fields are all still empty is skipped,
 * and a failing rule with some fields still empty is only `info` (it may pass
 * once the member finishes). meta.* fields never count as empty. A rule that
 * cannot run (too deep, too large, an unsafe pattern) is skipped with a
 * staff-audience warning: validateJevRules keeps such rules out of approved
 * specs, so this only guards against data that got past it.
 */
import { conditionFields, conditionProblem, evaluateCondition, isEmptyValue } from './conditions';
import { makeIssue, type JevContext } from './context';
import { STAFF } from './messages';
import { JEV_MODES, type JevRule } from './types';

export function runSpecRules(ctx: JevContext): void {
  const rules: readonly JevRule[] = ctx.content?.jev_rules ?? [];
  for (const rule of rules) {
    const modes = rule.modes ?? JEV_MODES;
    if (!modes.includes(ctx.mode)) continue;
    const audience = rule.audience ?? 'member';
    const field = rule.field ?? null;
    const problem = conditionProblem([rule.when, rule.check]);
    if (problem) {
      ctx.add(makeIssue(rule.id, 'warn', 'rule_invalid', field, STAFF.ruleInvalid(problem), 'staff', 'settlement'));
      continue;
    }
    const fields = [...new Set([...conditionFields(rule.when), ...conditionFields(rule.check)])].filter(
      (f) => !f.startsWith('meta.'),
    );
    const empty = fields.filter((f) => isEmptyValue(f, ctx.read(f)));
    if (ctx.partial && fields.length > 0 && empty.length === fields.length) continue;
    if (rule.when && !evaluateCondition(rule.when, ctx.read)) continue;
    if (evaluateCondition(rule.check, ctx.read)) continue;
    const severity = ctx.partial && empty.length > 0 ? 'info' : rule.severity;
    ctx.add(makeIssue(rule.id, severity, 'settlement_rule', field, rule.message, audience, 'settlement'));
  }
}
