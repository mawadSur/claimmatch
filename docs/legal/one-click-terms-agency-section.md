# DRAFT — for counsel review, not in effect

**One-click filing: proposed agency section for the Terms of Service**

Status: engineering draft for the law firm on retainer (GitHub issue #52, checklist item 1). Nothing here is
live. The live Terms page (`src/app/terms/page.tsx`) is unchanged and must not be edited until the firm
approves final wording. `ONE_CLICK_FILING_ENABLED` stays off until then.

Where the product already shows members a text, this draft quotes or follows it so the Terms and the
in-product text agree. The authorization members sign is `agent-auth-v1` (`agent-auth-v2`, awaiting approval, adds the desk
CAPTCHA sentence) (`src/lib/filing/v2/authorization-text.ts`); the e-signature consent is `esign-v1`
(`src/lib/filing/v2/esign.ts`). Any change to either needs a new version in code.

Notes for counsel are in *italics*. Placeholders are in [brackets].

---

## X. One-click filing: when Lawsuit AI files a claim for you

### X.1 What one-click filing is

For some settlements, Lawsuit AI offers to submit a claim to the settlement administrator for you, as your
agent. We offer it only where the law firm that advises us has reviewed that settlement and approved the
way the claim will be submitted. Everywhere else, you file the claim yourself on the official settlement
website, and Lawsuit AI only helps you prepare.

You never have to use one-click filing. You can always file on the official settlement website yourself,
where filing is free.

### X.2 Scope of each authorization

Each authorization covers **one claim in one settlement**, exactly as you reviewed and signed it. It does
not cover any other claim, any other settlement, or any change to the claim after you sign. If the claim
changes (you edit it, the settlement's form changes, or the way we would submit it changes), your
signature no longer authorizes it and we ask you to review and sign again.

We submit the claim only through the channel named in the authorization you signed:

- **Filing desk**: a Lawsuit AI staff member enters your signed answers on the official claim form in an
  ordinary web browser.
- **Administrator email**: we email the claim, your uploaded documents and the record of your signature to
  the administrator's published claims address, and send you a copy.
- **Bulk file**: we include your individually signed claim in a file the administrator has agreed to
  accept from us.
- **Administrator system**: we pass the claim through a system the administrator provides for that purpose.

We use only channels the law firm approved for that settlement, and a bulk file or administrator system
only after a written agreement with the administrator. *(Engineering: approvals of those channels are
refused without the reviewed source or agreement on file — `src/lib/filing/v2/approval-checks.ts`.)*

### X.3 Your statements and your signature

The claim form may ask you to confirm facts under penalty of perjury. You read that statement word for
word and tick it yourself; we never tick, fill in or type it for you. You then sign by typing your full
legal name. Your typed name is your electronic signature for that claim and has the same effect as your
handwritten signature (see the e-signature consent you gave first).

You are responsible for the truth of what you sign. Only sign if the settlement's class definition
describes you and your answers are true. We do not decide whether you qualify; the settlement
administrator does.

*Counsel: some forms make the submitter swear to facts (for example Kroger, Raging Waters). Those
settlements stay off one-click filing unless you approve `agent_certification_allowed` for them.*

### X.4 Changing your mind

You can withdraw your authorization in Lawsuit AI at any time **before filing starts**. Once filing has
started, contact the settlement administrator about any change; we will tell you how.

*Open founder decision (#52): whether "withdrawn" is final for that claim, or whether a member may start
the same claim again. The code today treats a withdrawn one-click claim as closed.*

### X.5 If we cannot submit your claim in time

If we cannot submit a claim you authorized before our last day for it (we stop taking a claim a few days
before the settlement's deadline, so there is still time), we will tell you by email and in Lawsuit AI,
and return the claim to you with your answers ready so you can file it yourself on the official site.

*Counsel: state what Lawsuit AI owes beyond this notice. The product promises the notice and the
hand-back only (`agent-auth-v1`, last bullet). Decide whether a limitation of liability applies and how
it reads next to the agency relationship.*

### X.6 Identity

We do not verify your identity with a third-party service. Settlements whose administrator requires an
identity check are not offered for one-click filing. You agree to file only your own claim, in your own
name, and never one for another person.

### X.7 Fees and payments

Lawsuit AI does not charge you a fee for a claim filed through one-click filing. Any payment from the
settlement goes to you directly from the settlement administrator, by the payment method you choose. We
never receive, hold or redirect settlement money, and we never ask for bank or card account numbers.

*Open founder decision (#52): the authorization says "does not charge me a fee". Monetization (D4) is
undecided. If a fee is ever introduced it needs a new authorization version, this section rewritten, and
each settlement's `third_party_fee_status` respected.*

### X.8 Checks on the official site

If the official site shows a code by email or text, an identity check or an account login, we stop and
return the claim to you. We never use tools to get past any check on an official site.

*Founder decision (#52, 2026-11-15): a desk staff member may complete a CAPTCHA by hand. The software
offers it only for claims signed under `agent-auth-v2` (drafted in
`src/lib/filing/v2/authorization-text.ts`, awaiting the firm's approval; members keep signing
`agent-auth-v1` until `AGENT_AUTH_CURRENT_VERSION=agent-auth-v2` is set) and only for settlements whose
desk rule a legal_reviewer has turned on (see `docs/legal/filing-desk-procedures.md` section 4). If the
firm approves v2, this paragraph should say the same, for example: "If the official site shows a CAPTCHA
and the settlement allows it, a person at our filing desk may complete it by hand on the official site
for you. We never use a bot or a solving service for it." Design doc section 1 should be updated too.*

### X.9 What we are not

Lawsuit AI is not a law firm, does not give legal advice, and is not affiliated with any settlement,
court, party or settlement administrator. Acting as your agent to submit a claim does not create an
attorney-client relationship.

---

## Lines on the live Terms page that become claim-specific

Design doc section 13, item 1, lists the "never files / not your agent" lines of `src/app/terms/page.tsx`
(about lines 12, 55, 84, 92-98, 138-141). With one-click on, each must say "except where you choose
one-click filing and sign a claim (section X)". The site-wide disclaimer already switches with the flag
(`src/lib/disclaimer-flags.ts`); claim pages now show a per-claim sentence (`claimLegalDisclaimer`).
