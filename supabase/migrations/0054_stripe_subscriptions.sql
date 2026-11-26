-- ClaimMatch 0054: Stripe membership subscriptions (7-day trial, then $19.99/month).
-- EXPAND ONLY. Do not edit 0053 or earlier.
--
-- Unapplied to production until an owner applies it. Safe to re-run.
-- Stores each member's Stripe subscription state. Lawsuit AI never holds or
-- redirects settlement funds; membership is billed separately by Stripe.
--
-- Rollback:
--   drop policy if exists "own subscriptions read" on public.subscriptions;
--   revoke all on public.subscriptions from public, anon, authenticated, service_role;
--   drop table if exists public.subscriptions;

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null
    check (status in (
      'trialing',
      'active',
      'past_due',
      'canceled',
      'incomplete',
      'incomplete_expired',
      'unpaid',
      'paused'
    )),
  trial_end timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.subscriptions is
  'Stripe membership: 7-day free trial then $19.99/month. Unlocks Easy submit and new-claim alerts. Lawsuit AI never holds settlement funds.';

create index if not exists subscriptions_status_idx on public.subscriptions (status);
create index if not exists subscriptions_stripe_customer_id_idx on public.subscriptions (stripe_customer_id);

alter table public.subscriptions enable row level security;

revoke all on public.subscriptions from public, anon, authenticated;
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;

drop policy if exists "own subscriptions read" on public.subscriptions;
create policy "own subscriptions read"
  on public.subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);
