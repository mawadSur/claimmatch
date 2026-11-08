/**
 * Legal disclaimers. LEGAL_DISCLAIMER is shown on the legal pages and in the
 * <Disclaimer> box; SHORT_DISCLAIMER is shown in the site footer and emails.
 * ClaimMatch is a free claim assistant, not a law firm: it never files claims
 * for anyone and never handles settlement money.
 */
export const LEGAL_DISCLAIMER = `ClaimMatch is a free claim assistant, not a law firm. The information on this website is general information, not legal advice. Using this website or contacting us does not create an attorney-client relationship. ClaimMatch does not file, submit or sign claims for anyone, and it never receives or handles settlement payments. Settlement listings come from third-party sources and may be incomplete or out of date. The official settlement notice and website are the final word on deadlines, who qualifies and payments, so check them before you act. We make no promise that the information here is complete, accurate or current, or that you will receive any payment. Settlement payments may be reduced by fees and costs the court approves, such as attorneys' fees. Links to other websites are provided for convenience and do not mean we endorse them.`;

export const SHORT_DISCLAIMER = `ClaimMatch is a free claim assistant, not a law firm, and does not give legal advice. Using this site does not create an attorney-client relationship. You file every claim yourself on the official settlement website.`;

/**
 * The same two texts for the native app, served by /api/mobile/config and
 * bundled in the app as its fallback. Only "this website" and "this site"
 * change, to "ClaimMatch" or "this app"; every other word is the website's.
 * Pending counsel review, like any change to these texts. Change them
 * together with the website's versions (tests/mobile-config-route.test.ts).
 */
export const APP_LEGAL_DISCLAIMER = `ClaimMatch is a free claim assistant, not a law firm. The information on ClaimMatch is general information, not legal advice. Using this app or contacting us does not create an attorney-client relationship. ClaimMatch does not file, submit or sign claims for anyone, and it never receives or handles settlement payments. Settlement listings come from third-party sources and may be incomplete or out of date. The official settlement notice and website are the final word on deadlines, who qualifies and payments, so check them before you act. We make no promise that the information here is complete, accurate or current, or that you will receive any payment. Settlement payments may be reduced by fees and costs the court approves, such as attorneys' fees. Links to other websites are provided for convenience and do not mean we endorse them.`;

export const APP_SHORT_DISCLAIMER = `ClaimMatch is a free claim assistant, not a law firm, and does not give legal advice. Using this app does not create an attorney-client relationship. You file every claim yourself on the official settlement website.`;
