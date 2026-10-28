/**
 * Per-claim authorization and attestation text. The signed copy is stored in
 * claim_authorizations.full_text with this version key. Changing the body
 * requires a new version so old signatures stay attributable.
 */

export const AUTHORIZATION_VERSION = 'v1';

export const AUTHORIZATION_TEXT_V1 = `I am the person named on this ClaimMatch account.

I authorize ClaimMatch to act as my agent for this one settlement claim only, and to complete and send the official administrator form using the name, address, email and profile details I have saved.

I attest that those details are accurate and complete to the best of my knowledge, and that I believe I may be included in the class described on the official notice. I understand the official notice and administrator site are the final word on who is included and what proof is needed.

I understand I can withdraw this authorization in ClaimMatch before the job is sent. After it is sent, I should contact the administrator with any correction.

I understand ClaimMatch does not give legal advice, is not a law firm, and does not receive or handle settlement payments.`;

export function authorizationText(version = AUTHORIZATION_VERSION): string {
  if (version === AUTHORIZATION_VERSION) return AUTHORIZATION_TEXT_V1;
  return AUTHORIZATION_TEXT_V1;
}

export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip')?.trim();
  return real || null;
}

export function clientUserAgent(req: Request): string | null {
  const ua = req.headers.get('user-agent')?.trim();
  return ua ? ua.slice(0, 512) : null;
}
