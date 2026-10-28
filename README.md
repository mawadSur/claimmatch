# ClaimMatch

ClaimMatch is a free claim assistant for class-action settlements. People find
settlements that are open for claims, check whether they qualify on the official
notice, file on the official administrator's site themselves, and keep track of
their claims in ClaimMatch.

- ClaimMatch never files or submits a claim for anyone and never handles
  settlement money. Not taking a cut is an internal position under review, not
  a public promise; monetization undecided (D4).
- A claim reads "Submitted" only with the administrator's confirmation number.
  Before that it reads "Not filed yet" or "Reported filed by you".
- Settlement listings come from [SettleSignal](https://settlesignal.com/data/)
  (CC BY 4.0) and are labeled "Unverified: check the official site" until each
  record is verified.
- Copy-ready claim details (the user's saved name, email, phone, address and
  state, ready to copy into the official form) are offered in every state. The
  user still reviews and submits the claim.
- Filing as the user's agent may come only in a later phase, with counsel review
  and written permission from each settlement administrator.

See [docs/ROADMAP.md](docs/ROADMAP.md) for what comes next. Production apply
order for the trust-reset migrations is in
[docs/PRODUCTION-RUNBOOK.md](docs/PRODUCTION-RUNBOOK.md).

---

## Tech stack

- **Next.js 15** (App Router, React 19, TypeScript): the front end and the
  Node.js route handlers in one deployable unit.
- **Supabase**: Postgres, Auth and Row Level Security.
- **Tailwind CSS**: design tokens in `tailwind.config.ts` and `src/app/globals.css`.
- **Resend**: email.
- **Vercel**: hosting, Web Analytics and Cron.
- **PostHog**: product analytics.

---

## Getting started (local)

```bash
npm install
cp .env.example .env.local     # fill in Supabase + Resend values
npm run dev                    # http://localhost:3000
npm run test:run               # vitest
```

Auth, the catalog and email need Supabase and Resend keys.

### Wire up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Apply `supabase/migrations/*` in order (`supabase db push`, or paste each file
   into the SQL editor). `scripts/db-test.sh` applies them all to a throwaway
   local Postgres.
3. Sample data is **fictional** and for a local or staging database only:
   `CLAIMMATCH_ENV=local npm run seed` loads sample settlements the local site
   shows, and `supabase/seed.dev.sql` (opt-in, see its header) recreates the 16
   made-up rows production once showed. `npm run seed` and `npm run scrape`
   refuse to run unless `CLAIMMATCH_ENV` is `local` or `staging`, and always
   refuse the production project.
4. Copy the project URL, anon key and service role key into `.env.local`.
5. Make yourself an admin: set `ADMIN_EMAILS=you@example.com`, or run
   `update public.profiles set is_admin = true where email = 'you@example.com';`
   after you sign up.

### Environment variables

See [`.env.example`](./.env.example). Summary:

| Var | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client and server Supabase access |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only jobs and writes, including every claim update and unsubscribe. Never exposed to the browser |
| `NEXT_PUBLIC_SITE_URL` | Canonical URL for metadata, emails and referral links |
| `RESEND_API_KEY` / `RESEND_FROM` | Email |
| `ANTHROPIC_API_KEY` | Not used in Phase 0 (the ingest makes no model calls) |
| `ADMIN_EMAILS` | Comma-separated allowlist that bootstraps admin access |
| `CRON_SECRET` | Protects `/api/cron/*` (Vercel Cron sends it automatically) |
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | Product analytics |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Inbox for privacy and data requests, shown on Privacy, Terms, the footer and Settings. Set it only to an address that receives mail. **Required in Production:** a production build (`VERCEL_ENV=production`) stops without a working address |
| `NEXT_PUBLIC_LEGAL_ENTITY` | Legal name of the business that runs ClaimMatch |
| `NEXT_PUBLIC_POSTAL_ADDRESS` | Mailing address for the legal pages and footer (`\n` for line breaks) |
| `MATCH_EMAILS_ENABLED` / `DIGEST_ENABLED` / `ADMIN_RECOVERIES_ENABLED` / `ENABLE_SAMPLE_SOURCE` / `ASSISTED_FILING_ENABLED` / `DIRECT_FILING_ENABLED` / `MATCH_METRICS_ENABLED` / `ELIGIBILITY_DRAFTS_ENABLED` / `INGEST_ALERT_EMAILS_ENABLED` / `LINK_CHECK_ENABLED` / `PAYOUT_REPORT_ENABLED` / `FEE_DISCLOSURE_ENABLED` | Switches in `src/lib/flags.ts`; each is on only when set to exactly `1`. Keep them off in production |
| `INTERNAL_EMAILS` | Comma-separated tester emails tagged `internal` and excluded from traction |
| `INGEST_MAX_CLOSE_SHARE` | Share of open settlements one ingest run may close before closures are held for review (default `0.2`). A run that holds closures fails the cron (500) and lists every held row under "Last catalog ingest" in /admin; raise this for one run only after checking them |
| `CLAIMMATCH_ENV` | `local` or `staging`; required by `npm run seed` and `npm run scrape` |

