# Claim-action surfaces (review follow-up)

Founder / gstack review of merged PR #76. One bundled PR. SQL is **not**
applied to prod.

## What shipped

1. **Every surface follows `claim_action_type`.** Home featured list,
   `LawsuitCard`, Easy submit badge, status chips, settlement sidebar, sticky
   mobile CTA, signup prompts, match-preview result buttons. Automatic-payment
   pages (Bank of America, Costa Del Mar, Zumba, and any other
   `automatic_payment` row) show “No claim needed — you'll be paid
   automatically”, the keep-address-current tip, and optional “Get payment
   updates”. No file / qualify / signup-to-file CTAs.
2. **Notice ID** is a real per-claim field (`claims.notice_id`, never the
   shared profile, never a PIN/password). “Where’s my ID?” help for Simpluris,
   Kroll, Epiq, Angeion, JND, and a generic postcard/email fallback. “No
   notice?” explains eligibility without a mailed ID, links the official
   lookup/contact, and offers an alert. Works before signup; sign-in only to
   persist.
3. **`/claim` is public.** Official link, copy-ready details, steps, and
   eligibility without an account. Sign-in only to save, track, or Easy submit.
4. **Mail-in steps** render on the public settlement page. Signed-in visitors
   get a printable prefilled summary from their claim profile.
5. **Trust / wording.** “Easy submit” is the desk-file label, with “You answer
   a few questions and e-sign — we submit it to the official claims site for
   you.” “We file for you” stays only where it is true (home how-it-works /
   hero, tied to Easy submit). The global yellow unverified banner is gone;
   each listing has its own verification line. RealPage administrator is Epiq.
   Phone copy matches behavior: optional in Settings, never at sign-up.
6. **Matching is the primary home CTA** (first, `btn-primary` on mobile). Guest
   match results use save-by-link (`GuestMatchShare`); `POST /api/subscribe` is
   still 410, so we did not resurrect email.
7. **Mobile.** Settlements list server-renders the first page of cards; match
   banner is below the grid, not a full-screen spinner. Home hero no longer
   uses `opacity-0` stagger. `overflow-x: hidden` on `html`; `min-w-0` on page
   containers and cards. Settlement ISR dropped from 3600s to 300s.
8. **Cache.** Admin claim-action/status edits call `revalidatePath`. Owner-apply
   SQL uses `POST /api/admin/revalidate-catalog` (see
   [OWNER-APPLY-REVALIDATE.md](./OWNER-APPLY-REVALIDATE.md)).

## Migrations / owner steps

- **0052_claim_notice_id.sql** — `claims.notice_id` (≤80 chars) +
  `claim_set_notice_id` RPC. No new tables; `10_rls_basics` lists unchanged.
- **Do not apply SQL to prod from this PR.** After a later owner-apply of 0052
  and any `claim_action_type` SQL, POST the revalidate endpoint with
  `CRON_SECRET`.

## Screenshots

Captured at 375px and 1280px from the local production build (`next start`).
No catalog credentials in this environment, so `/lawsuits` is the empty
first-screen state (heading + intro, no spinner, no overflow) and settlement
slugs 404. Home, match preview, and `/claim` were captured anyway. Overflow
was `false` at both widths on every page below.

- `docs/screenshots/claim-action-surfaces/home-375.png`
- `docs/screenshots/claim-action-surfaces/home-1280.png`
- `docs/screenshots/claim-action-surfaces/lawsuits-375.png`
- `docs/screenshots/claim-action-surfaces/lawsuits-1280.png`
- `docs/screenshots/claim-action-surfaces/settlement-375.png`
- `docs/screenshots/claim-action-surfaces/settlement-1280.png`
- `docs/screenshots/claim-action-surfaces/claim-375.png`
- `docs/screenshots/claim-action-surfaces/claim-1280.png`
- `docs/screenshots/claim-action-surfaces/preview-375.png`
- `docs/screenshots/claim-action-surfaces/preview-1280.png`
