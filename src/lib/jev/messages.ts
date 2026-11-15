/**
 * Every message Jev's global rules write. Member messages are plain English
 * (no legalese, no promises about payment or eligibility, nothing about kill
 * switches, objections or staffing) and must pass tests/copy-guard.test.ts
 * with no allowlist entry. Staff messages reach the console and desk only.
 * Per-settlement rules bring their own message (FilingSpecContent.jev_rules).
 */
import type { DocumentMime } from '../filing/v2/contract-spec';

const MIME_NAMES: Record<DocumentMime, string> = {
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/heic': 'HEIC',
  'image/heif': 'HEIF',
  'image/webp': 'WebP',
  'application/pdf': 'PDF',
};

function list(words: string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export const MEMBER = {
  settlementClosed: 'This settlement is closed to new claims. Check the official site to be sure.',
  deadlinePassed: 'The deadline for this settlement has passed. Check the official site to be sure.',
  notOffered: 'Lawsuit AI can’t send this claim for this settlement right now. You can finish it on the official site.',
  noSpec: 'This settlement’s claim form isn’t set up in Lawsuit AI yet. You can finish it on the official site.',
  specNotApproved: 'The official claim form for this settlement changed. Review your claim again before you sign.',
  specRetired: 'This claim form is no longer in use, so Lawsuit AI can’t send this claim. You can finish it on the official site.',
  specChanged: 'The official claim form for this settlement was updated. Review your answers again before you sign.',
  statementTextChanged: 'The sworn statement for this claim changed. Read it again before you sign.',
  deadlineTooClose:
    'The deadline is too close for Lawsuit AI to send this claim in time. You can still finish it on the official site before the deadline.',
  stateNotCovered: 'Lawsuit AI can’t send this claim for an address in your state. You can finish it on the official site.',

  legalNameMissing: 'Add your full legal name.',
  legalNameInvalid: 'Enter your full legal name as it appears on official documents.',
  legalNameIncomplete: 'Use your full legal name, with your first and last name.',
  firstNameMissing: 'Add your first name.',
  lastNameMissing: 'Add your last name.',
  nameTooLong: 'This name is too long. Use at most 200 characters.',
  namePartsMismatch: 'Your first or last name doesn’t match your full legal name. Check them.',
  emailMissing: 'Add your email address.',
  emailInvalid: 'Enter a valid email address, like name@example.com.',
  phoneMissing: 'Add your phone number.',
  phoneInvalid: 'Enter a 10-digit US phone number.',
  line1Missing: 'Add your street address.',
  line2Missing: 'Add the second line of your address.',
  cityMissing: 'Add your city.',
  stateMissing: 'Add your state.',
  stateInvalid: 'Use the two-letter state code, like CA or NY.',
  zipMissing: 'Add your ZIP code.',
  zipInvalid: 'Enter a 5-digit ZIP code, or ZIP+4 like 12345-6789.',
  addressTooLong: 'This line is too long. Use at most 200 characters.',

  answerMissing: 'Answer this question.',
  wrongType: 'This answer isn’t in the right format. Enter it again.',
  tooShort: (min: number) => `This answer needs at least ${plural(min, 'character', 'characters')}.`,
  tooLong: (max: number) => `Keep this answer to ${plural(max, 'character', 'characters')} or fewer.`,
  patternMismatch: 'This answer isn’t in the format the official form asks for.',
  dateInvalid: 'Enter a real date.',
  dateInFuture: 'This date is in the future. Check it.',
  wholeNumber: 'Enter a whole number.',
  number: 'Enter a number.',
  money: 'Enter an amount in dollars and cents, like 12.34.',
  range: (min: number | undefined, max: number | undefined) =>
    min !== undefined && max !== undefined
      ? `Enter a number from ${min} to ${max}.`
      : min !== undefined
        ? `Enter a number of at least ${min}.`
        : `Enter a number of at most ${max}.`,
  yesNo: 'Choose yes or no.',
  choice: 'Choose one of the listed options.',
  choices: 'Choose from the listed options.',
  tooFewChoices: (min: number) => `Choose at least ${plural(min, 'option', 'options')}.`,
  tooManyChoices: (max: number) => `Choose at most ${plural(max, 'option', 'options')}.`,
  vinFormat: 'A VIN has 17 letters and numbers, without I, O or Q.',
  vinCheckDigit: 'This VIN doesn’t look right. Check it against your registration or the label on the driver’s side of the dashboard.',
  unknownQuestion: 'This answer isn’t part of this claim form, so it can’t be saved.',
  notApplicable: 'This answer doesn’t apply to the choices you made. Clear it before you sign.',
  secret: 'This looks like a Social Security, bank account or card number. Lawsuit AI never collects those, so remove it.',
  secretCode: 'This looks like a PIN, password or one-time code. Lawsuit AI never collects those, so remove it.',
  possibleSecret:
    'This looks like it could be a Social Security or bank routing number. Lawsuit AI never needs those. If it’s something else, you can keep it.',
  answerTooLong: 'This answer is too long. Keep it to 2,000 characters or fewer.',
  tooManyAnswers: 'This claim has more answers than the form allows.',
  answersTooLarge: 'Your answers are too long to save. Shorten the longest ones.',

  healthNotCollected: 'Lawsuit AI can’t collect this health information for this settlement. Enter it on the official site instead.',
  healthConsentRequired: 'This asks for health information. Agree to share it first.',
  healthConsentNeeded: 'Agree to share health information for this claim before you sign, or finish it on the official site.',
  classDefinitionNotConfirmed: 'Read who this settlement covers and confirm it describes you.',
  classDefinitionChanged: 'The description of who this settlement covers changed. Read it again and confirm it describes you.',
  tierMissing: 'Choose the claim option that fits you.',
  tierInvalid: 'Choose one of the listed claim options.',
  payoutMissing: 'Choose how you’d like to receive any payment.',
  payoutInvalid: 'Choose one of the listed payment methods.',

  proofMissing: 'Upload this proof.',
  proofTooFew: (min: number) => `Upload at least ${plural(min, 'file', 'files')} for this proof.`,
  proofTooMany: (max: number) => `Upload no more than ${plural(max, 'file', 'files')} for this proof.`,
  proofWrongType: (accepted: readonly DocumentMime[]) =>
    `This file type isn’t accepted here. Upload a ${list(accepted.map((m) => MIME_NAMES[m] ?? m))} file.`,
  proofTooLarge: 'This file is too large. Upload one of 10 MB or less.',
  documentNotApplicable: 'This file doesn’t apply to the claim option you chose. Remove it before you sign.',
  duplicateDocument: 'You uploaded the same file more than once.',
  documentLimit: 'This claim has more files than Lawsuit AI can take.',

  signatureMissing: 'This claim needs your signature.',
  signatureVoided: 'Your signature on this claim no longer counts. Review the claim and sign again.',
  signatureChanged: 'This claim changed after you signed it. Review it and sign again.',
  typedNameMismatch: 'The name you typed doesn’t match the legal name on this claim. Sign again with your full legal name.',
  statementChanged: 'The sworn statement changed after you signed. Read it again and sign again.',
  staffCheck: 'Lawsuit AI needs to check something on this claim first. You can also finish it on the official site.',
} as const;

export const STAFF = {
  killSwitch: (scope: string | null) => `Kill switch is on${scope ? ` (${scope} level)` : ''}.`,
  objection: (at: string) => `An objection was recorded at ${at}.`,
  agentFiling: (value: string) => `The policy's agent_filing is ${value}, not allowed.`,
  identityCheck: 'The policy requires an identity check, and no identity vendor exists yet.',
  channelOff: (lane: string) => `The ${lane} channel is not enabled in the approved policy.`,
  certification: 'The official form makes the submitter certify facts, and the policy does not allow agent certification.',
  healthTextMissing: 'Health consent is required, but the policy has no law-firm consent text.',
  healthPacketMismatch: 'The packet’s health_data_consent does not match the member’s recorded consent.',
  noSpec: 'No approved filing spec for this settlement.',
  specStatus: (status: string, mode: string) => `Spec status is ${status}, which ${mode} does not accept.`,
  specMismatch: 'The packet was built on a different spec id or version than the one passed to Jev.',
  attestationHash: 'The packet’s attestation_sha256 does not equal the spec’s.',
  classHash: 'The packet’s class_definition_sha256 does not equal the spec’s.',
  cutoff: (days: number, min: number, lane: string) =>
    `${days} calendar days to the deadline; ${lane} needs at least ${min} (min_days_before_deadline).`,
  businessDays: (n: number, needed: number, type: string, deadline: string, zone: string) =>
    `Only ${n} business day(s) left through the ${type} deadline on ${deadline} (${zone}); plan for ${needed}.`,
  timeZone: (zone: string) => `Unknown deadline time zone "${zone}"; days were counted in America/New_York.`,
  stateNotCovered: (state: string, allowed: readonly string[]) =>
    `Member state ${state} is not in allowed_states (${allowed.join(', ')}).`,
  patternInvalid: (key: string, why: string) => `The pattern for ${key} cannot run: ${why}. The check was skipped.`,
  conditionInvalid: (key: string, why: string) => `The visible_when condition of ${key} cannot run: ${why}. The question is asked of everyone.`,
  ruleInvalid: (why: string) => `This rule cannot run: ${why}. It was skipped.`,
  ruleError: (rule: string, why: string) => `Jev could not run ${rule}: ${why}.`,
  inputInvalid: (why: string) => `Jev received invalid input: ${why}.`,
  signatureHash: 'The live signature’s packet_hash does not equal the packet hash recomputed now.',
  signatureLane: (signed: string, lane: string) => `The signature is for the ${signed} lane, but this send is on ${lane}.`,
  packetHashMissing: 'No packet hash was passed (the packet is incomplete), so the signature cannot be checked.',
  statementHash: 'The signed statement_sha256 does not equal the spec’s attestation_sha256.',
  duplicates: (n: number) => `The same name and address appear on ${n} other account(s) for this settlement.`,
} as const;
