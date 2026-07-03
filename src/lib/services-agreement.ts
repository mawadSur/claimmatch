/**
 * Plain-English authorization + contingency-fee services agreement shown at the
 * point a user e-signs to have ClaimMatch prepare and submit a claim on their
 * behalf. Business model: "we recover it for you and take a %".
 *
 * Deliberately does NOT hardcode the fee percentage — it references "our
 * published fee" so the single source of truth stays FEE_PCT / the pricing page.
 * The SERVICES_AGREEMENT string is rendered in a scrollable box next to the
 * signature field; ATTESTATION is the short line placed beside the signature.
 */
export const SERVICES_AGREEMENT = `ClaimMatch Claim Filing & Recovery Services Agreement

By typing your legal name and checking the authorization box below, you (the "Claimant") authorize ClaimMatch to act on your behalf to pursue the settlement claim(s) you are filing. Please read this agreement carefully.

1. What you are authorizing.
You authorize ClaimMatch to prepare, complete, sign where permitted, and submit your claim(s) to the relevant settlement administrator(s), and to communicate with those administrators about your claim(s). You appoint ClaimMatch as your limited authorized representative for the sole purpose of preparing and submitting these claim(s) and tracking their status.

2. Your attestation.
You attest that the information you have provided — including your identity, contact details, eligibility answers, and any supporting facts — is true, accurate, and complete to the best of your knowledge. Submitting false information to a settlement administrator may be unlawful. You remain responsible for the accuracy of the information you provide.

3. How we get paid (contingency fee).
ClaimMatch charges no upfront fee. It costs nothing to check whether you qualify or to file. If — and only if — you actually receive money from a claim we file for you, ClaimMatch keeps a percentage of that recovery as its fee. That percentage is our published fee, shown on our pricing page and in your dashboard at the time you authorize filing. We are paid a percentage of any recovery; we are not paid if you recover nothing.

4. How payment works.
When a settlement administrator pays a claim we filed for you, that gross amount is recorded as a recovery. ClaimMatch deducts its published fee from the gross recovery and forwards the remaining net amount to you. You will be able to see the gross amount, our fee, and your net amount in your dashboard.

5. No legal advice; not a law firm.
ClaimMatch is a claims-filing and matching service, not a law firm, and does not provide legal advice. Using this service does not create an attorney-client relationship. Settlement eligibility and payout amounts are determined solely by the settlement administrators and the courts, not by ClaimMatch. Estimated values shown are non-binding estimates, and there is no guarantee any claim will be approved or paid.

6. Your control.
You may contact us to withdraw this authorization for any claim that has not yet been paid. Withdrawing does not undo a claim already submitted to or acted on by an administrator, but it stops further action by ClaimMatch on that claim.

7. Agreement.
Your typed legal name serves as your electronic signature and has the same legal effect as a handwritten signature. By signing, you agree to this authorization and to ClaimMatch's Terms and Privacy Policy.`;

/** Short line placed directly beside the typed-signature field. */
export const ATTESTATION = `I authorize ClaimMatch to prepare and submit this claim on my behalf, and I attest that the information I have provided is true and accurate. I understand ClaimMatch's fee is our published percentage of any recovery.`;
