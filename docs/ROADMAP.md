# ClaimMatch roadmap

_Last updated 2026-10-16. This replaces the July 2026 roadmap, which no longer
describes the product. Do not bring back copy or features from it._

## The product

ClaimMatch is a free claim assistant for class-action settlements. People find
settlements that are open for claims, check whether they qualify on the official
notice, file on the official administrator's site themselves, and keep track of
their claims in ClaimMatch.

- ClaimMatch never files or submits a claim for anyone, never handles settlement
  money, and never takes a cut. Payments go from the administrator to the user.
- Claim statuses change only on evidence: "Not filed yet", then "Reported filed
  by you", and "Submitted" only with the administrator's confirmation number.
- No dollar totals, invented amounts or percentage scores. Payment details are
  shown only as the source states them.
- No health questions. Email only, with no text messages for now.

## Now: trust reset

- Remove fictional listings and any fallback to sample data in production.
- Honest claim statuses on every screen.
- Honest public copy, and interim Terms and Privacy pending legal review.
- Label every listing "Unverified: check the official site", with the official
  link. No match list, match emails or weekly digest until records are verified.
- A working unsubscribe and an owned sending domain.

## Next

1. **Verified settlement records.** Each listing is checked against the official
   notice and re-checked on a schedule. Suggestions return only after this, with
   plain-language reasons.
2. **Claim packet polish and tracking.** Pre-filled claim packets (the user's
   details, ready to copy into the official form) already ship on the claim
   page. Next is verified-record tracking: reported filings, confirmation
   numbers and reminders, after listings are checked against the official notice.

## Later, only with approval

- Filing as the user's authorized agent, only after counsel review and with
  written permission from each settlement administrator. Until then, users file
  on the official site.

## Not doing

- Taking a share of any settlement, or holding or routing settlement money.
- Collecting health information.
