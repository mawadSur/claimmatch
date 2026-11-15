# DRAFT — for counsel review, not in effect

**Filing desk procedures (one-click filing, channel `filing_desk`)**

Status: engineering draft (GitHub issue #52, checklist item 11). Written from what the desk software does
today. The firm approves the procedure; the founder trains every `filing_agent` on it before the first job.

## 1. Who works the desk

- Only staff holding the `filing_agent` role (`staff_roles`). A legal_reviewer or an admin grants it
  (`/api/admin/filing/roles`); only a legal_reviewer grants legal_reviewer.
- Every packet view, document download, result and resolution is written to `filing_audit_log` first; if
  that write fails, the screen refuses to show the member's data.

## 2. Taking a job

1. Open `/admin/filing/desk` and press "Take the next job". The job is locked to you for 30 minutes.
2. The screen shows the claim exactly as the member signed it (re-checked against its SHA-256), in the
   official form's field order, with a copy button per field; proof documents download through 5-minute
   links; the pre-send check (Jev) result is shown.
3. If the pre-send check **blocks**, do not submit. Record the result it asks for.

## 3. Filing

- Use your own normal browser. Open the official form from the job screen yourself, paste each value
  exactly as shown, and submit it yourself. Lawsuit AI never fills, scripts, embeds or proxies official
  claim sites, and you must not use extensions, autofill tools or scripts for it.
- Send only what the member signed. Never add, change or guess an answer. Never enter bank, card or payout
  account details: payment goes to the member.
- After submitting, take a screenshot of the confirmation page and upload it to the job (staff evidence;
  members never see it). Record "Filed" with the administrator's confirmation number if one is shown.

## 4. Checks on the official site (CAPTCHA hard stop)

**Default for every settlement: stop.** If the site shows a CAPTCHA, a code by email or text, an identity
check or a login, stop. Do not solve it or ask anyone to. Record "Stopped at a check" and which one; the
claim goes back to the member to finish on the official site.

Per-settlement switch (open founder decision on #52, built, off everywhere):

- A legal_reviewer may set a settlement's desk rule to "Staff may complete a CAPTCHA by hand" on
  `/admin/filing/settlements/{id}` (Controls), with notes on what the firm reviewed (the site's terms, the
  administrator's position). The change is audited (`desk_challenge_rule_set`). Only a legal_reviewer can
  change it either way; the database also refuses anyone else loosening it (0045).
- Under that rule the desk agent may complete a CAPTCHA the site shows them, personally, by hand, in their
  own browser. Never with a tool, extension, solving service or another person. Codes by email or text,
  identity checks and account logins remain a hard stop.
- **It has no effect yet.** `agent-auth-v1`, the authorization members sign, says the agent will stop at a
  robot check. The rule applies only to claims signed under a new authorization version that says
  otherwise, once the firm approves it and engineering adds it to `VERSIONS_COVERING_STAFF_CAPTCHA`
  (`src/lib/filing/v2/authorization-text.ts`). A claim signed under an older version is always filed under
  "stop", and its job screen says so.

## 5. Capacity and service level

- Each settlement's desk channel sets `daily_capacity` (default 10 claims a day) and `sla_business_days`
  (default 2). New claims are not offered the desk when open desk jobs reach
  `daily_capacity × sla_business_days`; members then file themselves.
- Each job has a due time (`due_by`) within the SLA and never after the channel's last day before the
  deadline (`min_days_before_deadline`, default 5). The cron alerts staff about overdue desk jobs and about
  any `needs_attention` job, marked URGENT within 3 days of a deadline.
- Claims Lawsuit AI can no longer take (cutoff passed, kill switch, objection, policy or spec change) go
  back to the member automatically with a notice while there is still time.

## 6. When you are not sure it went through (`needs_attention`)

Record "Not sure whether it went through" whenever the site errored after you pressed submit, your
session timed out, or you cannot tell. A lock that runs out while you hold a job does the same. **Never
submit it a second time.** Resolution, by a filing_agent or legal_reviewer, before the deadline:

1. Check first, without submitting: the confirmation email or page, the administrator's claim lookup on the
   official site, or ask the administrator directly (written, with the member's name and the time of the
   attempt).
2. Record what you found (`/admin/filing/desk`, Resolve):
   - "Checked: it went through" (with the number if you have it) — the claim is marked filed.
   - "Checked: the administrator refused it" — the member is told.
   - "Checked: nothing was sent, put it back in the queue" — only when you are sure nothing reached the
     administrator.
   - "Hand it back to the member" — when you cannot find out in time; the member gets the claim back with
     a notice and files it themselves. Tell them it may already have been received, so they check with the
     administrator before filing again.
3. Within 3 days of the deadline, escalate to a legal_reviewer the same day.

## 7. What staff may never do

- Never solve, relay, time or hand on a check for software, and never use tools to get past one.
- Never fill a sworn statement, eligibility line or consent box for a member, or file something the member
  did not sign.
- Never ask a member for, or enter, a PIN, passcode, one-time code, password, or bank/card details.
- Never submit the same claim twice, or retry a claim that may have been submitted.
- Never copy member data out of the desk screen except into the official form, and never keep it.
- Never file for a settlement whose kill switch is on or that has an objection on record.

## 8. Objections and kill switch

Anyone in the console turns a kill switch on, effective at once (pending jobs go back to members on the
next run; pre-send checks block). An administrator's objection is recorded the same way and honored
within 24 hours. Only a legal_reviewer turns the kill switch off or clears an objection.
