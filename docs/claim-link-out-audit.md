# Claim-action audit (open published catalog)

122 open published rows (121 public + 1 test). Curated in
`src/lib/claim-action-catalog.ts`. Owner-apply SQL:
`supabase/owner-apply/claim-action-types.sql` (do not apply from CI). Repeat
the URL scan with `npx tsx scripts/claim-site-audit.ts` (read-only).

Lawsuit AI still does not scrape or submit official sites from the server.
Captcha, OTP and identity checks remain hard stops. Desk filing needs an
approved spec and policy plus a legal reviewer.

## Audit buckets (122)

| Bucket | Count | Final `claim_action_type` |
| --- | ---: | --- |
| Desk-filed (RealPage, Deere) | 2 | `desk_file` |
| Open online forms (B1) | 16 | `online_form` |
| Need notice ID / PIN (B2) | 49 | `needs_notice_id` |
| Link-out / mail-only (C) | 15 | reclassified below |
| Automatic payment (no claim form) | 20 | `automatic_payment` |
| Past deadline | 7 | `not_open` |
| Dead link / closing portal | 6 | `not_open` |
| Duplicates | 2 | `not_open` |
| Misc (not a consumer claim form) | 4 | `not_open` |
| Test row | 1 | `not_open` |

Final action-type counts after reclassifying the 15 link-out rows:
`desk_file` 2, `online_form` 21, `needs_notice_id` 52, `mail_in` 6,
`automatic_payment` 21, `not_open` 20.

## The 15 link-out / mail-only rows

Each row was classified by whether an automatic path exists: an online form
we could later desk-file, a payment-election / address-update page, or
mail-in only. None are `desk_file` until a legal reviewer approves a policy.

| Slug | Official URL | Action | Reasoning |
| --- | --- | --- | --- |
| `sanyo-solar-panels-delamination` | catalog claim URL | `mail_in` | Paper / downloadable claim form; no public no-notice identity form. |
| `lincoln-university-covid-tuition` | catalog claim URL | `mail_in` | Mail-in / print path. |
| `robinson-v-des-moines-public-schools` | catalog claim URL | `mail_in` | Mail-in / print path. |
| `drexel-university-2-2m-covid-tuition-class-action-settlement` | catalog claim URL | `needs_notice_id` | Administrator portal expects a mailed notice ID. |
| `garden-city-1-4m-fire-fees-class-action-settlement` | catalog claim URL | `mail_in` | Print-and-mail instructions. |
| `national-holdings-4-35m-stockholder-settlement` | catalog claim URL | `needs_notice_id` | Stockholder notice ID / CUSIP path, not a public identity form. |
| `welch` | https://www.strategicclaims.net/welch/ | `needs_notice_id` | Strategic Claims case page; not a no-notice identity form. |
| `phh-mortgage-1-5m-debt-collection-class-action-settlement` | catalog claim URL | `automatic_payment` | No public claim form; class members are paid automatically / address update. |
| `california-gambling-control-commission-fees-settlement` | catalog claim URL | `mail_in` | Mail-in claim. |
| `calverton-park-465k-vehicle-towing-class-action-settlement` | catalog claim URL | `mail_in` | Mail-in claim. |
| `certainteed-organic-shingles` | catalog claim URL | `online_form` | Online claim form path exists. |
| `moss-krivin-v-penske-media-corporation` | https://subscribe.rollingstone.com/krivin-rs | `online_form` | Rolling Stone lifetime-subscription claim form. Draft desk spec is separate and stays unapproved. |
| `zonolite-vermiculite-attic-insulation` | https://www.zonoliteatticinsulation.com/g/Forms/Online-Claim-Form | `online_form` | Online-Claim-Form path. |
| `nibco-pex-tubing-settlement` | catalog claim URL | `online_form` | Online form path. |
| `hearthside-food-solutions-child-labor` | catalog claim URL | `online_form` | Online form path. |

## Duplicates

- `kia-hyundai-settlement-offers-cash-and-security-upgrades-to-owners` → `hyundai-kia-vehicle-theft`
- `rolling-stone-magazine-lifetime-subscription` → `moss-krivin-v-penske-media-corporation`

## Draft desk specs in this PR

`scripts/one-click-claim-profile-settlements.ts` writes
`supabase/owner-apply/one-click-claim-profile-settlements.sql`:

- Rolling Stone: `moss-krivin-v-penske-media-corporation` (subscription email).
- Hyundai/Kia anti-theft: `hyundai-kia-vehicle-theft` (VIN + theft-docs upload).

Both insert **draft** specs and policies (`agent_filing` allowed, channel
enabled in the JSON but the row status is draft). A `legal_reviewer` must
approve in Admin → Filing. Dry-run: `npx tsx scripts/one-click-dry-run.ts --slug <slug>`
stops before Submit with fake data. Screenshots:
`docs/one-click-e2e/<slug>/`.
