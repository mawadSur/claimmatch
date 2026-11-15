# DRAFT — for counsel review, not in effect

**One-click filing: proposed additions to the Privacy Policy**

Status: engineering draft for the law firm (GitHub issue #52, checklist item 2). The live Privacy page
(`src/app/privacy/page.tsx`) is unchanged and must not be edited until the firm approves final wording.
Each paragraph below lists, in italics, the code that makes it true, so the firm can check the text
against what the software does.

---

## A. When you use one-click filing, we act as your agent

When you sign a claim with one-click filing, we send that claim to the settlement administrator on your
behalf, as your agent, through the channel named in what you signed. We give the administrator your name,
contact details, mailing address, your answers to the claim form's questions, any documents you uploaded
for the claim, and the record of your signature, so the administrator can process your claim and contact
you about it. The administrator handles that information under its own privacy policy.

*Code: the signed packet (`claim_signatures.packet_canonical`) is the only source of what is sent; the
email channel copies the member (`src/lib/filing/channels/administrator-email.ts`).*

## B. What we collect for one-click filing

Only for claims you choose to file with one-click filing, and only what that settlement's form asks for:

- **Claim details**: your ZIP code and other address details, your answers to the settlement's questions
  in the official form's wording, the benefit option and the payout method's name (never account numbers).
- **Notice or claim IDs**: only when you type one for that claim. We never collect PINs, passcodes or
  one-time codes.
- **Photos and documents** you upload as proof, stored in private storage.
- **Your e-signature record**: the exact text you signed, your typed name, the time, how and when you last
  signed in, your session, IP address and browser (user agent).
- **Your e-signature consent**: the consent text and version you agreed to, when, your IP address and
  browser.
- **Health information**: only for settlements where the law firm provided consent text, and only after you
  tick that consent for that claim (Washington My Health My Data Act).
- **Check results**: the results of our automatic checks of your claim (we call them Jev).
- **Filing records**: how and when your claim was submitted, the administrator's confirmation number, and
  screenshots our staff take of the confirmation page.
- **Your saved mailing address**, when you choose to save it to your profile for future claims.

*Code: tables in `supabase/migrations/0041_one_click_filing.sql`; notice IDs only as question type
`notice_id`; `NEVER_COLLECTED_LABEL_RE` refuses PIN/passcode fields in specs; health answers gated by
`health_consent_text` and the member's tick (`src/lib/filing/channels/lane.ts`).*

*Counsel: the saved mailing address (`profiles.address_*`, `prefill_consent_at`) is collected today by
the self-file copy panel too, and the current Privacy page does not mention it.*

## C. Who sees it at Lawsuit AI

Only staff with a filing role see a member's signed claim and documents, and every view is logged.

*Code: `canViewMemberFilingData` in `src/lib/staff-roles.ts`; `recordStaffAccess` writes
`filing_audit_log` and the response is refused if that write fails.*

## D. Service providers

- **Supabase** stores your account, claims and uploaded documents (database and private file storage).
- **Resend** sends emails, including claims we email to an administrator for you and your copy of them.
- **Vercel** hosts the website and app server.

*Counsel: confirm the list against the current processor agreements. PostHog analytics never receives
claim answers or documents.*

## E. How long we keep it

See `docs/legal/retention-schedule.md` for the full schedule with its settings. In short: uploaded proof
documents are deleted 90 days after your claim is finished (or after the settlement's deadline window);
signature, consent and filing records are kept while your account exists; the log of staff access is kept.

## F. Deleting your account

When you delete your account, we delete your one-click claims, packets, uploads and check results.
[Choose one, per the firm's decision on checklist item 8:]

- **Option 1 (delete, today's behavior):** your signature, consent and filing records are deleted too.
- **Option 2 (anonymize and retain):** we keep a copy of your signature, consent and filing records without
  your name, address, answers, IP address, browser or account ID, for [7] years, as a record of what was
  agreed and filed; then it is deleted.
- **Option 3 (retain):** we keep your signature, consent and filing records, including staff screenshots of
  the confirmation page, for [7] years after deletion, because we may need them to answer an
  administrator, a court or you; then they are deleted.

The log of staff access to your data keeps your member ID (not your name) after deletion.

*Code: one setting, `LEGAL_RECORDS_ON_ACCOUNT_DELETION` = `delete` (default) | `anonymize_and_retain` |
`retain`, in `src/lib/filing/legal-records.ts`; archive table `filing_legal_record_archive` (0045);
period `LEGAL_RECORD_RETENTION_DAYS` (default 2555 days). The keeping modes fail closed: if the copy
cannot be written, the account is not deleted.*

## G. Your copy of your data

*Not built yet: the account data export (`src/app/api/account/export`) does not include one-click
packets, documents, signatures or consents (design doc section 12). Either build it before go-live or
say how a member requests them.*
