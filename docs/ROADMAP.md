# ClaimMatch — Product Roadmap & CEO Plan

Output of a founder-mode review (`/plan-ceo-review`), 2026-07-03. This is the
strategy and build order, not a code change. Decisions below were taken on the
review's recommended defaults (the user was away); revisit any of them before
committing real money or engineering.

## Strategy (locked defaults, revisit freely)

| Decision | Choice | Why |
| --- | --- | --- |
| Business model | **Free + referral / lead fees** | Prove demand first. No money-handling, no attestations, lowest legal risk, fastest to revenue. Earn by routing qualified claimants to partner claims-services / firms. |
| Filing depth | **Pre-fill + deep-link, user submits** | Most claim forms require the claimant to attest personally under penalty of perjury. We fill every field and one-tap them to the official form; they submit. Magical and safe. |
| First build | **LLM extraction + real-data pipeline** | The moat is a fresh, accurate, structured settlement database. The UI is copyable in a day; the data is not. |

## The 10x vision

Not a search engine for lawsuits. A **passive money-recovery autopilot that
talks to you**: "We watch every settlement in the US. The day you qualify, you
get a text: 'You're owed ~$180, tap to file.' You tap. Later: 'Your check
shipped.'" A finder is a one-time visit; an autopilot is a relationship.

## Hard truths to design around

1. **Trust is existential.** This space is scam-adjacent. Every settlement must
   link to the official court/administrator page and name the administrator
   (JND, Angeion, Epiq). Users' first thought is "is this phishing for my SSN?"
2. **Legal wall on auto-filing.** Personal attestation under penalty of perjury +
   per-state unauthorized-practice-of-law rules. Stay at pre-fill + deep-link
   until counsel clears anything more.
3. **Payouts are slow (6-18 months).** Set the expectation in the UI so "no money
   yet" reads as normal, not broken. Then celebrate the check when it lands.
4. **Data accuracy is a liability.** Telling someone they qualify when they don't,
   or missing a deadline, burns trust permanently. Gate low-confidence data
   behind human review before it goes live.

## Automation pipeline (target architecture)

```
1 INGEST  → 2 EXTRACT(LLM) → 3 VERIFY/REVIEW → 4 MATCH → 5 NOTIFY → 6 FILE → 7 TRACK → 8 LEARN
```

- **Ingest**: crawl settlement-admin sites, aggregators, state AG pages, dockets. Snapshot raw HTML. (Vercel Cron / queue.)
- **Extract (LLM)**: Claude turns raw settlement text into a structured record — eligibility as machine-readable JSON (states, date ranges, product lists, proof-required), payout, deadline, claim URL, admin name — with a **confidence score**.
- **Verify/Review**: dedupe, detect changes (deadline moved, closed), route low-confidence extractions to a **human review queue** before they go live.
- **Match**: recompute on new settlement or updated user; LLM assists ambiguous cases.
- **Notify**: email/SMS/push, digest cadence per user.
- **File**: Tier 1 pre-fill + deep-link (now). Tier 2 assisted e-sign (later, with counsel).
- **Track**: watch claim status + expected payout window; notify on payment.
- **Learn**: feed conversion + wrong-match signals back into matching and extraction.

Run it event-driven with a job queue (Inngest or QStash, both Vercel-native) and
idempotent workers, not one monolithic cron. Instrument extraction confidence,
per-source success, match volume, deliverability, and match→file conversion from
day one.

## Build order

### Phase 1 — Data moat (LLM extraction + review queue) ← next
- LLM extraction stage: raw settlement text → structured `ScrapedLawsuit` + confidence, using Claude.
- `lawsuits.review_status` + confidence column; low-confidence rows stay out of the public catalog.
- Minimal admin **review queue**: approve / edit eligibility JSON / publish.
- Wire 1-2 real ingest sources into the existing `src/lib/scraper/` framework.
- Outcome: the catalog fills itself with real, accurate settlements.

### Phase 2 — Activation magic
- 5-question onboarding that ends in a personalized **"You're owed ~$X"** estimate.
- **File-all**: one-tap pre-fill + deep-link across all no-proof matches.
- Trust surface: administrator names, official-page links, "why we're not a scam."

### Phase 3 — Autopilot + retention
- SMS/push alerts on new matches; digest preferences.
- **Money tracker**: claimed / received / expected-payout window per claim.
- Profile-completeness meter ("answer 3 more → unlock ~4 matches").
- Referral loop.

### Phase 4 — Full admin + monetization
- Full admin dashboard: ingest health, conversion analytics, growth, abuse watch.
- Partner referral integration + revenue reporting.
- Revisit filing Tier 2 (assisted e-sign) with legal counsel.

## Dashboards

**User** — hero "estimated total you're owed" + open matches; action list split
File-now / Needs-your-info; claims tracker (Filed → Under review → Approved →
Paid, receipt #, payout window, amount); received-to-date; profile-completeness
meter; new-this-week; alert settings.

**Admin** — ingest health (sources, last run, error rate, confidence histogram);
**review queue** (approve/edit/publish extractions); catalog management
(edit/feature/close/dedupe); match & conversion analytics; growth metrics;
abuse/fraud watch; revenue.

## Explicitly NOT in scope now
- Handling users' money or taking a % of recovery (revisit only if the model changes).
- Fully automated filing on the user's behalf (legal wall).
- Native mobile apps (web-first; the alerts are SMS/email/push).
- Court-docket/PACER ingestion (start with admin sites + aggregators).

## Open questions for the founder
1. Confirm business model — the review assumed free + referral fees.
2. Which real ingest sources to start with (and their ToS posture)?
3. Appetite for the legal review needed to unlock assisted filing later?
```
