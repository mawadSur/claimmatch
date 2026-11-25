# Owner-apply SQL (not run by CI)

`one-click-five-settlements.sql` inserts **draft** `filing_specs` and
`filing_policies` for five catalog slugs. It never sets `status = 'approved'`.

Apply in the Supabase SQL editor only after reading the dry-run notes in
`docs/one-click-e2e/`. Then a `legal_reviewer` approves each spec and policy in
Admin → Filing. **Do not approve** a draft whose dry-run stopped at
`account-login`.

`ONE_CLICK_FILING_ENABLED` must already be on for the public “We file for you”
badge. This file does not change env vars.

## Supabase Auth dashboard (signup / magic link)

Needed for the easy-signup work in this PR. Do not change these from the agent.

1. **Confirm email:** turn **off** “Confirm email” (Authentication → Providers →
   Email) so `signUp` returns a session. Users can track a claim and finish
   onboarding before they confirm. Keep the in-app confirm reminder.
2. **Magic link template:** Authentication → Email templates → Magic Link.
   Confirmation URL must hit this app’s `/auth/confirm` with `token_hash` (and
   `type`), matching `src/app/auth/confirm/verify/route.ts`. Example:
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink`
3. Keep the existing **signup / invite** template on the same `/auth/confirm`
   `token_hash` contract. Do not switch to a hash-fragment-only flow.
4. Password minimum in the dashboard can stay at Supabase’s default; the app
   still enforces 10 characters with inline validation when a password is used.
