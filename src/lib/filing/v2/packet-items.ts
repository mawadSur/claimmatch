/**
 * What a filing spec asks of one packet: member fields, the questions asked
 * for the member's choices (tier and visible_when), the chosen tier's proof,
 * and whether any asked item is health data. Pure; shared by the packet
 * builder, the completeness check, the view and the update route.
 */
import { isPresent, questionVisible, type ConditionContext } from './conditions';
import type { Lane, MemberDraft, PacketDraft } from './contract';
import type {
  BenefitTier,
  FilingSpecContent,
  MemberField,
  ProofRequirement,
  SpecQuestion,
} from './contract-spec';

/** The canonical packet always carries these (CanonicalPacketSchema), whatever the spec lists. */
export const CANONICAL_REQUIRED_MEMBER_FIELDS: readonly MemberField[] = [
  'legal_name',
  'email',
  'address.line1',
  'address.city',
  'address.state',
  'address.zip',
];

/** Shown when there is no spec (the self-file copy panel) and as labels for fields a spec does not name. */
export const DEFAULT_MEMBER_FIELDS: readonly MemberField[] = [
  'legal_name',
  'email',
  'phone',
  'address.line1',
  'address.line2',
  'address.city',
  'address.state',
  'address.zip',
];

export const DEFAULT_MEMBER_LABELS: Readonly<Record<MemberField, string>> = {
  legal_name: 'Full legal name',
  first_name: 'First name',
  last_name: 'Last name',
  email: 'Email',
  phone: 'Phone',
  'address.line1': 'Street address',
  'address.line2': 'Apartment, suite or unit',
  'address.city': 'City',
  'address.state': 'State',
  'address.zip': 'ZIP code',
};

export interface MemberFieldDef {
  field: MemberField;
  label: string;
  required: boolean;
}

/**
 * The member fields of this packet, in the spec's order, plus the fields the
 * canonical packet always needs (the administrator must be able to reach the
 * member). Without a spec: the copy panel's default set.
 */
export function memberFieldDefs(spec: FilingSpecContent | null): MemberFieldDef[] {
  if (!spec) {
    return DEFAULT_MEMBER_FIELDS.map((field) => ({
      field,
      label: DEFAULT_MEMBER_LABELS[field],
      required: CANONICAL_REQUIRED_MEMBER_FIELDS.includes(field),
    }));
  }
  const defs: MemberFieldDef[] = spec.member_fields.map((m) => ({
    field: m.field,
    label: m.official_label,
    required: m.required || CANONICAL_REQUIRED_MEMBER_FIELDS.includes(m.field),
  }));
  for (const field of CANONICAL_REQUIRED_MEMBER_FIELDS) {
    if (!defs.some((d) => d.field === field)) defs.push({ field, label: DEFAULT_MEMBER_LABELS[field], required: true });
  }
  return defs;
}

export function memberValue(member: MemberDraft, field: MemberField): string | null {
  if (field.startsWith('address.')) {
    return member.address[field.slice('address.'.length) as keyof MemberDraft['address']] ?? null;
  }
  return member[field as Exclude<keyof MemberDraft, 'address'>] ?? null;
}

export function findTier(spec: FilingSpecContent, tierKey: string | null): BenefitTier | null {
  if (!tierKey) return null;
  return spec.benefit_tiers.find((t) => t.key === tierKey) ?? null;
}

/** Proof the chosen tier asks for (none before a tier is chosen, or when the spec has no tiers). */
export function tierProofs(spec: FilingSpecContent | null, tierKey: string | null): ProofRequirement[] {
  if (!spec) return [];
  return findTier(spec, tierKey)?.proof ?? [];
}

export interface AskContext {
  lane?: Lane | null;
  daysToDeadline?: number | null;
}

function conditionContext(draft: PacketDraft, ask: AskContext): ConditionContext {
  return { packet: draft, lane: ask.lane ?? null, daysToDeadline: ask.daysToDeadline ?? null };
}

/** True when the question is asked for this packet: its tier list includes the chosen tier, and visible_when holds. */
export function isQuestionAsked(question: SpecQuestion, draft: PacketDraft, ask: AskContext = {}): boolean {
  if (question.tiers && !(draft.benefit_tier && question.tiers.includes(draft.benefit_tier))) return false;
  if (!questionVisible(question.visible_when, conditionContext(draft, ask))) return false;
  return true;
}

/** The asked questions, in spec order. */
export function askedQuestions(spec: FilingSpecContent | null, draft: PacketDraft, ask: AskContext = {}): SpecQuestion[] {
  if (!spec) return [];
  return spec.questions.filter((q) => isQuestionAsked(q, draft, ask));
}

/** The chosen tier asks a health-flagged question or proof (Washington My Health My Data Act). */
export function asksHealthData(spec: FilingSpecContent | null, draft: PacketDraft, ask: AskContext = {}): boolean {
  if (!spec) return false;
  return (
    askedQuestions(spec, draft, ask).some((q) => q.health_flag) ||
    tierProofs(spec, draft.benefit_tier).some((p) => p.health_flag)
  );
}

/** Files a proof item needs: at least one when required (min_files may say more). */
export function minFilesNeeded(proof: ProofRequirement): number {
  return proof.required ? Math.max(1, proof.min_files) : 0;
}

/** Stored files of a kind that the proof item accepts. */
export function acceptedDocuments(draft: PacketDraft, proof: ProofRequirement): PacketDraft['documents'] {
  return draft.documents.filter((d) => d.kind === proof.kind && proof.accepted_mime.includes(d.mime));
}

/** The packet paths of everything required and still missing (or out of bounds, for proof). */
export function missingPaths(spec: FilingSpecContent, draft: PacketDraft, ask: AskContext = {}): string[] {
  const missing: string[] = [];
  for (const def of memberFieldDefs(spec)) {
    if (def.required && !isPresent(memberValue(draft.member, def.field))) missing.push(`member.${def.field}`);
  }
  for (const q of askedQuestions(spec, draft, ask)) {
    if (q.required && !isPresent(draft.answers[q.key])) missing.push(`answers.${q.key}`);
  }
  if (spec.benefit_tiers.length > 0 && !findTier(spec, draft.benefit_tier)) missing.push('benefit_tier');
  if (spec.payout_options.length > 0 && !spec.payout_options.some((o) => o.value === draft.payout_method)) {
    missing.push('payout_method');
  }
  for (const proof of tierProofs(spec, draft.benefit_tier)) {
    const all = draft.documents.filter((d) => d.kind === proof.kind);
    const accepted = acceptedDocuments(draft, proof);
    if (accepted.length < minFilesNeeded(proof) || all.length > proof.max_files || accepted.length !== all.length) {
      missing.push(`documents.${proof.kind}`);
    }
  }
  return missing;
}
