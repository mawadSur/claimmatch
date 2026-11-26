# Top 20 listing verification (2026-11-26)

Checked against the official settlement sites named in `lawsuits.claim_url`
(or the site’s homepage when the claim URL is a login/form). **No production
writes.** Suggested catalog fixes are in
`supabase/owner-apply/top20-verification-2026-11.sql` (unapplied).

## How these 20 were chosen

`payout_max` is null on almost every open row, so this is not a traffic
ranking (we do not invent visit counts). Ranking is:

1. Open, published listings whose `typical_payout` states a dollar amount
   (per-person or fund total as the listing already shows it).
2. High-interest official-notice guides already in the repo (RealPage, Deere,
   Toyota ACU, Hyundai/Kia theft and ACU, Kroger, SeatGeek).

Checked on 2026-11-26. Deadlines are the **claim** deadline on the official
site unless noted. Proof and action type follow
`docs/claim-action-surfaces.md`: Easy submit is `desk_file` only.

| # | Slug | Catalog deadline | Catalog type | Official site | Official claim deadline | Proof | Action type vs site | Result |
|---|------|------------------|--------------|---------------|-------------------------|-------|---------------------|--------|
| 1 | `realpage-rental-software-antitrust-settlement` | 2027-01-29 | desk_file | [realpagerentalsettlement.com](https://www.realpagerentalsettlement.com/) | 2027-01-29 (online or received, 11:59 p.m. EST) | Supporting docs if applicable | Online/mail claim form. `desk_file` is Easy submit policy, not a site mismatch. | Match. No SQL. |
| 2 | `john-deere-repair-services-antitrust-settlement` | 2026-12-31 | desk_file | [deererepairsettlement.com](https://www.deererepairsettlement.com/) | 2026-12-31 | Claim form required; no receipts on homepage | Same as RealPage: site is a claim form; `desk_file` is policy. | Match. No SQL. |
| 3 | `toyota-airbag-control-unit-zf-trw-settlement` | 2028-12-11 | online_form | [airbagcontrolunitsettlement.com](https://www.airbagcontrolunitsettlement.com/) | 2028-12-11 (paper claim **mailed**, postmarked by that date) | Documented out-of-pocket + residual claim | Homepage says mail the paper form. | **Fix:** `mail_in`. |
| 4 | `camc-hernia-surgery-settlement` | 2026-12-14 | online_form | [camcbariatricsettlement.com](https://camcbariatricsettlement.com/) | Homepage lists opt-out/object **2026-10-13**. “Do nothing” for the guaranteed fund; a claim form for the contingent fund. **Claim deadline 2026-12-14 not on the homepage.** | Guaranteed fund: no extra proof. Contingent fund: medical complications. `proof_required=false` fits the default path. | Mixed automatic + form. Left as `online_form`. | No SQL (deadline unconfirmed on homepage). |
| 5 | `hyundai-kia-vehicle-theft` | 2027-03-31 | online_form | [hkmultistateimmobilizersettlement.com](https://www.hkmultistateimmobilizersettlement.com/) | 2027-03-31 | Documented theft/attempt; software-upgrade proof | Online claim. | Match. No SQL. |
| 6 | `hyundai-and-kia-airbag-control-unit-settlement` | 2027-04-08 | online_form | [acusettlement.com/HyundaiKia](https://www.acusettlement.com/HyundaiKia) | 2027-04-08 | Claim form; OOP reimbursement needs records | Online residual/reimbursement claim. | Match. No SQL. |
| 7 | `kroger-prescription-drug-prices-class-action-settlement` | 2026-12-21 | online_form | [krogersavingsclubsettlement.com](https://www.krogersavingsclubsettlement.com/) | 2026-12-21 | Docs only if claimed amount ≥ $8,000. `proof_required=false` is the default path. | Online/mail claim form. | Match. No SQL. |
| 8 | `kucoin-22m-new-york-enforcement-action-settlement` | 2029-02-28 | online_form | [kucoinnyagconsentorder.com/form/claim](https://www.kucoinnyagconsentorder.com/form/claim) | 2029-02-28 | Login ID & PIN from the mailed notice; wallet connect | Notice ID / PIN gate. | **Fix:** `needs_notice_id`. |
| 9 | `costa-del-mar-sunglasses-repair-fee-settlement` | (none) | automatic_payment | [costarepairsclassaction.com/Login](https://costarepairsclassaction.com/Login) | Not on the login page | Unique ID and PIN | Login, not an automatic check. | **Fix:** `needs_notice_id`. Deadline left null. |
| 10 | `nextera-energy-retirement-plans` | (none) | automatic_payment | [nexteraerisasettlement.com](https://www.nexteraerisasettlement.com/) | No claim deadline. “You can do nothing” to receive payment. Final approval hearing 2026-09-18. | None | Automatic allocation. | Match. No SQL. |
| 11 | `steel-warehouse-company-data-breach-settlement` | 2026-12-01 | online_form | [steelwarehousedatasettlement.com/form/claim](https://steelwarehousedatasettlement.com/form/claim/) | 2026-12-01 | LoginID and PIN. Alt $40 cash needs no receipts; OOP needs docs. `proof_required=false` fits the alt-cash path. | Notice ID / PIN gate. | **Fix:** `needs_notice_id`. |
| 12 | `asure-software-bipa-settlement` | 2026-12-21 | needs_notice_id | [asurebipasettlement.com](https://asurebipasettlement.com/) | 2026-12-21 | Valid claim form. Homepage does not show a PIN. Simpluris often mails an ID. | Left `needs_notice_id` (conservative). Est. $950–$2,800 on the site matches the listing text. | No SQL. |
| 13 | `seatgeek-ticket-fees-nevada-class-action-settlement` | 2027-01-05 | needs_notice_id | [seatgeekticketfeessettlement.com](https://www.seatgeekticketfeessettlement.com/) | 2027-01-05 | Claim form; homepage does not require a notice ID | Open online/mail claim. | **Fix:** `online_form`. Canonical URL with `www`. |
| 14 | `harvard-morgue-class-action-settlement` | 2026-12-09 | online_form | [harvardmorguesettlement.com](https://harvardmorguesettlement.com/) | 2026-12-09 | Claim form (relationship / notice letters) | Online/mail claim. | Match. No SQL. |
| 15 | `cbiz-data-breach-class-action-settlement` | 2026-12-24 | needs_notice_id | [cbizdatabreachsettlement.com](https://cbizdatabreachsettlement.com/) | 2026-12-24 | Claim form. OOP up to $5,000 needs docs; ~$100 cash path on the homepage has no PIN. | Open claim form on the homepage. | **Fix:** `online_form`. |
| 16 | `educational-computer-systems-data-breach-class-action-settlement` | 2026-12-21 | needs_notice_id | [datasettlementecsi.com](https://www.datasettlementecsi.com/) | 2026-12-21 | Claim form (OOP up to $5,000 or alt cash ~$100). No PIN on homepage. | Open online/mail claim. | **Fix:** `online_form`. |
| 17 | `naro-v-walgreen-co` | (none) | automatic_payment | [WalgreenCoSettlement.com](https://www.WalgreenCoSettlement.com) | **Not verified** — official site returned HTTP 500 on 2026-11-26. | — | Left unchanged. | No SQL. |
| 18 | `phh-mortgage-1-5m-debt-collection-class-action-settlement` | (none) | automatic_payment | [williamsphhsettlement.digitaldisbursements.com](https://williamsphhsettlement.digitaldisbursements.com) | Not fetched (disbursement portal). Listing already says payment ~105 days after final approval. | — | Left unchanged. | No SQL. |
| 19 | `public-agency-retirement-services-data-breach-class-action-settlement` | 2026-12-01 | needs_notice_id | [phaseiidatasettlement.com](https://phaseiidatasettlement.com/) | **No claim deadline.** Homepage: do nothing and receive a cash payment. **2026-12-01 is the opt-out/object date.** | None for the automatic check | Automatic payment. Keeping 2026-12-01 as `deadline` would auto-close the row the next day. | **Fix:** `automatic_payment`, `deadline` null. |
| 20 | `becton-dickinson-175m-sec-fair-fund-bdx` | 2026-12-13 | needs_notice_id | [bectonfairfund.com](https://www.bectonfairfund.com/) | Homepage requires a signed Claim Form with transaction docs. **2026-12-13 not listed on the homepage.** Plan Notice identifies some eligible investors. | Documented purchases (`proof_required=true` matches) | Left `needs_notice_id`. Deadline unconfirmed on homepage. | No SQL. |

## SQL that will change production (owner-apply only)

See `supabase/owner-apply/top20-verification-2026-11.sql`. Apply **after**
`0053_requested_notice.sql` if both are going in (0053 does not touch
`lawsuits`). Order:

1. `0053_requested_notice.sql` (schema: `claims.requested_notice_at` + RPC)
2. `top20-verification-2026-11.sql` (data: backup table, then 8 row updates)

Rollback for (2) is in the SQL file (restore from
`lawsuits_top20_backup_2026_11`, then drop that table).

## Not changed, and why

- RealPage / Deere stay `desk_file` (Easy submit policy), not because the
  official site files for the class member.
- CAMC, Asure, Becton, Naro, PHH: homepage did not support a confident
  deadline or type change.
- No invented payouts, traffic numbers, or testimonials.
