# ClaimMatch

**Find the settlement money you’re owed.** ClaimMatch scans class-action settlements
and lawsuits, matches you to the ones you qualify for, and helps you file your claim in
minutes — then emails you when new matches open up.

This is a ground-up rebuild (React / Next.js + Node + Supabase) of a legacy WordPress
"settlement finder" site, with WordPress removed entirely.

---

## What it does

- **Catalog of settlements** — a browsable, filterable list of open class-action
  settlements and lawsuits, each with a payout range, claim deadline, whether proof is
  required, and a "who qualifies" description.
- **Eligibility matching** — users answer a short one-time questionnaire; a transparent
  rule engine compares their profile to every case and surfaces the ones they qualify for.
- **Guided claims** — the right claim form is pre-filled from the user's profile; filing
  produces a **receipt number** and a status (`processing → submitted → approved → paid`).
- **Email alerts** — a daily job re-matches everyone and emails users the moment a new
  eligible settlement appears.
- **Scraper framework** — a pluggable source-adapter system ingests settlements from
  external sources and normalizes them into the catalog (a sample adapter ships in the box;
  add real ones per source).

### How this maps to the original WordPress site

| WordPress                                   | ClaimMatch                                   |
| ------------------------------------------- | -------------------------------------------- |
| Posts in category "Settlement"              | `lawsuits` table                             |
| Post meta `deadline`, `no_proof_required`   | `lawsuits.deadline`, `lawsuits.proof_required` |
| `settlement-buttons` plugin (Yes/No + AJAX) | Claim flow + `claims` table + receipt number |
| `grgt_settlement_responses` / `_statuses`   | `claims` + `claim_status` enum               |
| "AI Matched" featured cards                 | `matches` table + rule-based matcher         |
| BuddyPress profiles / registration          | Supabase Auth + `profiles`                   |
| MailChimp                                    | Resend transactional email                   |
| Settlement card UI                          | `<LawsuitCard>` / `<ClaimCard>` (design kept) |

---

## Tech stack

- **Next.js 15** (App Router, React 19, TypeScript) — the React front end **and** the
  Node.js backend (route handlers) in one deployable unit.
- **Supabase** — Postgres, Auth, and Row Level Security.
- **Tailwind CSS** — design system in `tailwind.config.ts` + `src/app/globals.css`.
- **Resend** — transactional email.
- **Vercel** — hosting + Cron (daily scrape + match jobs).

---

## Getting started (local)

```bash
npm install
cp .env.example .env.local     # fill in Supabase + Resend values (optional to start)
npm run dev                    # http://localhost:3000
```

The app runs **without any configuration** — it falls back to sample settlements so you
can see the whole UI immediately. Auth, persistence, matching, and email switch on once
you add Supabase + Resend keys.

### Wire up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the migrations **in order**, then seed:
   ```bash
   # Option A — Supabase CLI
   supabase link --project-ref <your-ref>
   supabase db push                       # applies supabase/migrations/* in order
   # then paste supabase/seed.sql into the SQL editor
   ```
   ```bash
   # Option B — in the Supabase SQL editor, run in this order:
   #   1. supabase/migrations/0001_init.sql
   #   2. supabase/migrations/0002_dream_state.sql   (recoveries, jobs, review workflow, admin)
   #   3. supabase/seed.sql
   ```
3. Copy your Project URL + anon key + service role key into `.env.local`.
4. **Make yourself an admin:** set `ADMIN_EMAILS=you@example.com` in the env, or run
   `update public.profiles set is_admin = true where email = 'you@example.com';` after you sign up.
5. (Optional) `npm run seed` upserts the sample catalog via the service role key.

### Environment variables

See [`.env.example`](./.env.example). Summary:

| Var | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + server Supabase access |
| `SUPABASE_SERVICE_ROLE_KEY` | Server jobs (pipeline/match cron, recovery writes, seed) — never exposed to client |
| `NEXT_PUBLIC_SITE_URL` | Canonical URL for metadata + email + referral links |
| `RESEND_API_KEY` / `RESEND_FROM` | Transactional email (match alerts, welcome, digest) |
| `ANTHROPIC_API_KEY` | Claude (Opus 4.8) LLM extraction pipeline — scraped text → structured settlements |
| `ADMIN_EMAILS` | Comma-separated allowlist that bootstraps admin access (also set `profiles.is_admin`) |
| `NEXT_PUBLIC_CLAIMMATCH_FEE_PCT` | Contingency fee we take from a recovery (default `0.15` = 15%) |
| `CRON_SECRET` | Protects `/api/cron/*` endpoints (Vercel Cron sends it automatically) |

---

## Deploy to Vercel

```bash
npm i -g vercel            # if needed
vercel                     # first deploy (links the project)
# add env vars in the Vercel dashboard (Project → Settings → Environment Variables)
vercel --prod              # production deploy
```

`vercel.json` registers two daily Cron jobs:

- `GET /api/cron/scrape` (06:00 UTC) — ingest new settlements.
- `GET /api/cron/match` (07:00 UTC) — re-match users and send alert emails.

Set `CRON_SECRET` in Vercel and Vercel Cron will send it automatically.

---

## Project layout

```
src/
  app/
    page.tsx                 landing
    lawsuits/                browse + [slug] detail
    claim/[slug]/            guided claim flow
    dashboard/               my matches + my claims
    login, signup, onboarding, auth/callback
    how-it-works, about, privacy, terms
    api/
      subscribe, claims, matches
      cron/scrape, cron/match
  components/                LawsuitCard, ClaimCard, ClaimForm, AuthForm, ...
  lib/
    types.ts                 shared domain types (mirror the SQL schema)
    matching.ts              eligibility rule engine
    eligibility.ts           onboarding questionnaire
    lawsuits.ts              catalog data access (Supabase + sample fallback)
    scraper/                 pluggable source adapters + orchestrator
    supabase/                client / server / middleware
    email.ts                 Resend wrapper + templates
supabase/
  migrations/0001_init.sql   schema + RLS + triggers
  seed.sql                   sample sources + settlements
scripts/
  seed.ts, run-scrape.ts
```

---

## Adding a real scraper source

1. Create an adapter in `src/lib/scraper/sources/` that implements `SourceAdapter`
   (`{ slug, name, fetch(): Promise<ScrapedLawsuit[]> }`).
2. Fetch the source's listing, parse it, and map each item to `ScrapedLawsuit`
   (`src/lib/types.ts`) with a stable `external_id`.
3. Register it in `src/lib/scraper/sources/index.ts`.
4. `runAllSources()` handles upserting + dedupe. Test with `npm run scrape`.

> Respect each source's `robots.txt` and Terms of Service, and rate-limit politely.

---

## Legal

ClaimMatch is an information and matching service, **not a law firm**, and does not
provide legal advice. Using the site does not create an attorney-client relationship.
See [`/terms`](src/app/terms/page.tsx) and the disclaimer in `src/lib/disclaimer.ts`.
