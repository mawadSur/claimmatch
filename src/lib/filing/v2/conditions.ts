/**
 * Evaluates the JSON conditions of a filing spec (JevCondition, src/lib/jev/types.ts)
 * for the packet's own use: which questions are asked (visible_when). Pure.
 *
 * The operators are Jev's own (src/lib/jev/conditions.ts), so the packet asks
 * exactly the questions Jev checks: an empty value never satisfies a positive
 * test and always satisfies its negation, a document count of 0 is absent
 * (and still a number for comparisons), and a list answer matches eq / in
 * when any item does. This file only reads the packet's fields.
 */
import { conditionProblem, evaluateCondition as evaluateJevCondition } from '../../jev/conditions';
import type { JevCondition } from '../../jev/types';
import type { AnswerValue, Lane, PacketDraft } from './contract';

export interface ConditionContext {
  packet: Pick<PacketDraft, 'member' | 'answers' | 'benefit_tier' | 'payout_method' | 'documents'>;
  daysToDeadline: number | null;
  lane: Lane | null;
}

type FieldValue = AnswerValue | undefined;

/** The value a Jev field path reads (member.*, answers.<key>, benefit_tier, payout_method, doc_count.<kind>, meta.*). */
export function readField(path: string, ctx: ConditionContext): FieldValue {
  const { packet } = ctx;
  if (path.startsWith('member.address.')) {
    const key = path.slice('member.address.'.length) as keyof PacketDraft['member']['address'];
    return packet.member.address[key] ?? null;
  }
  if (path.startsWith('member.')) {
    const key = path.slice('member.'.length) as Exclude<keyof PacketDraft['member'], 'address'>;
    const value = packet.member[key];
    return typeof value === 'string' || value === null ? value : undefined;
  }
  if (path.startsWith('answers.')) return packet.answers[path.slice('answers.'.length)] ?? null;
  if (path === 'benefit_tier') return packet.benefit_tier;
  if (path === 'payout_method') return packet.payout_method;
  if (path.startsWith('doc_count.')) {
    const kind = path.slice('doc_count.'.length);
    return packet.documents.filter((d) => d.kind === kind).length;
  }
  if (path === 'meta.days_to_deadline') return ctx.daysToDeadline;
  if (path === 'meta.lane') return ctx.lane;
  return undefined;
}

/** A value the member has given: not null, not blank, not an empty list. */
export function isPresent(value: FieldValue): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** True when the condition holds for this packet (Jev's evaluator). Unknown shapes are false. */
export function evaluateCondition(condition: JevCondition, ctx: ConditionContext): boolean {
  return evaluateJevCondition(condition, (field) => readField(field, ctx));
}

/**
 * visible_when for one question, as Jev reads it: a condition that cannot run
 * leaves the question asked (asking a question that may not apply is safer
 * than sending a claim without it).
 */
export function questionVisible(condition: JevCondition | null | undefined, ctx: ConditionContext): boolean {
  if (!condition || conditionProblem([condition])) return true;
  return evaluateCondition(condition, ctx);
}
