/**
 * Jev global rules about what the member entered: identity and address, the
 * settlement's questions, secrets, health data, tier, payout and proof
 * (docs/designs/one-click-filing.md, section 7). While filling (partial),
 * anything still missing is `info`; invalid or never-collected values are
 * `block` in every mode. Issue fields are Jev paths (doc_count.<kind> for
 * proof).
 */
import { DOCUMENT_MAX_BYTES, MAX_ANSWER_KEYS, MAX_DOCUMENTS_PER_CLAIM, normalizeTypedName } from '../filing/v2/contract-base';
import { DOCUMENT_MIME_TYPES, type MemberField, type QuestionType } from '../filing/v2/contract-spec';
import { isEmptyValue, type JevValue } from './conditions';
import { answerKeys, answerOf, makeIssue, type JevContext } from './context';
import { canonicalJsonOf, utf8Length } from './hash';
import { checkAnswer } from './answers';
import { findSecrets, isCardNumberLike, isEmailAddress, isUsPhone, isUsStateCode, isZipCode } from './formats';
import { MEMBER, STAFF } from './messages';
import { ALL_MODES, type GlobalRule } from './rules-settlement-level';

/** The canonical packet cannot exist without these, whatever the spec lists. */
const ALWAYS_REQUIRED = new Set<MemberField>(['legal_name', 'email', 'address.line1', 'address.city', 'address.state', 'address.zip']);
const MAX_ANSWERS_BYTES = 64 * 1024;
const MAX_ANSWER_CHARS = 2000;

