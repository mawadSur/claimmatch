/**
 * Lawsuit AI's agent authorization for one-click filing: the text a member
 * accepts with their e-signature, shown and accepted only on an agent lane.
 * claim_signatures stores the server's text and version for the lane signed,
 * never the client's copy. The law firm approves the wording, including what
 * Lawsuit AI owes when it cannot submit a queued claim in time (go-live
 * checklist 4). Any change needs a new version; a published version's text
 * never changes (tests/filing-auth-versions.test.ts pins each one's SHA-256).
 *
 * Disclosures follow the D.C. ClaimClam order (decision memo section 3): not
 * affiliated with the settlement, filing on the official site is free,
 * payment is not guaranteed, and nothing suggests filing yourself is riskier.
 *
 * agent-auth-v1: the desk agent stops at any code, robot check or identity check.
 * agent-auth-v2 (founder decision 2026-11-15): the same text, except a person
 *   at the desk may complete a CAPTCHA by hand on the official site.
 * agent-auth-v3: v2 how-it-will-be-submitted, plus membership (7-day free
 *   trial, then $19.99/month) and no percentage of settlement payments.
 *   Not yet in production; v1 and v2 text never change.
 *
 * Members sign the current version via AGENT_AUTH_CURRENT_VERSION. With that
 * unset, SUBSCRIPTION_BILLING_ENABLED defaults new signatures to v3. Existing
 * signatures keep the version they were signed under. v1 and v2 text never
 * changes.
 */
import { CLAIMMATCH_TRIAL_DAYS, membershipPriceCopy } from '@/lib/copy';
import { flags } from '@/lib/flags';
import type { AgentChannel, DeskChallengeMode } from './contract-spec';

export const AGENT_AUTH_V1 = 'agent-auth-v1';
export const AGENT_AUTH_V2 = 'agent-auth-v2';
export const AGENT_AUTH_V3 = 'agent-auth-v3';
/** Every version this server can show and explain; a signature stores one of these. */
export const AGENT_AUTHORIZATION_VERSIONS = [AGENT_AUTH_V1, AGENT_AUTH_V2, AGENT_AUTH_V3] as const;
export type AgentAuthorizationVersion = (typeof AGENT_AUTHORIZATION_VERSIONS)[number];

/**
 * The version new members sign now:
 *   AGENT_AUTH_CURRENT_VERSION=agent-auth-v3 → v3
 *   AGENT_AUTH_CURRENT_VERSION=agent-auth-v2 → v2
 *   AGENT_AUTH_CURRENT_VERSION=agent-auth-v1 → v1
 *   unset + SUBSCRIPTION_BILLING_ENABLED=1 → v3
 *   otherwise → v1
 * Existing signatures keep the version they were signed under.
 */
export function currentAuthorizationVersion(): AgentAuthorizationVersion {
  if (flags.agentAuthV3()) return AGENT_AUTH_V3;
  if (flags.agentAuthV2()) return AGENT_AUTH_V2;
  if (flags.agentAuthV1()) return AGENT_AUTH_V1;
  return flags.subscriptionBilling() ? AGENT_AUTH_V3 : AGENT_AUTH_V1;
}

const HOW_V1: Readonly<Record<AgentChannel, string>> = {
  filing_desk:
    'A Lawsuit AI filing agent will enter this claim on the official claim form in an ordinary web browser, using only what I signed. If the official site asks for a code, a robot check or an identity check, the agent will stop and the claim will come back to me.',
  administrator_email:
    'Lawsuit AI will email this claim, with the documents I uploaded and the record of my signature, to the settlement administrator’s published claims address, and will email me a copy.',
  administrator_bulk:
    'Lawsuit AI will include this individually signed claim in a file it uploads to the settlement administrator, in the format the administrator asks for.',
  administrator_api:
    'Lawsuit AI will pass this claim to the settlement administrator through the administrator’s own claims system.',
};

