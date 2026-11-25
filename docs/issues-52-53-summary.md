# Issues #52 and #53 — leftover map

This is a status map, not a close-out. **Do not close, edit, or comment on GitHub issues #52 or #53 from this work.** Software can be “done” while owner, counsel, and store consoles are not.

Verified read-only against production on **2026-11-25**. No staging Supabase project exists. This PR does not apply SQL, flip flags, create accounts, or spend money.

Production flags (leave them): `ONE_CLICK_FILING_ENABLED` is ON. `FEE_DISCLOSURE_ENABLED` and `ASSISTED_FILING_ENABLED` stay off.

---

## Software (in the repo)

Already on `main` before this PR:

- Terms §14 and Privacy one-click collection/sharing/retention live (`8f986d2`).
- One-click filing objects and member/staff flows (migrations 0041–0049 in the repo; see owner section for what production actually has recorded).
- Web public copy is flag-aware (`MAY_FILE_*`, `SETTLEMENT_FILING_COPY`, `lawsuitAiMayFile` / `viewerMayFile`).
- Mobile one-click screens, per-claim `legalDisclaimer` on agent lanes, `GET /api/mobile/config` already sending `flags.ONE_CLICK_FILING_ENABLED`.
- Sign-off checklist rows 1–4 / 4b / 13–14 software built; founder recorded some approvals in `docs/legal/signoff-checklist.md`.

This PR (code + docs leftovers only):

- **A.** Flag-aware mobile copy: onboarding, settlement next steps / how-filing, claim packet note. Reads `ONE_CLICK_FILING_ENABLED` from the existing config client. No new route, flag, migration, dependency, or zod change. When the catalog API has no per-settlement lane, flag-on settlement copy is the generic may-file wording, not `SETTLEMENT_FILING_COPY.agent`.
- **B.** Store listing drafts in `mobile/store.config.json` and `mobile/src/copy/store.ts` (name stays “Lawsuit AI”). Marked draft for counsel. `mobile/eas.json` IDs/secrets untouched.
- **C.** `docs/legal/store-privacy-answers.md` draft mapping one-click data to App Store / Play questionnaires. Photos or Videos added to the iOS privacy manifest because DocumentUploader collects them. Health left as a counsel gap.
- **D.** Migration notes truth-up and owner-only `scripts/record-applied-migrations-0041-0049.sql` (do not run). This summary rewritten so it does not claim the issues can close.

---

## This PR does not finish

| Bucket | Still open | Who |
|---|---|---|
| Counsel | Per-settlement policy/spec sign-off (checklist 5–12), desk procedures (11), store listings + privacy answers + Play Data safety (15) | Counsel |
| Owner | Record 0041–0049 in `supabase_migrations.schema_migrations` if they should be recorded; do **not** apply 0037; do **not** invent timestamps | Owner |
| Owner | Staging Supabase (`docs/STAGING-GO-LIVE.md`) — none yet; do not mark staging applied | Owner |
| Owner | Maestro device run; EAS / App Store / Play submission after row 15 | Owner |
| Owner | `AGENT_AUTH_CURRENT_VERSION=agent-auth-v2` only after 4b + desk sign-off | Owner |
| Owner | After 0049 is *recorded* (it is already present): `OWED_ESTIMATE_HEADER_ENABLED` / `SELF_FILED_REPORT_ENABLED` per `docs/GO-LIVE-ENV.md` — **do not flip in this PR** | Owner |
| Product | D4 monetization; keep fee-disclosure and assisted-filing flags off | Owner |
| Ambiguity | Catalog/settlement API still has no filing lane, so the app cannot mirror web `settlementFilingMode()` per listing without a new payload | Documented; not built |

---

## Owner vs counsel vs this PR

| | Done in software | This PR | Still not an issue close |
|---|---|---|---|
| #52 one-click legal/ops | Terms, privacy, e-sign, agent auth, console, copy constants | Mobile copy + store drafts + privacy-answers draft | Counsel rows 5–12 and 15; owner ops |
| #53 launch leftovers | One-click code path; config flag to the app | Flag-aware mobile/store copy; migration docs + record script (unrun) | Staging, recording 0041–0049, store consoles, Maestro, EAS |

Closing either issue would imply counsel sign-off and owner production bookkeeping that this PR does not do.
