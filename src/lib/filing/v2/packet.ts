/**
 * The claim packet: building it, its canonical JSON and its hash, and the
 * member's view of it. The signatures and comments are the CONTRACT (B2
 * implements them). Server only (sha256Hex uses node:crypto).
 * Shapes: ./contract.ts. Rules: docs/designs/one-click-filing.md, section 5.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { JevResult } from '../../jev/types';
import { checkAnswerShape, cleanText } from './answers';
import { isPresent } from './conditions';
import {
  CanonicalPacketSchema,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MIME_TYPES,
  PACKET_FORMAT,
  type AnswerValue,
  type CanonicalJsonValue,
  type CanonicalPacket,
  type DocumentView,
  type JevIssueView,
  type Lane,
  type MemberDraft,
  type PacketDraft,
  type PacketItemView,
  type PacketStatus,
  type PacketView,
} from './contract';
import type { FilingSpecContent, MemberField } from './contract-spec';
import {
  askedQuestions,
  asksHealthData,
  memberFieldDefs,
  memberValue,
  missingPaths,
  tierProofs,
  type AskContext,
} from './packet-items';

/**
 * Canonical JSON: object keys sorted by UTF-16 code units, array order kept,
 * no whitespace, strings as JSON.stringify writes them, finite numbers only
 * (JSON.stringify form), no undefined anywhere. Throws on anything else
 * (NaN, Infinity, undefined, functions, cycles). Strings must already be NFC
 * (the packet builder normalizes them).
 */
export function canonicalJson(value: CanonicalJsonValue): string {
  const open = new Set<object>();
  const write = (v: unknown): string => {
    if (v === null) return 'null';
    switch (typeof v) {
      case 'boolean':
        return v ? 'true' : 'false';
      case 'number':
        if (!Number.isFinite(v)) throw new Error('canonicalJson: numbers must be finite');
        return JSON.stringify(v);
      case 'string':
        if (v !== v.normalize('NFC')) throw new Error('canonicalJson: strings must be NFC');
        return JSON.stringify(v);
      case 'object': {
        if (open.has(v as object)) throw new Error('canonicalJson: cycle');
        open.add(v as object);
        let out: string;
        if (Array.isArray(v)) {
          const parts: string[] = [];
          for (let i = 0; i < v.length; i += 1) {
            if (v[i] === undefined) throw new Error('canonicalJson: undefined in an array');
            parts.push(write(v[i]));
          }
          out = `[${parts.join(',')}]`;
        } else {
          const proto = Object.getPrototypeOf(v);
          if (proto !== Object.prototype && proto !== null) throw new Error('canonicalJson: plain objects only');
          const record = v as Record<string, unknown>;
          const parts = Object.keys(record)
            .sort()
            .map((key) => {
              if (record[key] === undefined) throw new Error('canonicalJson: undefined value');
              if (key !== key.normalize('NFC')) throw new Error('canonicalJson: keys must be NFC');
              return `${JSON.stringify(key)}:${write(record[key])}`;
            });
          out = `{${parts.join(',')}}`;
        }
        open.delete(v as object);
        return out;
      }
      default:
        throw new Error(`canonicalJson: a ${typeof v} is not JSON`);
    }
  };
  return write(value);
}

/** SHA-256 of the UTF-8 bytes of `text`, lowercase hex (64 characters). */
export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** sha256Hex(canonicalJson(packet)): what claim_signatures.packet_hash stores (0037 re-checks it). */
export function computePacketHash(packet: CanonicalPacket): string {
  return sha256Hex(canonicalJson(packet as unknown as CanonicalJsonValue));
}

/** Implemented in the contract (shared with Jev); re-exported so callers may import it from here. */
export { normalizeTypedName } from './contract-base';