function memberRequired(ctx: JevContext, field: MemberField): boolean {
  return ALWAYS_REQUIRED.has(field) || (ctx.content?.member_fields ?? []).some((m) => m.field === field && m.required);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function nameWords(name: string): string[] {
  return normalizeTypedName(name).replace(/[.,]/g, ' ').split(' ').filter(Boolean);
}

const memberIdentity: GlobalRule = {
  id: 'global.member_identity',
  modes: ALL_MODES,
  run(ctx, id) {
    const member = ctx.packet.member;
    const legal = text(member?.legal_name);
    const legalLength = Array.from(legal).length;
    if (!legal) ctx.add(makeIssue(id, ctx.missing, 'required_missing', 'member.legal_name', MEMBER.legalNameMissing));
    else if (legalLength > 200) ctx.add(makeIssue(id, 'block', 'too_long', 'member.legal_name', MEMBER.nameTooLong));
    else if (legalLength < 2 || !/\p{L}/u.test(legal)) {
      ctx.add(makeIssue(id, 'block', 'invalid_value', 'member.legal_name', MEMBER.legalNameInvalid));
    } else if (!/\s/u.test(legal)) {
      ctx.add(makeIssue(id, 'warn', 'legal_name_incomplete', 'member.legal_name', MEMBER.legalNameIncomplete));
    }

    const parts: Array<['first_name' | 'last_name', string]> = [
      ['first_name', MEMBER.firstNameMissing],
      ['last_name', MEMBER.lastNameMissing],
    ];
    const legalWords = new Set(nameWords(legal));
    let mismatchReported = false;
    for (const [field, missingMessage] of parts) {
      const value = text(member?.[field]);
      const path = `member.${field}`;
      if (!value) {
        if (memberRequired(ctx, field)) ctx.add(makeIssue(id, ctx.missing, 'required_missing', path, missingMessage));
      } else if (Array.from(value).length > 200) {
        ctx.add(makeIssue(id, 'block', 'too_long', path, MEMBER.nameTooLong));
      } else if (legal && !mismatchReported && !nameWords(value).every((w) => legalWords.has(w))) {
        mismatchReported = true;
        ctx.add(makeIssue(id, 'warn', 'name_parts_mismatch', path, MEMBER.namePartsMismatch));
      }
    }

    const email = text(member?.email);
    if (!email) ctx.add(makeIssue(id, ctx.missing, 'required_missing', 'member.email', MEMBER.emailMissing));
    else if (!isEmailAddress(email)) ctx.add(makeIssue(id, 'block', 'invalid_email', 'member.email', MEMBER.emailInvalid));

    const phone = text(member?.phone);
    if (!phone) {
      if (memberRequired(ctx, 'phone')) ctx.add(makeIssue(id, ctx.missing, 'required_missing', 'member.phone', MEMBER.phoneMissing));
    } else if (!isUsPhone(phone)) {
      ctx.add(makeIssue(id, 'block', 'invalid_phone', 'member.phone', MEMBER.phoneInvalid));
    }
  },
};

const memberAddress: GlobalRule = {
  id: 'global.member_address',
  modes: ALL_MODES,
  run(ctx, id) {
    const address = ctx.packet.member?.address;
    const lines: Array<['line1' | 'line2' | 'city', string, number]> = [
      ['line1', MEMBER.line1Missing, 200],
      ['line2', MEMBER.line2Missing, 200],
      ['city', MEMBER.cityMissing, 100],
    ];
    for (const [key, missingMessage, max] of lines) {
      const value = text(address?.[key]);
      const path = `member.address.${key}`;
      if (!value) {
        if (memberRequired(ctx, `address.${key}`)) ctx.add(makeIssue(id, ctx.missing, 'required_missing', path, missingMessage));
      } else if (Array.from(value).length > max) {
        ctx.add(makeIssue(id, 'block', 'too_long', path, MEMBER.addressTooLong));
      }
    }
    const state = text(address?.state);
    if (!state) ctx.add(makeIssue(id, ctx.missing, 'required_missing', 'member.address.state', MEMBER.stateMissing));
    else if (!isUsStateCode(state)) ctx.add(makeIssue(id, 'block', 'invalid_state', 'member.address.state', MEMBER.stateInvalid));
    const zip = text(address?.zip);
    if (!zip) ctx.add(makeIssue(id, ctx.missing, 'required_missing', 'member.address.zip', MEMBER.zipMissing));
    else if (!isZipCode(zip)) ctx.add(makeIssue(id, 'block', 'invalid_zip', 'member.address.zip', MEMBER.zipInvalid));
  },
};

const requiredAnswers: GlobalRule = {
  id: 'global.required_answers',
  modes: ALL_MODES,
  run(ctx, id) {
    for (const q of ctx.questions.values()) {
      if (!q.required || !ctx.visible.has(q.key)) continue;
      const field = `answers.${q.key}`;
      if (isEmptyValue(field, answerOf(ctx.packet, q.key))) ctx.add(makeIssue(id, ctx.missing, 'required_missing', field, MEMBER.answerMissing));
    }
  },
};

const answerTypes: GlobalRule = {
  id: 'global.answer_types',
  modes: ALL_MODES,
  run(ctx, id) {
    for (const q of ctx.questions.values()) {
      if (!ctx.visible.has(q.key)) continue;
      const value = answerOf(ctx.packet, q.key);
      if (!isEmptyValue(`answers.${q.key}`, value)) checkAnswer(ctx, id, q, value);
    }
  },
};

const unknownAnswers: GlobalRule = {
  id: 'global.unknown_answers',
  modes: ALL_MODES,
  run(ctx, id) {
    for (const key of answerKeys(ctx.packet)) {
      const field = `answers.${key}`;
      if (isEmptyValue(field, answerOf(ctx.packet, key))) continue;
      if (!ctx.questions.has(key)) ctx.add(makeIssue(id, 'block', 'unknown_question', field, MEMBER.unknownQuestion));
      else if (!ctx.visible.has(key)) ctx.add(makeIssue(id, 'warn', 'answer_not_applicable', field, MEMBER.notApplicable));
    }
  },
};

const FREE_TEXT_TYPES = new Set<QuestionType>(['text', 'long_text']);

function secretIssue(ctx: JevContext, id: string, field: string, type: QuestionType | 'member', value: JevValue): void {
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value) && isCardNumberLike(String(Math.abs(value)))) {
      ctx.add(makeIssue(id, 'block', 'secret_like_value', field, MEMBER.secret));
    }
    return;
  }
  if (typeof value !== 'string') return;
  const found = findSecrets(value);
  let block = false;
  let possible = false;
  const always = found.ssn || found.routing || found.bankAccount || found.credential;
  if (type === 'notice_id') {
    block = always;
    possible = found.card;
  } else {
    block = always || found.card;
    possible = FREE_TEXT_TYPES.has(type as QuestionType) && found.bareNine;
  }
  const numberLike = found.ssn || found.routing || found.bankAccount || found.card;
  if (block) ctx.add(makeIssue(id, 'block', 'secret_like_value', field, numberLike ? MEMBER.secret : MEMBER.secretCode));
  else if (possible) ctx.add(makeIssue(id, 'warn', 'possible_secret', field, MEMBER.possibleSecret));
}

