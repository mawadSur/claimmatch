/**
 * PATCH .../packet: applies the member's changes to the packet columns, with
 * the boundary checks of design section 5. Answers are keyed by the spec's
 * question keys and checked by type, options and validation (400 with
 * fields); unknown keys and health data without consent are refused (422)
 * and never stored. An open packet moves to the newly approved spec version
 * on its next save. Choosing another tier, declining health consent or a new
 * spec version removes the uploads that no longer belong to the claim. Pure.
 */
import { US_STATES } from '@/lib/utils';
import { mergeMemberSnapshot, memberPatchPaths, validateAnswer, type MemberSnapshot } from './answers';
import { contentOf, type ClaimContext, type PacketContent } from './claim-context';
import { FILING_ERROR_MESSAGES, type FilingErrorCode, type UpdatePacketRequest } from './contract';
import type { DocumentRecord } from './documents';
import type { FieldError } from './http';
import { sha256Hex } from './packet';
import { tierProofs } from './packet-items';
import type { PacketRecord, SpecRecord } from './records';

export type PacketUpdate =
  | {
      ok: true;
      content: PacketContent;
      spec: SpecRecord | null;
      changedPaths: string[];
      /** Uploads to remove before saving (they no longer belong to the packet). */
      removeDocuments: DocumentRecord[];
      /** Columns to write back to the member's profile (their consent), or null. */
      profilePatch: Record<string, string | null> | null;
    }
  | { ok: false; code: FilingErrorCode; fields?: FieldError[] };

const STATE_CODES = new Set(US_STATES.map((s) => s.code));
const PHONE = /^[0-9+().\-\s]*$/;
const ZIP = /^\d{5}(?:-\d{4})?$/;
/** jsonb text is a little longer than JSON.stringify; 0037 caps answers at 64 KB. */
const MAX_ANSWERS_JSON = 60_000;

function refused(code: FilingErrorCode, path: string): PacketUpdate {
  return { ok: false, code, fields: [{ path, message: FILING_ERROR_MESSAGES[code] }] };
}

/** Profile columns the member may change themselves (0002, 0004 grants), from the member's own packet edits. */
function profilePatchFrom(snapshot: MemberSnapshot, consented: boolean, now: Date): Record<string, string | null> | null {
  const patch: Record<string, string | null> = {};
  const put = (column: string, value: string | null | undefined, ok: (v: string) => boolean) => {
    if (value === undefined) return;
    if (value === null || ok(value)) patch[column] = value;
  };
  put('full_name', snapshot.legal_name, (v) => v.length <= 120);
  put('phone', snapshot.phone, (v) => v.length <= 32 && PHONE.test(v));
  put('address_line1', snapshot.address?.line1, (v) => v.length <= 200);
  put('address_line2', snapshot.address?.line2, (v) => v.length <= 200);
  put('city', snapshot.address?.city, (v) => v.length <= 120);
  put('state', snapshot.address?.state, (v) => STATE_CODES.has(v));
  put('zip', snapshot.address?.zip, (v) => ZIP.test(v));
  if (Object.keys(patch).length === 0) return null;
  if (!consented) patch.prefill_consent_at = now.toISOString();
  return patch;
}

function liveUploads(docs: DocumentRecord[]): DocumentRecord[] {
  return docs.filter((d) => d.source === 'member' && (d.status === 'stored' || d.status === 'pending_upload'));
}

