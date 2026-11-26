-- ClaimMatch 0054: Stripe fee invoices for the recovery-only Easy submit fee.
-- EXPAND ONLY. Do not edit 0053 or earlier.
--
-- Unapplied to production until an owner applies it. Safe to re-run.
-- Tracks invoices billed after a confirmed payout. Lawsuit AI never holds or
-- redirects settlement funds; Stripe invoices the member separately.
--
-- Rollback:
--   drop policy if exists "own fee_invoices read" on public.fee_invoices;
--   revoke all on public.fee_invoices from public, anon, authenticated, service_role;
--   drop table if exists public.fee_invoices;

create table if not exists public.fee_invoices (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  payout_amount_cents integer not null check (payout_amount_cents > 0),
  fee_pct numeric(5, 2) not null check (fee_pct > 0 and fee_pct <= 100),
  fee_amount_cents integer not null check (fee_amount_cents >= 0),
  stripe_invoice_id text unique,
  stripe_hosted_invoice_url text,
  status text not null default 'draft'
    check (status in ('draft', 'open', 'paid', 'void', 'uncollectible')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

comment on table public.fee_invoices is
  'Recovery-only Easy submit fee invoices. Created after a confirmed payout; paid via Stripe hosted invoice. Lawsuit AI never holds settlement funds.';

create index if not exists fee_invoices_claim_id_idx on public.fee_invoices (claim_id);
create index if not exists fee_invoices_user_id_idx on public.fee_invoices (user_id);
create index if not exists fee_invoices_status_idx on public.fee_invoices (status);

alter table public.fee_invoices enable row level security;

revoke all on public.fee_invoices from public, anon, authenticated;
grant select on public.fee_invoices to authenticated;
grant all on public.fee_invoices to service_role;

drop policy if exists "own fee_invoices read" on public.fee_invoices;
create policy "own fee_invoices read"
  on public.fee_invoices
  for select
  to authenticated
  using (auth.uid() = user_id);
