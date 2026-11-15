/**
 * Pure helpers for the policy and spec editors: defaults, list edits, field
 * order and validation with the contract's own schemas (so the console says
 * exactly what the API would refuse).
 */
import type { ZodError } from 'zod';
import {
  AGENT_CHANNELS,
  FilingPolicyContentSchema,
  FilingSpecContentSchema,
  MEMBER_FIELDS,
  type AgentChannel,
  type ChannelConfig,
  type FilingPolicyContent,
  type FilingSpecContent,
  type ProofRequirement,
  type SourceReviewed,
  type SpecQuestion,
} from '@/lib/filing/v2/contract';
import { JevRuleSetSchema, type JevRule } from '@/lib/jev/types';
import type { FieldIssue } from './api';
import { MEMBER_FIELD_LABEL } from './labels';

/* Validation -------------------------------------------------------------------- */

export function zodIssues(error: ZodError, prefix: (string | number)[] = []): FieldIssue[] {
  return error.issues.map((issue) => ({ path: [...prefix, ...issue.path].join('.'), message: issue.message }));
}

/** Issues at `prefix` or below it ("questions.0" matches "questions.0.key", not "questions.01"). */
export function issuesAt(issues: readonly FieldIssue[], prefix: string): FieldIssue[] {
  return issues.filter((i) => i.path === prefix || i.path.startsWith(`${prefix}.`));
}

export type Checked<T> = { ok: true; value: T } | { ok: false; issues: FieldIssue[] };

export function checkPolicyContent(content: unknown): Checked<FilingPolicyContent> {
  const parsed = FilingPolicyContentSchema.safeParse(content);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, issues: zodIssues(parsed.error) };
}

export function checkSpecContent(content: unknown): Checked<FilingSpecContent> {
  const parsed = FilingSpecContentSchema.safeParse(content);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, issues: zodIssues(parsed.error) };
}

/* Lists ------------------------------------------------------------------------------ */

export function moveItem<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return [...list];
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function replaceItem<T>(list: readonly T[], index: number, item: T): T[] {
  return list.map((current, i) => (i === index ? item : current));
}

export function removeItem<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

/** "CA, ny tx" -> ["CA", "NY", "TX"] (deduplicated, input order); empty -> null. */
export function parseStates(text: string): string[] | null {
  const states = [...new Set(text.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean))];
  return states.length > 0 ? states : null;
}

export function parseEmails(text: string): string[] {
  return text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
}

/** Empty text as null, for nullable string fields. */
export function nullIfBlank(text: string): string | null {
  return text.trim() === '' ? null : text;
}

/* Policy defaults --------------------------------------------------------------------- */

/** The safe default: agent filing unknown, nothing enabled (members self-file). */
export function defaultPolicyContent(): FilingPolicyContent {
  return FilingPolicyContentSchema.parse({});
}

/** A new channel, always disabled: only an approved policy version turns one on. */
export function defaultChannelConfig(type: AgentChannel): ChannelConfig {
  switch (type) {
    case 'filing_desk':
      return {
        type,
        enabled: false,
        daily_capacity: 10,
        sla_business_days: 2,
        min_days_before_deadline: 5,
        accepts_documents: true,
        instructions: null,
      };
    case 'administrator_email':
      return {
        type,
        enabled: false,
        to: '',
        cc: [],
        published_at_url: '',
        subject_prefix: null,
        attach_documents: true,
        max_total_attachment_bytes: 20 * 1024 * 1024,
        min_days_before_deadline: 5,
      };
    case 'administrator_bulk':
      return {
        type,
        enabled: false,
        columns: [{ header: 'Claim ID', source: { claim: 'claim_id' } }],
        file_name_prefix: 'claimmatch',
        max_rows: 500,
        min_days_before_deadline: 7,
      };
    case 'administrator_api':
      return { type, enabled: false, adapter: '', min_days_before_deadline: 3 };
  }
}

export function missingChannels(channels: readonly ChannelConfig[]): AgentChannel[] {
  const present = new Set(channels.map((c) => c.type));
  return AGENT_CHANNELS.filter((c) => !present.has(c));
}

export function emptySource(today: string): SourceReviewed {
  return { kind: 'claim_form', title: '', url: null, document_ref: null, reviewed_on: today, notes: null };
}

/* Spec defaults ----------------------------------------------------------------------- */

/**
 * A blank spec for a settlement with none yet. Official labels start empty on
 * purpose: they must be the form's own wording, typed from the official form.
 */