export function applyPacketUpdate(ctx: ClaimContext, packet: PacketRecord, body: UpdatePacketRequest): PacketUpdate {
  const now = ctx.now;
  const spec = ctx.env.approvedSpec ?? ctx.packetSpec;
  if (!spec && packet.spec_id) return { ok: false, code: 'service_unavailable' };
  const content = contentOf(packet);
  const answers = { ...content.answers };
  const changed: string[] = [];
  const remove = new Map<string, DocumentRecord>();

  // A newly approved spec version: keep only what still fits it.
  if ((spec?.id ?? null) !== packet.spec_id) {
    const keys = new Set(spec?.content.questions.map((q) => q.key) ?? []);
    for (const key of Object.keys(answers)) if (!keys.has(key)) delete answers[key];
    if (!spec?.content.benefit_tiers.some((t) => t.key === content.benefit_tier)) content.benefit_tier = null;
    if (!spec?.content.payout_options.some((o) => o.value === content.payout_method)) content.payout_method = null;
    if (spec?.class_definition_sha256 !== ctx.packetSpec?.class_definition_sha256) content.class_definition_confirmed_at = null;
  }

  // Health consent: to the policy's current text only; declining removes flagged answers and uploads.
  const text = ctx.env.policy.health_consent_text;
  const textHash = text ? sha256Hex(text) : null;
  if (body.health_consent === true) {
    if (!text || !textHash) return refused('not_collected', 'health_consent');
    if (!(content.health_consent_at && content.health_consent_text_sha256 === textHash)) content.health_consent_at = now.toISOString();
    content.health_consent_text_sha256 = textHash;
  } else if (body.health_consent === false) {
    content.health_consent_at = null;
    content.health_consent_text_sha256 = textHash;
    for (const q of spec?.content.questions ?? []) if (q.health_flag) delete answers[q.key];
    for (const d of liveUploads(ctx.documents)) if (d.health_flag) remove.set(d.id, d);
  }
  const consented = Boolean(textHash && content.health_consent_at && content.health_consent_text_sha256 === textHash);

  const field = (path: string, message: string): FieldError => ({ path, message });
  const errors: FieldError[] = [];
  if (body.benefit_tier !== undefined) {
    if (body.benefit_tier !== null && !spec?.content.benefit_tiers.some((t) => t.key === body.benefit_tier)) {
      errors.push(field('benefit_tier', 'Choose one of the options.'));
    } else {
      content.benefit_tier = body.benefit_tier;
      changed.push('benefit_tier');
    }
  }
  if (body.payout_method !== undefined) {
    if (body.payout_method !== null && !spec?.content.payout_options.some((o) => o.value === body.payout_method)) {
      errors.push(field('payout_method', 'Choose one of the options.'));
    } else {
      content.payout_method = body.payout_method;
      changed.push('payout_method');
    }
  }
  if (body.class_definition_confirmed !== undefined) {
    if (!spec) errors.push(field('class_definition_confirmed', 'This settlement has no official description to confirm yet.'));
    else if (!body.class_definition_confirmed) content.class_definition_confirmed_at = null;
    else if (!content.class_definition_confirmed_at) content.class_definition_confirmed_at = now.toISOString();
  }

  for (const [key, raw] of Object.entries(body.answers ?? {})) {
    const question = spec?.content.questions.find((q) => q.key === key);
    if (!question) return refused('not_collected', `answers.${key}`);
    changed.push(`answers.${key}`);
    if (raw === null) {
      delete answers[key];
      continue;
    }
    if (question.health_flag && !consented) return refused(text ? 'health_consent_required' : 'not_collected', `answers.${key}`);
    const check = validateAnswer(question, raw);
    if (!check.ok) errors.push(field(`answers.${key}`, check.message));
    else if (check.value === null) delete answers[key];
    else answers[key] = check.value;
  }
  if (errors.length) return { ok: false, code: 'invalid_request', fields: errors };
  if (JSON.stringify(answers).length > MAX_ANSWERS_JSON) {
    return { ok: false, code: 'invalid_request', fields: [field('answers', 'These answers are too long. Shorten them and try again.')] };
  }

  if (body.member) {
    const patch = body.member as MemberSnapshot;
    content.member_snapshot = mergeMemberSnapshot(content.member_snapshot, patch);
    changed.push(...memberPatchPaths(patch));
  }

  // Uploads of proof kinds the chosen tier no longer asks for leave the claim.
  const kinds = new Set(tierProofs(spec?.content ?? null, content.benefit_tier).map((p) => p.kind));
  for (const d of liveUploads(ctx.documents)) if (!kinds.has(d.kind)) remove.set(d.id, d);

  return {
    ok: true,
    content: { ...content, answers },
    spec,
    changedPaths: changed,
    removeDocuments: [...remove.values()],
    profilePatch: body.save_member_to_profile
      ? profilePatchFrom(content.member_snapshot, Boolean(ctx.profile?.prefill_consent_at), now)
      : null,
  };
}