const noSecrets: GlobalRule = {
  id: 'global.no_secrets',
  modes: ALL_MODES,
  run(ctx, id) {
    for (const key of answerKeys(ctx.packet)) {
      const type = ctx.questions.get(key)?.type ?? 'text';
      secretIssue(ctx, id, `answers.${key}`, type, answerOf(ctx.packet, key));
    }
    const member = ctx.packet.member;
    for (const key of ['legal_name', 'first_name', 'last_name'] as const) secretIssue(ctx, id, `member.${key}`, 'member', member?.[key]);
    for (const key of ['line1', 'line2', 'city'] as const) {
      secretIssue(ctx, id, `member.address.${key}`, 'member', member?.address?.[key]);
    }
  },
};

const healthConsent: GlobalRule = {
  id: 'global.health_consent',
  modes: ALL_MODES,
  run(ctx, id) {
    const facts = ctx.input.healthConsent ?? { required: false, textAvailable: false, given: false };
    const consented = facts.textAvailable === true && facts.given === true;
    const refuse = (field: string) => {
      if (consented) return;
      if (!facts.textAvailable) ctx.add(makeIssue(id, 'block', 'not_collected', field, MEMBER.healthNotCollected));
      else ctx.add(makeIssue(id, 'block', 'health_consent_required', field, MEMBER.healthConsentRequired));
    };
    for (const q of ctx.questions.values()) {
      const field = `answers.${q.key}`;
      if (q.health_flag && !isEmptyValue(field, answerOf(ctx.packet, q.key))) refuse(field);
    }
    for (const kind of ctx.flaggedKinds) {
      if ((ctx.docCounts.get(kind) ?? 0) > 0) refuse(`doc_count.${kind}`);
    }
    // Without the law firm's text the agent lane itself is off: global.lane_allowed reports it.
    if (facts.required && ctx.agent && facts.textAvailable && !facts.given) {
      ctx.add(makeIssue(id, ctx.missing, 'health_consent_needed', null, MEMBER.healthConsentNeeded));
    }
    if (!ctx.partial && facts.required && consented !== (ctx.packet.confirmations?.health_data_consent === true)) {
      ctx.add(makeIssue(id, 'warn', 'health_consent_packet_mismatch', null, STAFF.healthPacketMismatch, 'staff'));
    }
  },
};

const benefitTier: GlobalRule = {
  id: 'global.benefit_tier',
  modes: ALL_MODES,
  run(ctx, id) {
    const tiers = ctx.content?.benefit_tiers ?? [];
    const chosen = ctx.packet.benefit_tier;
    if (tiers.length === 0) {
      if (chosen) ctx.add(makeIssue(id, 'block', 'invalid_option', 'benefit_tier', MEMBER.tierInvalid));
      return;
    }
    if (!chosen) ctx.add(makeIssue(id, ctx.missing, 'required_missing', 'benefit_tier', MEMBER.tierMissing));
    else if (!ctx.tier) ctx.add(makeIssue(id, 'block', 'invalid_option', 'benefit_tier', MEMBER.tierInvalid));
  },
};

const payoutMethod: GlobalRule = {
  id: 'global.payout_method',
  modes: ALL_MODES,
  run(ctx, id) {
    const options = ctx.content?.payout_options ?? [];
    const chosen = ctx.packet.payout_method;
    if (options.length === 0) {
      if (chosen) ctx.add(makeIssue(id, 'block', 'invalid_option', 'payout_method', MEMBER.payoutInvalid));
      return;
    }
    if (!chosen) ctx.add(makeIssue(id, ctx.missing, 'required_missing', 'payout_method', MEMBER.payoutMissing));
    else if (!options.some((o) => o.value === chosen)) ctx.add(makeIssue(id, 'block', 'invalid_option', 'payout_method', MEMBER.payoutInvalid));
  },
};