/** The profile columns that prefill the member block. */
export interface ProfileMemberFields {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

export interface BuildPacketDraftInput {
  claim: { id: string; lawsuit_id: string };
  /** The packet's spec version (approved, or the latest approved while the packet is open); null without one. */
  spec: { id: string; version: number; content: FilingSpecContent } | null;
  /** claim_packets columns. member_snapshot wins over the profile for each field it has. */
  row: {
    answers: Record<string, AnswerValue>;
    member_snapshot: Partial<Omit<MemberDraft, 'address'>> & { address?: Partial<MemberDraft['address']> };
    benefit_tier: string | null;
    payout_method: string | null;
    class_definition_confirmed_at: string | null;
    /** Only a consent to the policy's current health text counts (the caller passes null otherwise). */
    health_consent_at: string | null;
    /** Optional (B2): the member declined the current health consent text (confirmations.health_data_consent false). */
    health_consent_declined?: boolean;
  };
  profile: ProfileMemberFields | null;
  /** claim_documents rows of this claim (any source or status; only stored member documents are used). */
  documents: Array<{ id: string; kind: string; sha256: string | null; mime: string; size_bytes: number; status: string; source: string }>;
  /**
   * sha256Hex of spec.content.class_definition.text and spec.content.attestation.text,
   * exactly as stored (no trimming); null without a spec. filing_sign_packet (0039)
   * recomputes both from the approved spec and refuses a mismatch (CM010, CM003).
   */
  hashes: { class_definition_sha256: string | null; attestation_sha256: string | null };
}

const SHA256_RE = /^[0-9a-f]{64}$/;
const STATE_RE = /^[A-Z]{2}$/;
const ZIP_RE = /^\d{5}(?:-\d{4})?$/;
const EMAIL = z.string().email().max(320);

function fieldValue(snapshot: unknown, profile: string | null | undefined, fits: (v: string) => boolean = () => true) {
  const chosen = snapshot !== undefined ? snapshot : profile;
  if (typeof chosen !== 'string') return null;
  const text = cleanText(chosen);
  return text !== null && text.length <= 200 && fits(text) ? text : null;
}

/** With a spec, only the member fields its form asks for (plus the canonical packet's contact fields) are kept. */
function keepAskedFields(member: MemberDraft, spec: FilingSpecContent | null): MemberDraft {
  if (!spec) return member;
  const asked = new Set(memberFieldDefs(spec).map((d) => d.field));
  const keep = (field: MemberField, value: string | null) => (asked.has(field) ? value : null);
  return {
    legal_name: keep('legal_name', member.legal_name),
    first_name: keep('first_name', member.first_name),
    last_name: keep('last_name', member.last_name),
    email: keep('email', member.email),
    phone: keep('phone', member.phone),
    address: {
      line1: keep('address.line1', member.address.line1),
      line2: keep('address.line2', member.address.line2),
      city: keep('address.city', member.address.city),
      state: keep('address.state', member.address.state),
      zip: keep('address.zip', member.address.zip),
    },
  };
}

function buildMember(snapshot: BuildPacketDraftInput['row']['member_snapshot'], profile: ProfileMemberFields | null): MemberDraft {
  const a = snapshot.address ?? {};
  const p = profile;
  return {
    legal_name: fieldValue(snapshot.legal_name, p?.full_name),
    first_name: fieldValue(snapshot.first_name, null),
    last_name: fieldValue(snapshot.last_name, null),
    email: fieldValue(snapshot.email, p?.email, (v) => EMAIL.safeParse(v).success),
    phone: fieldValue(snapshot.phone, p?.phone, (v) => v.length <= 40),
    address: {
      line1: fieldValue(a.line1, p?.address_line1),
      line2: fieldValue(a.line2, p?.address_line2),
      city: fieldValue(a.city, p?.city, (v) => v.length <= 100),
      state: fieldValue(a.state, p?.state?.toUpperCase(), (v) => STATE_RE.test(v)),
      zip: fieldValue(a.zip, p?.zip, (v) => ZIP_RE.test(v)),
    },
  };
}

function cleanAnswers(raw: Record<string, AnswerValue>, spec: FilingSpecContent): Record<string, AnswerValue> {
  const out: Record<string, AnswerValue> = {};
  for (const question of spec.questions) {
    if (!Object.prototype.hasOwnProperty.call(raw, question.key)) continue;
    const check = checkAnswerShape(question, raw[question.key]);
    if (check.ok && isPresent(check.value)) out[question.key] = check.value;
  }
  return out;
}

function compareDocs(a: { kind: string; sha256: string; id: string }, b: { kind: string; sha256: string; id: string }) {
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  if (a.sha256 !== b.sha256) return a.sha256 < b.sha256 ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The packet as it stands: answers only for the spec's question keys (others
 * dropped), strings NFC-normalized and trimmed, multi_choice values sorted,
 * documents sorted by kind, sha256, id. Never invents a value. Documents are
 * the stored member files of the proof kinds the chosen tier asks for; with
 * a spec, the member block holds only the fields its form asks for plus the
 * contact fields every canonical packet carries (data minimization).
 */
export function buildPacketDraft(input: BuildPacketDraftInput): PacketDraft {
  const spec = input.spec?.content ?? null;
  const tierKey = spec && input.row.benefit_tier && spec.benefit_tiers.some((t) => t.key === input.row.benefit_tier)
    ? input.row.benefit_tier
    : null;
  const payout = spec && input.row.payout_method && spec.payout_options.some((o) => o.value === input.row.payout_method)
    ? input.row.payout_method
    : null;
  const kinds = new Set(tierProofs(spec, tierKey).map((p) => p.kind));
  const documents = input.documents
    .filter(
      (d) =>
        d.source === 'member' &&
        d.status === 'stored' &&
        typeof d.sha256 === 'string' &&
        SHA256_RE.test(d.sha256) &&
        kinds.has(d.kind) &&
        (DOCUMENT_MIME_TYPES as readonly string[]).includes(d.mime) &&
        Number.isInteger(d.size_bytes) &&
        d.size_bytes >= 1 &&
        d.size_bytes <= DOCUMENT_MAX_BYTES,
    )
    .map((d) => ({
      id: d.id,
      kind: d.kind,
      sha256: d.sha256 as string,
      mime: d.mime as PacketDraft['documents'][number]['mime'],
      size_bytes: d.size_bytes,
    }))
    .sort(compareDocs);
  const consent = input.row.health_consent_at ? true : input.row.health_consent_declined ? false : null;
  return {
    format: PACKET_FORMAT,
    claim_id: input.claim.id,
    lawsuit_id: input.claim.lawsuit_id,
    spec: input.spec ? { id: input.spec.id, version: input.spec.version } : null,
    member: keepAskedFields(buildMember(input.row.member_snapshot ?? {}, input.profile), spec),
    answers: spec ? cleanAnswers(input.row.answers ?? {}, spec) : {},
    benefit_tier: tierKey,
    payout_method: payout,
    documents,
    confirmations: { class_definition: Boolean(input.row.class_definition_confirmed_at), health_data_consent: consent },
    class_definition_sha256: input.spec ? input.hashes.class_definition_sha256 : null,
    attestation_sha256: input.spec ? input.hashes.attestation_sha256 : null,
  };
}

/**
 * The canonical packet when the draft is complete for its spec (every
 * required member field and visible required question answered, tier and
 * payout chosen when the spec has them, proof present, class definition
 * confirmed by the member, health consent given when needed); otherwise the
 * packet paths still missing. Only answers to asked questions are kept.
 * `ask` (optional, B2) supplies meta.lane and meta.days_to_deadline to
 * visible_when conditions.
 */
export function toCanonicalPacket(
  draft: PacketDraft,
  spec: FilingSpecContent,
  ask: AskContext = {},
): { ok: true; packet: CanonicalPacket } | { ok: false; missing: string[] } {
  if (!draft.spec || !draft.class_definition_sha256 || !draft.attestation_sha256) return { ok: false, missing: ['spec'] };
  const missing = missingPaths(spec, draft, ask);
  if (asksHealthData(spec, draft, ask) && draft.confirmations.health_data_consent !== true) {
    missing.push('confirmations.health_data_consent');
  }
  if (!draft.confirmations.class_definition) missing.push('confirmations.class_definition');
  if (missing.length) return { ok: false, missing };

  const answers: Record<string, AnswerValue> = {};
  for (const q of askedQuestions(spec, draft, ask)) {
    if (isPresent(draft.answers[q.key])) answers[q.key] = draft.answers[q.key];
  }
  const parsed = CanonicalPacketSchema.safeParse({
    ...draft,
    answers,
    confirmations: { class_definition: true, health_data_consent: draft.confirmations.health_data_consent },
  });
  if (!parsed.success) {
    return { ok: false, missing: [...new Set(parsed.error.issues.map((i) => i.path.join('.') || 'packet'))] };
  }
  return { ok: true, packet: parsed.data };
}

export interface BuildPacketViewInput {
  packet: { id: string; status: PacketStatus; revision: number; packet_hash: string | null };
  draft: PacketDraft;
  spec: { id: string; version: number; content: FilingSpecContent } | null;
  /** The last Jev result for this packet; staff-audience issues are dropped from the view. */
  jev: JevResult | null;
  documents: DocumentView[];
  /** EffectiveFilingPolicy.health_consent_text when the claim needs it. */
  healthConsentText: string | null;
  lane: Lane;
  /** The member already allowed saving details to the profile (profiles.prefill_consent_at). */
  profileConsentGiven: boolean;
  /** Optional (B2): meta.days_to_deadline for visible_when, as toCanonicalPacket got it. */
  daysToDeadline?: number | null;
}

const MEMBER_TYPES: Partial<Record<MemberField, PacketItemView['type']>> = {
  email: 'email',
  phone: 'phone',
  'address.state': 'us_state',
  'address.zip': 'zip',
};

function memberIssues(issues: JevIssueView[], path: string): JevIssueView[] {
  return issues.filter((i) => i.field === path);
}

/** The member's view (PacketView): items in the official form's field order, with values, gaps and issues. */
export function buildPacketView(input: BuildPacketViewInput): PacketView {
  const { draft, packet } = input;
  const spec = input.spec?.content ?? null;
  const issues: JevIssueView[] = (input.jev?.issues ?? [])
    .filter((i) => i.audience === 'member')
    .map((i) => ({ rule_id: i.rule_id, source: i.source, severity: i.severity, code: i.code, message: i.message, field: i.field }));
  const signed = packet.status !== 'open';
  const consentGiven = draft.confirmations.health_data_consent === true;
  const healthLock = (flagged: boolean): PacketItemView['locked'] => {
    if (signed) return 'packet_signed';
    if (!flagged || consentGiven) return null;
    return input.healthConsentText ? 'health_consent_needed' : 'not_collected';
  };
  const ask: AskContext = { lane: input.lane, daysToDeadline: input.daysToDeadline ?? null };
  const items = new Map<string, PacketItemView>();

  for (const def of memberFieldDefs(spec)) {
    const path = `member.${def.field}`;
    const value = memberValue(draft.member, def.field);
    items.set(path, {
      path,
      kind: 'member',
      label: def.label,
      help: null,
      type: MEMBER_TYPES[def.field] ?? 'text',
      required: def.required,
      options: null,
      value,
      missing: def.required && !isPresent(value),
      health_flag: false,
      locked: signed ? 'packet_signed' : null,
      issues: memberIssues(issues, path),
      proof: null,
    });
  }
  for (const q of askedQuestions(spec, draft, ask)) {
    const path = `answers.${q.key}`;
    const value = draft.answers[q.key] ?? null;
    items.set(path, {
      path,
      kind: 'question',
      label: q.official_label,
      help: q.help,
      type: q.type,
      required: q.required,
      options: q.options ? q.options.map((o) => ({ value: o.value, label: o.official_label })) : null,
      value,
      missing: q.required && !isPresent(value),
      health_flag: q.health_flag,
      locked: healthLock(q.health_flag),
      issues: memberIssues(issues, path),
      proof: null,
    });
  }
  if (spec && spec.benefit_tiers.length > 0) {
    items.set('benefit_tier', {
      path: 'benefit_tier',
      kind: 'choice',
      label: 'Benefit you are claiming',
      help: null,
      type: 'single_choice',
      required: true,
      options: spec.benefit_tiers.map((t) => ({ value: t.key, label: t.official_label })),
      value: draft.benefit_tier,
      missing: draft.benefit_tier === null,
      health_flag: false,
      locked: signed ? 'packet_signed' : null,
      issues: memberIssues(issues, 'benefit_tier'),
      proof: null,
    });
  }
  if (spec && spec.payout_options.length > 0) {
    items.set('payout_method', {
      path: 'payout_method',
      kind: 'choice',
      label: 'Payment method',
      help: null,
      type: 'single_choice',
      required: true,
      options: spec.payout_options.map((o) => ({ value: o.value, label: o.official_label })),
      value: draft.payout_method,
      missing: draft.payout_method === null,
      health_flag: false,
      locked: signed ? 'packet_signed' : null,
      issues: memberIssues(issues, 'payout_method'),
      proof: null,
    });
  }
  for (const proof of tierProofs(spec, draft.benefit_tier)) {
    const path = `documents.${proof.kind}`;
    const files = input.documents.filter((d) => d.kind === proof.kind && (d.status === 'stored' || d.status === 'pending_upload'));
    const stored = files.filter((d) => d.status === 'stored' && proof.accepted_mime.includes(d.mime)).length;
    const need = proof.required ? Math.max(1, proof.min_files) : 0;
    items.set(path, {
      path,
      kind: 'document',
      label: proof.official_label,
      help: proof.help,
      type: 'document',
      required: proof.required,
      options: null,
      value: null,
      missing: stored < need,
      health_flag: proof.health_flag,
      locked: healthLock(proof.health_flag),
      issues: [...memberIssues(issues, path), ...memberIssues(issues, `doc_count.${proof.kind}`)],
      proof: { min_files: need, max_files: proof.max_files, accepted_mime: proof.accepted_mime, documents: files },
    });
  }

  const ordered: PacketItemView[] = [];
  for (const path of spec?.form_field_order ?? []) {
    const item = items.get(path);
    if (item) {
      ordered.push(item);
      items.delete(path);
    }
  }
  ordered.push(...items.values());

  return {
    id: packet.id,
    status: packet.status,
    revision: packet.revision,
    packet_hash: packet.packet_hash,
    complete: packet.packet_hash !== null,
    spec:
      input.spec && spec
        ? {
            id: input.spec.id,
            version: input.spec.version,
            official_form_url: spec.official_form.url,
            form_title: spec.official_form.title,
            class_definition: { text: spec.class_definition.text, source_url: spec.class_definition.source_url },
            attestation_text: spec.attestation.text,
            benefit_tiers: spec.benefit_tiers.map((t) => ({ key: t.key, label: t.official_label, description: t.description })),
            payout_options: spec.payout_options.map((o) => ({ value: o.value, label: o.official_label })),
          }
        : null,
    items: ordered,
    choices: {
      benefit_tier: draft.benefit_tier,
      payout_method: draft.payout_method,
      class_definition_confirmed: draft.confirmations.class_definition,
      health_consent: draft.confirmations.health_data_consent,
    },
    health_consent_text: input.healthConsentText,
    jev: input.jev
      ? { mode: input.jev.mode, outcome: input.jev.outcome, evaluated_at: input.jev.evaluated_at, issues }
      : null,
    save_member_to_profile_available: packet.status === 'open',
  };
}