const HOW_V2: Readonly<Record<AgentChannel, string>> = {
  ...HOW_V1,
  filing_desk:
    'A Lawsuit AI filing agent will enter this claim on the official claim form in an ordinary web browser, using only what I signed. If the official site shows a CAPTCHA or a similar check that I am not a robot, a person at the Lawsuit AI filing desk may complete it by hand on the official site on my behalf. Lawsuit AI never uses a bot or a solving service for it and never gets around it. If the official site asks for a code or an identity check, the agent will stop and the claim will come back to me.',
};

const HOW: Readonly<Record<AgentAuthorizationVersion, Readonly<Record<AgentChannel, string>>>> = {
  [AGENT_AUTH_V1]: HOW_V1,
  [AGENT_AUTH_V2]: HOW_V2,
  [AGENT_AUTH_V3]: HOW_V2,
};

function isKnownVersion(version: string): version is AgentAuthorizationVersion {
  return (AGENT_AUTHORIZATION_VERSIONS as readonly string[]).includes(version);
}

function feeBullet(version: AgentAuthorizationVersion): string {
  if (version === AGENT_AUTH_V3) {
    return (
      `- Lawsuit AI does not take a percentage of my settlement payment. Easy submit is included with my Lawsuit AI membership (${CLAIMMATCH_TRIAL_DAYS}-day free trial, then ${membershipPriceCopy()}/month, cancel anytime). Filing a claim myself on the official settlement site is free.`
    );
  }
  return '- Lawsuit AI does not charge me a fee for this claim. Filing a claim myself on the official settlement site is free.';
}

/** The authorization text for one agent channel (the lane the member signs for), under `version` (default: the current one). */
export function agentAuthorizationText(lane: AgentChannel, version: AgentAuthorizationVersion = currentAuthorizationVersion()): string {
  return [
    'Authorization for Lawsuit AI to act as my agent for this claim',
    'I authorize Lawsuit AI to submit this one claim to the settlement administrator as my agent, exactly as I reviewed and signed it. This authorization covers this claim only, not any other claim or settlement.',
    `How it will be submitted: ${HOW[version][lane]}`,
    'I understand that:',
    '- Lawsuit AI gives the settlement administrator my name, contact details and the answers in this claim, so the administrator can contact me directly about it.',
    '- Any payment from the settlement comes to me directly from the settlement administrator, by the payment method I chose. Lawsuit AI never receives, holds or redirects settlement money.',
    feeBullet(version),
    '- Lawsuit AI is not a law firm and is not affiliated with the settlement, the court, the parties or the settlement administrator. The settlement administrator decides who qualifies, and payment is not guaranteed.',
    '- I can withdraw this authorization in Lawsuit AI at any time before filing starts. After filing starts, I should contact the settlement administrator about any change.',
    '- If Lawsuit AI can’t submit this claim in time, it will tell me by email and in Lawsuit AI while there is still time before the deadline, and the claim will come back to me with my answers ready, so I can file it myself on the official site.',
  ].join('\n');
}

/** The text of a version and lane, or null for a version this server does not offer. */
export function authorizationTextFor(version: string, lane: AgentChannel): string | null {
  return isKnownVersion(version) ? agentAuthorizationText(lane, version) : null;
}

/**
 * The authorization versions whose desk text tells the member a desk agent
 * may complete a CAPTCHA by hand: agent-auth-v2 and agent-auth-v3.
 * agent-auth-v1 says the agent stops at any robot check, so a claim signed
 * under v1 is always filed under 'stop', whatever the settlement's rule
 * (0045) says later. Under v2/v3 the settlement's 'staff_completes_captcha'
 * rule still has to be on.
 */
export const VERSIONS_COVERING_STAFF_CAPTCHA: ReadonlySet<string> = new Set<string>([AGENT_AUTH_V2, AGENT_AUTH_V3]);

/** The challenge rule that actually applies to a claim signed (or to be signed) under `authorizationVersion`. */
export function effectiveDeskChallengeMode(
  mode: DeskChallengeMode | undefined,
  authorizationVersion: string = currentAuthorizationVersion(),
  covering: ReadonlySet<string> = VERSIONS_COVERING_STAFF_CAPTCHA,
): DeskChallengeMode {
  return mode === 'staff_completes_captcha' && covering.has(authorizationVersion) ? 'staff_completes_captcha' : 'stop';
}
