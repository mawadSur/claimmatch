/**
 * E-SIGN consent (15 U.S.C. 7001(c)) for one-click filing: the text the
 * member agrees to once, before their first e-signature, and its version.
 * The law firm approves the wording (go-live checklist 3). Changing a single
 * character needs a new ESIGN_TEXT_VERSION: consent counts only for the
 * current version, and esign_consents stores the exact text and its SHA-256.
 * The text never depends on the environment, so one version is one text.
 */
import { createHash } from 'node:crypto';

export const ESIGN_TEXT_VERSION = 'esign-v1';

export const ESIGN_TEXT_V1 = [
  'Consent to electronic records and signatures',
  'Lawsuit AI can prepare a settlement claim with you and, where a settlement allows it, submit it for you as your agent. To do that, Lawsuit AI needs your consent to use electronic records and electronic signatures. Please read this before you agree.',
  '1. What this covers. You agree that Lawsuit AI may give you electronically the records for claims you start with one-click filing: the claim you review, the sworn statement you sign, the record of your signature, and status notices. You also agree to sign those claims electronically by typing your full legal name. Your typed name has the same effect as your handwritten signature.',
  '2. Paper copies. You can ask for a paper copy of any of these records at no charge. Use the contact details on the Lawsuit AI Privacy page and say which claim the record is for.',
  '3. Withdrawing your consent. You can withdraw this consent at any time from any claim screen in Lawsuit AI, or by contacting Lawsuit AI. Withdrawing does not cancel or change claims you already signed. After you withdraw, you can’t sign new claims in Lawsuit AI until you agree again. You can always file a claim yourself on the official settlement site.',
  '4. What you need. A phone, tablet or computer with a current web browser or the Lawsuit AI app, an internet connection, a working email address, and a way to save or print records, such as a PDF viewer or screenshots.',
  '5. Keeping your details current. Keep your email address up to date in Settings so notices reach you.',
  'By agreeing, you confirm that you can open and keep these records electronically.',
].join('\n\n');

const TEXTS: Readonly<Record<string, string>> = { [ESIGN_TEXT_VERSION]: ESIGN_TEXT_V1 };

/** The consent text of a version, or null for a version this server does not offer. */
export function esignText(version: string = ESIGN_TEXT_VERSION): string | null {
  return Object.prototype.hasOwnProperty.call(TEXTS, version) ? TEXTS[version] : null;
}

/** esign_consents.text_sha256: SHA-256 of the UTF-8 text (0037 checks it). */
export function esignTextSha256(text: string = ESIGN_TEXT_V1): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
