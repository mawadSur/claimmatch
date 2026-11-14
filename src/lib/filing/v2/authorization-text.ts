/**
 * Lawsuit AI's agent authorization for one-click filing (agent-auth-v1): the
 * text a member accepts with their e-signature, shown and accepted only on an
 * agent lane. claim_signatures stores the server's text for the lane signed,
 * never the client's copy. The law firm approves the wording, including what
 * Lawsuit AI owes when it cannot submit a queued claim in time (go-live
 * checklist 4). Any change needs a new AGENT_AUTHORIZATION_VERSION.
 *
 * Disclosures follow the D.C. ClaimClam order (decision memo section 3): not
 * affiliated with the settlement, filing on the official site is free,
 * payment is not guaranteed, and nothing suggests filing yourself is riskier.
 */
import type { AgentChannel } from './contract-spec';

export const AGENT_AUTHORIZATION_VERSION = 'agent-auth-v1';

const HOW: Readonly<Record<AgentChannel, string>> = {
  filing_desk:
    'A Lawsuit AI filing agent will enter this claim on the official claim form in an ordinary web browser, using only what I signed. If the official site asks for a code, a robot check or an identity check, the agent will stop and the claim will come back to me.',
  administrator_email:
    'Lawsuit AI will email this claim, with the documents I uploaded and the record of my signature, to the settlement administrator’s published claims address, and will email me a copy.',
  administrator_bulk:
    'Lawsuit AI will include this individually signed claim in a file it uploads to the settlement administrator, in the format the administrator asks for.',
  administrator_api:
    'Lawsuit AI will pass this claim to the settlement administrator through the administrator’s own claims system.',
};

/** The authorization text for one agent channel (the lane the member signs for). */
export function agentAuthorizationText(lane: AgentChannel): string {
  return [
    'Authorization for Lawsuit AI to act as my agent for this claim',
    'I authorize Lawsuit AI to submit this one claim to the settlement administrator as my agent, exactly as I reviewed and signed it. This authorization covers this claim only, not any other claim or settlement.',
    `How it will be submitted: ${HOW[lane]}`,
    'I understand that:',
    '- Lawsuit AI gives the settlement administrator my name, contact details and the answers in this claim, so the administrator can contact me directly about it.',
    '- Any payment from the settlement comes to me directly from the settlement administrator, by the payment method I chose. Lawsuit AI never receives, holds or redirects settlement money.',
    '- Lawsuit AI does not charge me a fee for this claim. Filing a claim myself on the official settlement site is free.',
    '- Lawsuit AI is not a law firm and is not affiliated with the settlement, the court, the parties or the settlement administrator. The settlement administrator decides who qualifies, and payment is not guaranteed.',
    '- I can withdraw this authorization in Lawsuit AI at any time before filing starts. After filing starts, I should contact the settlement administrator about any change.',
    '- If Lawsuit AI can’t submit this claim in time, it will tell me by email and in Lawsuit AI while there is still time before the deadline, and the claim will come back to me with my answers ready, so I can file it myself on the official site.',
  ].join('\n');
}

/** The text of a version and lane, or null for a version this server does not offer. */
export function authorizationTextFor(version: string, lane: AgentChannel): string | null {
  return version === AGENT_AUTHORIZATION_VERSION ? agentAuthorizationText(lane) : null;
}
