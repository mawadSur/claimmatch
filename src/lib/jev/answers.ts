/**
 * global.answer_types: one answer against its spec question (type, options
 * and validation). Answer shapes as the packet stores them (contract.ts):
 * text-like types are strings (date YYYY-MM-DD, money "12.34"), integer and
 * decimal are numbers, yes_no a boolean, multi_choice a list of option values.
 * validation.min / max bound the number for integer, decimal and money and
 * the count of choices for multi_choice; min_length / max_length count
 * characters of string answers; pattern is a safe pattern (./pattern.ts).
 */
import type { SpecQuestion } from '../filing/v2/contract-spec';
import type { JevValue } from './conditions';
import { makeIssue, type JevContext } from './context';
import {
  isEmailAddress,
  isIsoDate,
  isMoneyAmount,
  isUsPhone,
  isUsStateCode,
  isZipCode,
  vinProblem,
} from './formats';
import { MEMBER, STAFF } from './messages';
import { checkPattern, testPattern } from './pattern';
import type { JevSeverity } from './types';

export function checkAnswer(ctx: JevContext, ruleId: string, q: SpecQuestion, value: JevValue): void {
  const field = `answers.${q.key}`;
  const flag = (severity: JevSeverity, code: string, message: string) => {
    ctx.add(makeIssue(ruleId, severity, code, field, message));
  };
  const rules = q.validation ?? null;
  const options = new Set((q.options ?? []).map((o) => o.value));
  const range = (n: number) => {
    const below = rules?.min !== undefined && n < rules.min;
    const above = rules?.max !== undefined && n > rules.max;
    if (below || above) flag('block', 'out_of_range', MEMBER.range(rules?.min, rules?.max));
  };
  const trimmed = typeof value === 'string' ? value.trim() : '';

  switch (q.type) {
    case 'text':
    case 'long_text':
    case 'notice_id':
      if (typeof value !== 'string') return flag('block', 'invalid_type', MEMBER.wrongType);
      break;
    case 'email':
      if (typeof value !== 'string' || !isEmailAddress(trimmed)) return flag('block', 'invalid_email', MEMBER.emailInvalid);
      break;
    case 'phone':
      if (typeof value !== 'string' || !isUsPhone(trimmed)) return flag('block', 'invalid_phone', MEMBER.phoneInvalid);
      break;
    case 'date':
      if (typeof value !== 'string' || !isIsoDate(trimmed)) return flag('block', 'invalid_date', MEMBER.dateInvalid);
      if (ctx.dates.today && trimmed > ctx.dates.today) flag('warn', 'date_in_future', MEMBER.dateInFuture);
      break;
    case 'integer':
      if (typeof value !== 'number' || !Number.isSafeInteger(value)) return flag('block', 'not_whole_number', MEMBER.wholeNumber);
      return range(value);
    case 'decimal':
      if (typeof value !== 'number' || !Number.isFinite(value)) return flag('block', 'invalid_number', MEMBER.number);
      return range(value);
    case 'money':
      if (typeof value !== 'string' || !isMoneyAmount(trimmed)) return flag('block', 'invalid_money', MEMBER.money);
      return range(Number(trimmed));
    case 'yes_no':
      if (typeof value !== 'boolean') flag('block', 'invalid_type', MEMBER.yesNo);
      return;
    case 'single_choice':
      if (typeof value !== 'string' || !options.has(value)) flag('block', 'invalid_option', MEMBER.choice);
      return;
    case 'multi_choice': {
      const list: readonly unknown[] = Array.isArray(value) ? value : [];
      const valid =
        Array.isArray(value) &&
        list.every((item) => typeof item === 'string' && options.has(item)) &&
        new Set(list).size === list.length;
      if (!valid) return flag('block', 'invalid_option', MEMBER.choices);
      if (rules?.min !== undefined && list.length < rules.min) flag('block', 'too_few_choices', MEMBER.tooFewChoices(rules.min));
      if (rules?.max !== undefined && list.length > rules.max) flag('block', 'too_many_choices', MEMBER.tooManyChoices(rules.max));
      return;
    }
    case 'us_state':
      if (typeof value !== 'string' || !isUsStateCode(trimmed)) return flag('block', 'invalid_state', MEMBER.stateInvalid);
      break;
    case 'zip':
      if (typeof value !== 'string' || !isZipCode(trimmed)) return flag('block', 'invalid_zip', MEMBER.zipInvalid);
      break;
    case 'vin': {
      const problem = typeof value === 'string' ? vinProblem(trimmed) : 'format';
      if (problem === 'format') return flag('block', 'invalid_vin', MEMBER.vinFormat);
      if (problem === 'check_digit') return flag('block', 'vin_check_digit', MEMBER.vinCheckDigit);
      break;
    }
    default:
      return flag('block', 'invalid_type', MEMBER.wrongType);
  }

  if (typeof value !== 'string') return;
  const length = Array.from(value).length;
  if (rules?.min_length !== undefined && length < rules.min_length) flag('block', 'too_short', MEMBER.tooShort(rules.min_length));
  if (rules?.max_length !== undefined && length > rules.max_length) flag('block', 'too_long', MEMBER.tooLong(rules.max_length));
  if (rules?.pattern) {
    const matched = testPattern(rules.pattern, value);
    if (matched === null) {
      const check = checkPattern(rules.pattern);
      const why = check.ok ? 'it cannot run' : check.message;
      ctx.add(makeIssue(ruleId, 'warn', 'spec_pattern_invalid', field, STAFF.patternInvalid(q.key, why), 'staff'));
    } else if (!matched) {
      flag('block', 'pattern_mismatch', rules.pattern_hint?.trim() || MEMBER.patternMismatch);
    }
  }
}
