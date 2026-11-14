/**
 * A signed packet as the official form reads it: every field with the
 * official label and the exact text to enter, in the spec's form_field_order
 * (then the rest). Shared by the desk screen, the administrator email and the
 * bulk CSV, so all three show the same values. Pure.
 */
import { MEMBER_FIELDS, type FilingSpecContent, type MemberField } from '../v2/contract-spec';
import type { AnswerValue, CanonicalPacket } from '../v2/contract';

export interface PacketField {
  path: string;
  label: string;
  /** Exactly what to type or paste. Empty when the member left an optional field blank. */
  text: string;
  required: boolean;
}

const DEFAULT_MEMBER_LABELS: Record<MemberField, string> = {
  legal_name: 'Full legal name',
  first_name: 'First name',
  last_name: 'Last name',
  email: 'Email address',
  phone: 'Phone number',
  'address.line1': 'Street address',
  'address.line2': 'Address line 2',
  'address.city': 'City',
  'address.state': 'State',
  'address.zip': 'ZIP code',
};

export const BENEFIT_TIER_LABEL = 'Benefit option';
export const PAYOUT_METHOD_LABEL = 'Payment method';

function memberValue(packet: CanonicalPacket, field: MemberField): string {
  const m = packet.member;
  switch (field) {
    case 'address.line1':
      return m.address.line1;
    case 'address.line2':
      return m.address.line2 ?? '';
    case 'address.city':
      return m.address.city;
    case 'address.state':
      return m.address.state;
    case 'address.zip':
      return m.address.zip;
    default:
      return (m[field] as string | null) ?? '';
  }
}

/** One answer as text, the way the official form shows it (choice labels, Yes/No). */
export function answerText(spec: FilingSpecContent, key: string, value: AnswerValue | undefined): string {
  if (value === null || value === undefined) return '';
  const question = spec.questions.find((q) => q.key === key);
  const label = (v: string) => question?.options?.find((o) => o.value === v)?.official_label ?? v;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map((v) => label(String(v))).join('; ');
  if (typeof value === 'number') return String(value);
  if (question?.type === 'single_choice') return label(value);
  return value;
}

export function benefitTierText(spec: FilingSpecContent, tier: string | null): string {
  if (!tier) return '';
  return spec.benefit_tiers.find((t) => t.key === tier)?.official_label ?? tier;
}

export function payoutMethodText(spec: FilingSpecContent, method: string | null): string {
  if (!method) return '';
  return spec.payout_options.find((o) => o.value === method)?.official_label ?? method;
}

/** The label of a proof kind, as the official form names it. */
export function documentLabel(spec: FilingSpecContent, kind: string): string {
  for (const tier of spec.benefit_tiers) {
    const proof = tier.proof.find((p) => p.kind === kind);
    if (proof) return proof.official_label;
  }
  return kind.replace(/_/g, ' ');
}

/** The text a packet path holds, or null when the path is not a field (documents.*) or unknown. */
export function packetPathText(packet: CanonicalPacket, spec: FilingSpecContent, path: string): string | null {
  if (path.startsWith('member.')) {
    const field = path.slice('member.'.length) as MemberField;
    return (MEMBER_FIELDS as readonly string[]).includes(field) ? memberValue(packet, field) : null;
  }
  if (path.startsWith('answers.')) {
    const key = path.slice('answers.'.length);
    return answerText(spec, key, packet.answers[key]);
  }
  if (path === 'benefit_tier') return benefitTierText(spec, packet.benefit_tier);
  if (path === 'payout_method') return payoutMethodText(spec, packet.payout_method);
  return null;
}

function fieldFor(packet: CanonicalPacket, spec: FilingSpecContent, path: string): PacketField | null {
  const text = packetPathText(packet, spec, path);
  if (text === null) return null;
  if (path.startsWith('member.')) {
    const field = path.slice('member.'.length) as MemberField;
    const specField = spec.member_fields.find((m) => m.field === field);
    return { path, label: specField?.official_label ?? DEFAULT_MEMBER_LABELS[field], text, required: specField?.required ?? false };
  }
  if (path.startsWith('answers.')) {
    const question = spec.questions.find((q) => q.key === path.slice('answers.'.length));
    if (!question) return null;
    return { path, label: question.official_label, text, required: question.required };
  }
  if (path === 'benefit_tier') return { path, label: BENEFIT_TIER_LABEL, text, required: spec.benefit_tiers.length > 0 };
  return { path, label: PAYOUT_METHOD_LABEL, text, required: spec.payout_options.length > 0 };
}

/**
 * Every field of the signed packet: first the spec's form_field_order (kept
 * even when blank, so staff walk the form in order), then any other field
 * that holds a value. documents.* paths are listed separately by callers.
 */
export function orderedPacketFields(packet: CanonicalPacket, spec: FilingSpecContent): PacketField[] {
  const out: PacketField[] = [];
  const seen = new Set<string>();
  for (const path of spec.form_field_order) {
    if (path.startsWith('documents.') || seen.has(path)) continue;
    const field = fieldFor(packet, spec, path);
    if (!field) continue;
    out.push(field);
    seen.add(path);
  }
  const rest = [
    ...MEMBER_FIELDS.map((f) => `member.${f}`),
    ...spec.questions.map((q) => `answers.${q.key}`),
    'benefit_tier',
    'payout_method',
  ];
  for (const path of rest) {
    if (seen.has(path)) continue;
    const field = fieldFor(packet, spec, path);
    if (!field || field.text === '') continue;
    out.push(field);
    seen.add(path);
  }
  return out;
}
