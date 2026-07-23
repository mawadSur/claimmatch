-- ClaimMatch — referral revenue (partner lead / referral fees)
--
-- The locked business model is "free + referral/lead fees": ClaimMatch routes
-- qualified members to partner services (claim-filing services, law firms,
-- financial/tax/credit help) and earns a lead or referral fee PAID BY THE
-- PARTNER — never deducted from a member's recovery. This migration adds the
-- partner catalog and a lead-event ledger that tracks each outbound referral
-- from click → lead → conversion, so revenue can be attributed and reported.
--
-- Apply BY HAND (no automated runner): `supabase db push`, or paste into the
-- Supabase SQL editor. Idempotent: safe to run more than once.

-- ---------------------------------------------------------------------------
-- Partners: services we refer members to for a fee
-- ---------------------------------------------------------------------------
create table if not exists public.partners (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text unique not null,
  name                 text not null,
  category             text not null default 'general',      -- claims_service | law_firm | financial | tax | credit | general
  tagline              text,
  description          text,
  url                  text not null,                         -- destination landing page (admin-controlled)
  logo_url             text,
  payout_model         text not null default 'per_lead',      -- per_lead | per_conversion | hybrid
  lead_fee_cents       integer not null default 0,             -- earned per qualified lead/click
  conversion_fee_cents integer not null default 0,             -- earned per conversion (CPA)
  disclosure           text,                                   -- custom FTC disclosure (optional)
  active               boolean not null default true,
  priority             integer not null default 0,             -- higher shows first
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists partners_active_idx on public.partners (active, priority desc);

-- ---------------------------------------------------------------------------
-- Lead events: one row per outbound referral click; conversions update it
-- ---------------------------------------------------------------------------
create table if not exists public.lead_events (
  id             uuid primary key default gen_random_uuid(),
  partner_id     uuid not null references public.partners(id) on delete cascade,
  user_id        uuid references auth.users(id) on delete set null,   -- null for signed-out clicks
  lawsuit_id     uuid references public.lawsuits(id) on delete set null, -- context, if shown against a settlement
  placement      text,                                                -- dashboard | lawsuit_detail | claim_success
  status         text not null default 'clicked',                     -- clicked | lead | converted | rejected | paid
  lead_fee_cents integer not null default 0,                          -- snapshot at click
  revenue_cents  integer not null default 0,                          -- total attributed revenue
  external_ref   text,                                                -- partner's conversion/txn id (from postback)
  ip             text,
  user_agent     text,
  converted_at   timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists lead_events_partner_idx on public.lead_events (partner_id);
create index if not exists lead_events_user_idx on public.lead_events (user_id);
create index if not exists lead_events_status_idx on public.lead_events (status, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at trigger (reuses public.touch_updated_at from 0001/0002)
-- ---------------------------------------------------------------------------
drop trigger if exists partners_touch on public.partners;
create trigger partners_touch before update on public.partners
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.partners     enable row level security;
alter table public.lead_events  enable row level security;

-- Partners: anyone may read ACTIVE partners (they are shown publicly); admins
-- see and manage everything. Writes are admin-only.
drop policy if exists "partners public read" on public.partners;
create policy "partners public read" on public.partners
  for select using (active = true or public.is_admin());

drop policy if exists "admin partners all" on public.partners;
create policy "admin partners all" on public.partners
  for all using (public.is_admin()) with check (public.is_admin());

-- Lead events: a member may read their own; admins read all. Inserts/updates
-- flow through the service role (server routes), so no public write policy.
drop policy if exists "own lead events read" on public.lead_events;
create policy "own lead events read" on public.lead_events
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "admin lead events all" on public.lead_events;
create policy "admin lead events all" on public.lead_events
  for all using (public.is_admin()) with check (public.is_admin());
