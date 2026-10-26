-- ClaimMatch — pre-fill packet columns + claims update policy
-- Additive only. Do not edit 0001–0003. Mohammed runs this in production
-- after review; this file is not applied automatically to prod.

-- ---------------------------------------------------------------------------
-- Profiles: mailing address used to pre-fill official claim forms
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists address_line1 text;
alter table public.profiles add column if not exists address_line2 text;
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists prefill_consent_at timestamptz;

-- 0002 revoked blanket UPDATE and granted a column list. Extend that list so
-- users can save the new address fields (RLS still scopes them to own row).
grant update (address_line1, address_line2, city, prefill_consent_at)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Claims: user-reported official submission (ClaimMatch never files)
-- ---------------------------------------------------------------------------
alter table public.claims add column if not exists user_submitted_at timestamptz;
alter table public.claims add column if not exists confirmation_number text;

-- 0001 already created "own claims update". Recreate with an explicit WITH
-- CHECK so a user cannot reassign user_id on update.
drop policy if exists "own claims update" on public.claims;
create policy "own claims update" on public.claims
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Lawsuits: close-job bookkeeping
-- ---------------------------------------------------------------------------
alter table public.lawsuits add column if not exists closed_at timestamptz;
alter table public.lawsuits add column if not exists last_verified_at timestamptz;

create index if not exists lawsuits_closed_at_idx on public.lawsuits (closed_at);
create index if not exists lawsuits_last_verified_idx on public.lawsuits (last_verified_at);