Contact details that are unset render nothing. `NEXT_PUBLIC_` values are built
into the site, so redeploy after changing one.

---

## Deploy to Vercel

```bash
vercel                     # first deploy (links the project)
vercel --prod              # production deploy
```

`vercel.json` schedules `GET /api/cron/daily` (06:00 UTC) and
`GET /api/cron/digest` (Mondays, 15:00 UTC). Match emails and the Monday digest
stay paused until verified settlement records ship; the switches live in
`src/lib/flags.ts` and default to off.

### Production runbook (in this order)

Full steps, smoke checks and rollback: [docs/PRODUCTION-RUNBOOK.md](docs/PRODUCTION-RUNBOOK.md).

1. Set env vars (`NEXT_PUBLIC_CONTACT_EMAIL`, `SUPABASE_SERVICE_ROLE_KEY`; leave match/digest/sample flags off).
2. **Before deploying**, in the Supabase SQL editor:
   1. `0004_prefill.sql` (any time)
   2. `0005_review_default.sql` (any time)
   3. `0006_claim_states.sql`
   4. `0007_corrective_notice_marker.sql`
3. Merge and deploy.
4. **Right after the deploy**, run `0008_claims_server_writes.sql`. Never run it before the deploy.
5. **After the read-only snapshot**, run `0009_unpublish_fictional.sql` in a session that starts with `set claimmatch.d38_export_done = 'yes';`.
6. Run `0010_feed_presence.sql` any time (adds feed-presence columns; no status changes).
7. Set the Vercel rollback floor at this deployment.

---

## Project layout

```
src/
  app/
    page.tsx                 home
    lawsuits/                catalog + [slug] detail
    claim/[slug]/            claim page (self-file flow + pre-fill packet)
    dashboard/               the user's claims
    login, signup, onboarding, settings, auth/callback
    r/[code]                 tracked share / referral short links
    admin/share-links        admin campaign link builder
    how-it-works, pricing, trust, about, privacy, terms
    api/                     route handlers (claims, settings, cron/*, ...)
  components/                LawsuitCard, ClaimFlow, PrefillPacket, AuthForm, Footer, ...
  lib/
    types.ts                 shared domain types (mirror the SQL schema)
    eligibility.ts           profile questions
    lawsuits.ts              catalog data access
    scraper/                 source adapters + ingest pipeline
    supabase/                client / server / middleware
    email.ts                 Resend wrapper + templates
supabase/
  migrations/                0001–0024: schema, RLS, grants, trust reset, filing, match events
  tests/                     SQL tests run by scripts/db-test.sh
tests/                       vitest
```

---

## Adding a settlement source

1. Create an adapter in `src/lib/scraper/sources/` that implements `SourceAdapter`
   (`{ slug, name, fetch(): Promise<ScrapedLawsuit[]> }`).
2. Fetch the source's listing, parse it, and map each item to `ScrapedLawsuit`
   (`src/lib/types.ts`) with a stable `external_id`.
3. Register it in `src/lib/scraper/sources/index.ts`.
4. Credit the source as its license requires.

> Respect each source's `robots.txt` and terms of service, and rate-limit politely.

---

## Legal

ClaimMatch is a free claim assistant, **not a law firm**, and does not give legal
advice. The Terms and Privacy Policy are interim versions pending legal review.
See [`/terms`](src/app/terms/page.tsx), [`/privacy`](src/app/privacy/page.tsx) and
`src/lib/disclaimer.ts`.