export function blankSpecContent(input: { officialUrl?: string | null; deadline?: string | null }): FilingSpecContent {
  return {
    official_form: { url: input.officialUrl ?? '', title: null, challenges: [] },
    class_definition: { text: '', source_url: '' },
    attestation: { text: '', source_url: null },
    requires_agent_certification: false,
    deadline: input.deadline ? { date: input.deadline, time_zone: 'America/New_York', type: 'submit_online_by' } : null,
    member_fields: [{ field: 'legal_name', official_label: '', required: true }],
    questions: [],
    benefit_tiers: [],
    payout_options: [],
    form_field_order: [],
    jev_rules: [],
    desk_notes: null,
  };
}

export function newQuestion(existing: readonly SpecQuestion[]): SpecQuestion {
  let n = existing.length + 1;
  const keys = new Set(existing.map((q) => q.key));
  while (keys.has(`question_${n}`)) n += 1;
  return {
    key: `question_${n}`,
    official_label: '',
    help: null,
    type: 'text',
    required: true,
    options: null,
    validation: null,
    visible_when: null,
    tiers: null,
    health_flag: false,
  };
}

export function newProof(existing: readonly ProofRequirement[]): ProofRequirement {
  return {
    kind: `proof_${existing.length + 1}`,
    official_label: '',
    help: null,
    required: true,
    min_files: 1,
    max_files: 3,
    accepted_mime: ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'application/pdf'],
    health_flag: false,
  };
}

export function isChoice(type: SpecQuestion['type']): boolean {
  return type === 'single_choice' || type === 'multi_choice';
}

/** Changing a question's type keeps options only for choice types (the schema requires it). */
export function withQuestionType(question: SpecQuestion, type: SpecQuestion['type']): SpecQuestion {
  if (isChoice(type)) {
    return { ...question, type, options: question.options ?? [{ value: 'option_1', official_label: '' }] };
  }
  return { ...question, type, options: null };
}

/* Field order ------------------------------------------------------------------------- */

export interface PacketPathOption {
  path: string;
  label: string;
}

/** Every packet path this spec can put on the form, with a label, in a sensible default order. */
export function specPacketPaths(spec: FilingSpecContent): PacketPathOption[] {
  const memberOrder = new Map<string, number>(MEMBER_FIELDS.map((f, i) => [f, i]));
  const members = [...spec.member_fields]
    .sort((a, b) => (memberOrder.get(a.field) ?? 0) - (memberOrder.get(b.field) ?? 0))
    .map((m) => ({ path: `member.${m.field}`, label: m.official_label || MEMBER_FIELD_LABEL[m.field] }));
  const questions = spec.questions.map((q) => ({ path: `answers.${q.key}`, label: q.official_label || q.key }));
  const tier = spec.benefit_tiers.length > 0 ? [{ path: 'benefit_tier', label: 'Benefit tier' }] : [];
  const kinds = new Map<string, string>();
  for (const t of spec.benefit_tiers) for (const p of t.proof) if (!kinds.has(p.kind)) kinds.set(p.kind, p.official_label || p.kind);
  const documents = [...kinds].map(([kind, label]) => ({ path: `documents.${kind}`, label }));
  const payout = spec.payout_options.length > 0 ? [{ path: 'payout_method', label: 'Payout method' }] : [];
  return [...members, ...questions, ...tier, ...documents, ...payout];
}

/** The order with unknown paths dropped and every missing path appended in the default order. */
export function completeFieldOrder(spec: FilingSpecContent): string[] {
  const available = specPacketPaths(spec).map((p) => p.path);
  const known = new Set(available);
  const kept = spec.form_field_order.filter((p) => known.has(p));
  const keptSet = new Set(kept);
  return [...kept, ...available.filter((p) => !keptSet.has(p))];
}

/* Jev rules JSON ---------------------------------------------------------------------------- */

export type RulesParse = { ok: true; rules: JevRule[] } | { ok: false; issues: FieldIssue[] };

/** The Jev rules editor's text: JSON syntax, then the rule shape (validateJevRules runs on the server). */
export function parseJevRulesText(text: string): RulesParse {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, rules: [] };
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch (err) {
    return { ok: false, issues: [{ path: 'jev_rules', message: `Not valid JSON: ${(err as Error).message}` }] };
  }
  const parsed = JevRuleSetSchema.safeParse(value);
  return parsed.success ? { ok: true, rules: parsed.data } : { ok: false, issues: zodIssues(parsed.error, ['jev_rules']) };
}

export function rulesToText(rules: readonly JevRule[]): string {
  return rules.length === 0 ? '[]' : JSON.stringify(rules, null, 2);
}

/** Today's date (YYYY-MM-DD) in US Eastern, for "reviewed on" defaults. */
export function todayEastern(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}
