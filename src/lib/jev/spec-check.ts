/**
 * Jev's checks on a whole filing spec, for the console and the staff API to
 * run (after FilingSpecContentSchema) before a draft is saved or approved:
 * the spec's own Jev rules (validateJevRules, with this spec as the context),
 * every question's visible_when (checked like a rule condition, and never on
 * its own answer), every validation.pattern (a safe pattern, ./pattern.ts)
 * and validation bounds that cannot all hold. Paths are inside the spec
 * content, e.g. "questions.3.validation.pattern" or "jev_rules.1.check.all.0.field".
 */
import type { FilingSpecContent } from '../filing/v2/contract-spec';
import { conditionFields } from './conditions';
import { checkPattern } from './pattern';
import type { JevRuleContext } from './types';
import { conditionErrors, validateRules } from './validate';

export interface SpecProblem {
  path: string;
  message: string;
}

/** The names a spec's Jev rules may refer to: its question keys, proof kinds, tiers and payout options. */
export function ruleContextOf(content: FilingSpecContent): JevRuleContext {
  const tiers = content.benefit_tiers ?? [];
  return {
    questionKeys: (content.questions ?? []).map((q) => q.key),
    documentKinds: [...new Set(tiers.flatMap((t) => (t.proof ?? []).map((p) => p.kind)))],
    benefitTiers: tiers.map((t) => t.key),
    payoutOptions: (content.payout_options ?? []).map((o) => o.value),
  };
}

/** Every Jev problem in a spec; an empty list means Jev can run it as written. */
export function jevSpecProblems(content: FilingSpecContent): SpecProblem[] {
  const context = ruleContextOf(content);
  const problems: SpecProblem[] = [];
  (content.questions ?? []).forEach((q, i) => {
    const base = `questions.${i}`;
    const v = q.validation;
    if (v?.pattern !== undefined) {
      const check = checkPattern(v.pattern);
      if (!check.ok) problems.push({ path: `${base}.validation.pattern`, message: check.message });
    }
    if (v?.min !== undefined && v.max !== undefined && v.min > v.max) {
      problems.push({ path: `${base}.validation.min`, message: 'min must not be larger than max' });
    }
    if (v?.min_length !== undefined && v.max_length !== undefined && v.min_length > v.max_length) {
      problems.push({ path: `${base}.validation.min_length`, message: 'min_length must not be larger than max_length' });
    }
    if (q.visible_when) {
      const errors = conditionErrors(q.visible_when, `${base}.visible_when`, context);
      problems.push(...errors);
      if (errors.length === 0 && conditionFields(q.visible_when).includes(`answers.${q.key}`)) {
        problems.push({ path: `${base}.visible_when`, message: 'A question cannot depend on its own answer' });
      }
    }
  });
  const rules = validateRules(content.jev_rules ?? [], context);
  if (!rules.ok) {
    for (const e of rules.errors) {
      const path = e.index < 0 ? 'jev_rules' : ['jev_rules', String(e.index), e.path].filter(Boolean).join('.');
      problems.push({ path, message: e.message });
    }
  }
  return problems;
}
