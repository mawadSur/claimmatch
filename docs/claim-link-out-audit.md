# Claim-action audit (open published catalog)

122 rows at the original audit (121 public + 1 test). Curated in
`src/lib/claim-action-catalog.ts`. Owner-apply SQL:
`supabase/owner-apply/claim-action-types.sql` (do not apply from CI). Repeat
the URL scan with `npx tsx scripts/claim-site-audit.ts` (read-only).

Lawsuit AI still does not scrape or submit official sites from the server.
Captcha, OTP and identity checks remain hard stops. Desk filing needs an
approved spec and policy plus a legal reviewer.

## 2026-11-25 prod cleanup

Prod was cleaned at 5:35 PM ET. Owner-apply **skips** closed, hidden, and
unpublished rows (also `status = 'open' AND review_status = 'published'` on
every UPDATE).

| Slug | Why skip |
| --- | --- |
| `cook-county-5-68m-race-discrimination-in-hiring-settlement` | closed |
| `metlife-auto-insurance-1-2m-class-action-settlement` | closed |
| `central-valley-meat-co-data-breach` | closed |
| `southstate-bank-data-breach` | closed |
| `pope-v-benson-health` | closed |
| `acen-data-breach-settlement` | closed |
| `nibco-pex-tubing-settlement` | closed (also draft) |
| `kia-hyundai-settlement-offers-cash-and-security-upgrades-to-owners` | hidden duplicate of `hyundai-kia-vehicle-theft` |
| `moss-krivin-v-penske-media-corporation` | unpublished duplicate of `rolling-stone-magazine-lifetime-subscription` |
| `lawsuit-ai-one-click-test-settlement` | hidden test row |

Canonical Rolling Stone is `rolling-stone-magazine-lifetime-subscription`.
Canonical Hyundai/Kia anti-theft is `hyundai-kia-vehicle-theft`.
Sanyo `claim_url` is now `https://www.sanyosolarclaims.com/documents`.
`international-motors-wellness-program-surcharge-settlement` and
`naro-v-walgreen-co` are `automatic_payment`.

Catalog action-type counts after this cleanup: `desk_file` 2, `online_form` 17,
`needs_notice_id` 50, `mail_in` 6, `automatic_payment` 22, `not_open` 25.
Owner-apply writes the 112 remaining open published rows.

## Original audit buckets (122)

| Bucket | Count | Final `claim_action_type` (then) |
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

## The 15 link-out / mail-only rows

Each row was classified by whether an automatic path exists: an online form
a filing desk can use later, a payment-election / address-update page, or
mail-in only. None are `desk_file` until a legal reviewer approves a policy.

| Slug | Official URL | Action | Reasoning |
| --- | --- | --- | --- |
| `sanyo-solar-panels-delamination` | https://www.sanyosolarclaims.com/documents | `mail_in` | Documents page / downloadable claim form. |
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
| `rolling-stone-magazine-lifetime-subscription` | https://subscribe.rollingstone.com/krivin-rs | `online_form` | Canonical Rolling Stone lifetime-subscription claim form. Draft desk spec is separate and stays unapproved. |
| `zonolite-vermiculite-attic-insulation` | https://www.zonoliteatticinsulation.com/g/Forms/Online-Claim-Form | `online_form` | Online-Claim-Form path. |
| `nibco-pex-tubing-settlement` | catalog claim URL | `not_open` (skip) | Was an online form; prod closed / draft 2026-11-25. |
| `hearthside-food-solutions-child-labor` | catalog claim URL | `online_form` | Online form path. |

## Duplicates (skip owner-apply)

- `kia-hyundai-settlement-offers-cash-and-security-upgrades-to-owners` (hidden) → `hyundai-kia-vehicle-theft`
- `moss-krivin-v-penske-media-corporation` (unpublished) → `rolling-stone-magazine-lifetime-subscription`

## Draft desk specs in this PR

`scripts/one-click-claim-profile-settlements.ts` writes
`supabase/owner-apply/one-click-claim-profile-settlements.sql`:

- Rolling Stone: `rolling-stone-magazine-lifetime-subscription` (subscription email).
- Hyundai/Kia anti-theft: `hyundai-kia-vehicle-theft` (VIN + theft-docs upload).

Both insert **draft** specs and policies (`agent_filing` allowed, channel
enabled in the JSON but the row status is draft). A `legal_reviewer` must
approve in Admin → Filing. Dry-run: `npx tsx scripts/one-click-dry-run.ts --slug <slug>`
stops before Submit with fake data. Screenshots:
`docs/one-click-e2e/<slug>/`.