const proofDocuments: GlobalRule = {
  id: 'global.proof_documents',
  modes: ALL_MODES,
  run(ctx, id) {
    const docs = ctx.packet.documents ?? [];
    if (docs.length > MAX_DOCUMENTS_PER_CLAIM) ctx.add(makeIssue(id, 'block', 'document_limit', null, MEMBER.documentLimit));
    const hashes = new Set<string>();
    for (const doc of docs) {
      const field = `doc_count.${doc.kind}`;
      if (hashes.has(doc.sha256)) ctx.add(makeIssue(id, 'warn', 'duplicate_document', field, MEMBER.duplicateDocument));
      hashes.add(doc.sha256);
      if (!(doc.size_bytes >= 1 && doc.size_bytes <= DOCUMENT_MAX_BYTES)) {
        ctx.add(makeIssue(id, 'block', 'proof_too_large', field, MEMBER.proofTooLarge));
      }
    }
    const proofs = ctx.tier?.proof ?? [];
    for (const proof of proofs) {
      const field = `doc_count.${proof.kind}`;
      const ofKind = docs.filter((d) => d.kind === proof.kind);
      const minFiles = proof.min_files ?? 1;
      const min = proof.required ? Math.max(1, minFiles) : ofKind.length > 0 ? minFiles : 0;
      if (ofKind.length < min) {
        const none = ofKind.length === 0;
        ctx.add(makeIssue(id, ctx.missing, none ? 'required_missing' : 'proof_too_few', field, none ? MEMBER.proofMissing : MEMBER.proofTooFew(min)));
      }
      const max = proof.max_files ?? 3;
      if (ofKind.length > max) ctx.add(makeIssue(id, 'block', 'proof_too_many', field, MEMBER.proofTooMany(max)));
      const accepted = proof.accepted_mime ?? [...DOCUMENT_MIME_TYPES];
      if (ofKind.some((d) => !accepted.includes(d.mime))) {
        ctx.add(makeIssue(id, 'block', 'proof_wrong_type', field, MEMBER.proofWrongType(accepted)));
      }
    }
    const tierPending = (ctx.content?.benefit_tiers ?? []).length > 0 && !ctx.tier;
    if (tierPending) return;
    const kinds = new Set(proofs.map((p) => p.kind));
    for (const kind of new Set(docs.map((d) => d.kind))) {
      if (!kinds.has(kind)) ctx.add(makeIssue(id, 'warn', 'document_not_applicable', `doc_count.${kind}`, MEMBER.documentNotApplicable));
    }
  },
};

const packetSize: GlobalRule = {
  id: 'global.packet_size',
  modes: ALL_MODES,
  run(ctx, id) {
    const keys = answerKeys(ctx.packet);
    if (keys.length > MAX_ANSWER_KEYS) ctx.add(makeIssue(id, 'block', 'packet_too_large', null, MEMBER.tooManyAnswers));
    for (const key of keys) {
      const value: unknown = ctx.packet.answers[key];
      const field = `answers.${key}`;
      if (typeof value === 'string' && value.length > MAX_ANSWER_CHARS) {
        ctx.add(makeIssue(id, 'block', 'answer_too_long', field, MEMBER.answerTooLong));
      } else if (Array.isArray(value) && (value.length > 50 || value.some((item) => typeof item !== 'string' || item.length > 200))) {
        ctx.add(makeIssue(id, 'block', 'packet_too_large', field, MEMBER.answersTooLarge));
      }
    }
    if (utf8Length(canonicalJsonOf(ctx.packet.answers ?? {})) > MAX_ANSWERS_BYTES) {
      ctx.add(makeIssue(id, 'block', 'packet_too_large', null, MEMBER.answersTooLarge));
    }
  },
};

export const PACKET_LEVEL_RULES: readonly GlobalRule[] = [
  memberIdentity,
  memberAddress,
  requiredAnswers,
  answerTypes,
  unknownAnswers,
  noSecrets,
  healthConsent,
  benefitTier,
  payoutMethod,
  proofDocuments,
  packetSize,
];
