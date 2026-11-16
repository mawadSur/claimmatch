1	# DRAFT — for counsel review, not in effect
2	
3	**One-click filing: law-firm sign-off checklist (GitHub issue #52)**
4	
5	**Production (2026-11-16):** `ONE_CLICK_FILING_ENABLED=1` is on per founder directive after counsel review of linked drafts. Rows below remain the sign-off record for counsel and ops before scaling real administrator filings. For each item: what
6	the firm approves, and the exact file, setting or admin screen where that approval is recorded or takes
7	effect. "Console" means `/admin/filing` (signed-in staff; legal_reviewer actions are enforced again by
8	the database, migrations 0042 and 0045).
9	
10	| # | Item | What the firm approves | Where it is approved / takes effect | Software status |
11	|---|---|---|---|---|
12	| 1 | Terms: agency section | Final wording of the agency section | Draft: `docs/legal/one-click-terms-agency-section.md`. Takes effect when engineering ports it into `src/app/terms/page.tsx` | Draft ready; live page untouched |
13	| 2 | Privacy additions | Final wording | Draft: `docs/legal/one-click-privacy-additions.md`. Live: `src/app/privacy/page.tsx` | Draft ready; live page untouched. Data export of one-click records not built |
14	| 3 | E-SIGN consent | Text and version `esign-v1` | `src/lib/filing/v2/esign.ts` (`ESIGN_TEXT_V1`). A wording change means a new `ESIGN_TEXT_VERSION` | Built |
15	| 4 | Agent authorization | Text `agent-auth-v1`, per channel, incl. what Lawsuit AI owes on a miss | `src/lib/filing/v2/authorization-text.ts`. A wording change means a new version (`AGENT_AUTHORIZATION_VERSIONS`); a published version's text is pinned by SHA-256 in `tests/filing-auth-versions.test.ts` | Built |
16	| 4b | Agent authorization v2 (desk CAPTCHA) | Text `agent-auth-v2`: identical to v1 except the desk paragraph, which says a person at the filing desk may complete a CAPTCHA or similar robot check by hand on the official site on the member's behalf, never with a bot or solving service and never by getting around it; codes and identity checks still stop. Fee wording unchanged | `src/lib/filing/v2/authorization-text.ts` (`HOW_V2.filing_desk`). Takes effect only when the founder sets Vercel env `AGENT_AUTH_CURRENT_VERSION=agent-auth-v2` after this sign-off (default v1); claims already signed keep v1 and still stop at CAPTCHAs | Built, not in effect |
17	| 5 | Per-settlement sign-off | Each policy version (with its sources) and each spec version (verbatim statement, class definition, questions) | Console, `/admin/filing/settlements/{id}`: Policies and Spec panels, "Approve" (legal_reviewer only; records reviewer, time, notes, documents reviewed; a draft edited after reading is refused) | Built |
18	| 6 | Agent certifications | Whether a form where the submitter swears to facts may be filed by an agent | Same screen, policy field "Allow agent certification" (`agent_certification_allowed`). Off by default; a spec with `requires_agent_certification` stays self-file without it | Built and enforced (`chooseLane`, Jev) |
19	| 7 | Fee status | `lawsuits.third_party_fee_status` per settlement | `/admin/catalog` (fee status column). This build charges no fee; payout always to the member | Built (recorded and shown; no fee is charged, so it gates nothing) |
20	| 8 | Account deletion vs legal records | `delete`, `anonymize_and_retain` or `retain`; and the archive period | Vercel env `LEGAL_RECORDS_ON_ACCOUNT_DELETION` (default `delete`) and `LEGAL_RECORD_RETENTION_DAYS` (default 2555). See `docs/legal/retention-schedule.md` | Built (0045 archive, fail-closed) |
21	| 9 | Health consent | Consent text for each health-sensitive settlement (WA My Health My Data Act) | Settlement screen, policy fields "Health-sensitive settlement" and "Health consent text". Without the text, flagged answers and documents are never collected and the claim is self-file | Built and enforced |
22	| 10 | States | The states the firm covers, per policy | Policy field "States the law firm covers" (`allowed_states`; required when agent filing is allowed; administrator level can only narrow it) | Built and enforced |
23	| 11 | Filing desk procedures | The procedure | Draft: `docs/legal/filing-desk-procedures.md`. Desk rules shown on `/admin/filing/desk` | Draft ready; software built |
24	| 12 | Channels | Each administrator claims address verified at its source; written agreement before bulk or API; objections honored within 24h | Policy "Channels" editor. Approval is refused unless an enabled email channel's `published_at_url` is among the documents reviewed, and an enabled bulk or API channel has a reviewed "Administrator letter" (`src/lib/filing/v2/approval-checks.ts`). Objections and kill switch: Controls panel | Built (new approval checks); API adapters do not exist, so the API channel can never be chosen |
25	| 13 | Copy: per-claim disclaimers | The per-claim sentences | `src/lib/copy.ts`: `CLAIM_AGENT_LEGAL_SENTENCE`, `PREFILL_AGENT_LANE_NOTE`, `ONE_CLICK_AGENT_NOTE`, `MAY_FILE_*`. Applied by `claimLegalDisclaimer` and `claimFiledByLawsuitAi` | Built (web). Mobile app copy not changed |
26	| 14 | Retention periods | Documents 90 days, Jev runs, signatures, audit log | `docs/legal/retention-schedule.md`; settings `JEV_PARTIAL_RUN_RETENTION_DAYS`, `LEGAL_RECORD_RETENTION_DAYS`; constant `DOCUMENT_RETENTION_DAYS` | Built |
27	| 15 | App stores (later) | Store listings, iOS privacy manifest, App Store privacy answers, Play Data safety | Not started | Not built |
28	
29	## Founder decisions (#52)
30	
31	Decided by the founder on 2026-11-15:
32	
33	| Decision | Founder decision (2026-11-15) | What is built | Where |
34	|---|---|---|---|
35	| Desk stops at CAPTCHAs: per-settlement switch? | Yes: filing-desk staff may complete a CAPTCHA by hand when filing for a member | Switch built, default "stop" everywhere; only a legal_reviewer changes it, with notes, audited. It applies only to claims signed under `agent-auth-v2` (item 4b), which members sign once counsel approves it and `AGENT_AUTH_CURRENT_VERSION=agent-auth-v2` is set. A v1-signed claim always stops. Codes, identity checks and logins always stop | Console, settlement Controls panel, "Desk rule for checks on the official form"; `filing_controls.desk_challenge_mode` (0045); `VERSIONS_COVERING_STAFF_CAPTCHA` and `effectiveDeskChallengeMode` in `authorization-text.ts`; `docs/legal/filing-desk-procedures.md` section 4 |
36	| "Withdrawn" is final? | Yes: withdrawn claims are final | The app never moves a claim out of withdrawn (one-click state machine; self-file model; one-click start refuses it), 0042 refuses withdrawn to any one-click status, and 0048 refuses any status change out of withdrawn in the database | `src/lib/filing/v2/contract-base.ts` `CLAIM_TRANSITIONS`, `src/lib/claims.ts`, `supabase/migrations/0048_withdrawn_final.sql`; tests `tests/claims-withdrawn-final.test.ts`, `supabase/tests/81_withdrawn_final.sql` |
37	| "Does not charge me a fee" while D4 is undecided? | Keep the wording for now; monetization gets a deep founder review later | Text unchanged in v1 and v2 | `agent-auth-v1`, `agent-auth-v2` |
38	
39	## Sign-off record
40	
41	| # | Approved by | Date | Version / setting approved | Notes |
42	|---|---|---|---|---|
43	| 1 | | | | |
44	| 2 | | | | |
45	| 3 | | | esign-v1 | |
46	| 4 | | | agent-auth-v1 | |
47	| 4b | | | agent-auth-v2; then AGENT_AUTH_CURRENT_VERSION = agent-auth-v2 | |
48	| 5 | (per settlement, in the console) | | | |
49	| 6 | (per settlement, in the console) | | | |
50	| 7 | (per settlement, in the catalog) | | | |
51	| 8 | | | LEGAL_RECORDS_ON_ACCOUNT_DELETION = | |
52	| 9 | (per settlement, in the console) | | | |
53	| 10 | (per policy, in the console) | | | |
54	| 11 | | | | |
55	| 12 | (per policy, in the console) | | | |
56	| 13 | | | | |
57	| 14 | | | | |
58	| 15 | | | | |
59	