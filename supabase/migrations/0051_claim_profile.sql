-- ClaimMatch 0051: shared claim profile + per-settlement claim action type.
-- EXPAND ONLY. Do not edit 0050 or earlier.
--
-- claim_profiles / claim_profile_addresses: extra fields official claim forms
-- commonly ask for (aliases, DOB, payout method NAME, VIN, account emails,
-- current + prior addresses with dates). Core contact stays on profiles.
-- Never stores SSN, full bank/routing/card numbers, PINs or passwords.
-- RLS: owner-only. Authenticated users read/write only their own rows.
--
-- lawsuits.claim_action_type / claim_action: accurate public CTAs. Values are
-- filled by supabase/owner-apply/claim-action-types.sql (owner apply only).
-- This migration does not classify catalog rows.
--
-- Feature flags: CLAIM_PROFILE_ENABLED and CLAIM_ACTION_CTAS_ENABLED default
-- on (unset is on; set to 0 to kill). COLLECT_ADMIN_PIN_ENABLED stays off.
--
-- Safe to re-run. Nothing is deleted.
-- Rollback:
--   alter table public.lawsuits drop column if exists claim_action;
--   alter table public.lawsuits drop column if exists claim_action_type;
--   drop table if exists public.claim_profile_addresses;
--   drop table if exists public.claim_profiles;

-- ---------------------------------------------------------------------------
-- claim_profiles: 1:1 extras on the signed-in user
-- ---------------------------------------------------------------------------
create table if not exists public.claim_profiles (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  aliases            text,
  form_email         text,
  date_of_birth      date,
  payout_preference  text,
  vehicle_vin        text,
  account_emails     jsonb not null default '[]'::jsonb,
  consent_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.claim_profiles is
  'Shared claim-form extras (aliases, DOB, payout method name, VIN, account emails). Never SSN, bank numbers, PINs or passwords. RLS: own row only.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'claim_profiles_aliases_len'
       and conrelid = 'public.claim_profiles'::regclass
  ) then
    alter table public.claim_profiles
      add constraint claim_profiles_aliases_len
      check (aliases is null or char_length(aliases) <= 200);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'claim_profiles_form_email_len'
       and conrelid = 'public.claim_profiles'::regclass
  ) then
    alter table public.claim_profiles
      add constraint claim_profiles_form_email_len
      check (form_email is null or char_length(form_email) <= 320);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'claim_profiles_payout_check'
       and conrelid = 'public.claim_profiles'::regclass
  ) then
    alter table public.claim_profiles
      add constraint claim_profiles_payout_check
      check (
        payout_preference is null
        or payout_preference in ('check', 'paypal', 'venmo', 'prepaid_card', 'virtual_card', 'zelle', 'other')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'claim_profiles_vin_check'
       and conrelid = 'public.claim_profiles'::regclass
  ) then
    alter table public.claim_profiles
      add constraint claim_profiles_vin_check
      check (vehicle_vin is null or vehicle_vin ~ '^[A-HJ-NPR-Z0-9]{17}$');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'claim_profiles_account_emails_is_array'
       and conrelid = 'public.claim_profiles'::regclass
  ) then
    alter table public.claim_profiles
      add constraint claim_profiles_account_emails_is_array
      check (jsonb_typeof(account_emails) = 'array' and jsonb_array_length(account_emails) <= 10);
  end if;
end $$;

drop trigger if exists claim_profiles_touch on public.claim_profiles;
create trigger claim_profiles_touch before update on public.claim_profiles
  for each row execute function public.touch_updated_at();

alter table public.claim_profiles enable row level security;

revoke all on table public.claim_profiles from public, anon;
grant select, insert, update, delete on table public.claim_profiles to authenticated;

drop policy if exists "own claim_profiles read" on public.claim_profiles;
create policy "own claim_profiles read" on public.claim_profiles
  for select using (auth.uid() = user_id);

drop policy if exists "own claim_profiles insert" on public.claim_profiles;
create policy "own claim_profiles insert" on public.claim_profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists "own claim_profiles update" on public.claim_profiles;
create policy "own claim_profiles update" on public.claim_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own claim_profiles delete" on public.claim_profiles;
create policy "own claim_profiles delete" on public.claim_profiles
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- claim_profile_addresses: current + prior, with optional lived-from/to dates
-- ---------------------------------------------------------------------------
create table if not exists public.claim_profile_addresses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null,
  line1       text not null,
  line2       text,
  city        text not null,
  state       text not null,
  zip         text not null,
  lived_from  date,
  lived_to    date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.claim_profile_addresses is
  'Current and prior addresses for claim forms, with optional dates. RLS: own rows only. Current address is also mirrored onto profiles.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'claim_profile_addresses_kind_check'
       and conrelid = 'public.claim_profile_addresses'::regclass
  ) then
    alter table public.claim_profile_addresses
      add constraint claim_profile_addresses_kind_check
      check (kind in ('current', 'prior'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'claim_profile_addresses_state_check'
       and conrelid = 'public.claim_profile_addresses'::regclass
  ) then
    alter table public.claim_profile_addresses
      add constraint claim_profile_addresses_state_check
      check (state ~ '^[A-Z]{2}$');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'claim_profile_addresses_zip_check'
       and conrelid = 'public.claim_profile_addresses'::regclass
  ) then
    alter table public.claim_profile_addresses
      add constraint claim_profile_addresses_zip_check
      check (zip ~ '^\d{5}(-\d{4})?$');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'claim_profile_addresses_line1_len'
       and conrelid = 'public.claim_profile_addresses'::regclass
  ) then
    alter table public.claim_profile_addresses
      add constraint claim_profile_addresses_line1_len
      check (char_length(btrim(line1)) > 0 and char_length(line1) <= 200);
  end if;
end $$;

create unique index if not exists claim_profile_addresses_one_current
  on public.claim_profile_addresses (user_id)
  where kind = 'current';

create index if not exists claim_profile_addresses_user_idx
  on public.claim_profile_addresses (user_id, kind);

drop trigger if exists claim_profile_addresses_touch on public.claim_profile_addresses;
create trigger claim_profile_addresses_touch before update on public.claim_profile_addresses
  for each row execute function public.touch_updated_at();

alter table public.claim_profile_addresses enable row level security;

revoke all on table public.claim_profile_addresses from public, anon;
grant select, insert, update, delete on table public.claim_profile_addresses to authenticated;

drop policy if exists "own claim_profile_addresses read" on public.claim_profile_addresses;
create policy "own claim_profile_addresses read" on public.claim_profile_addresses
  for select using (auth.uid() = user_id);

drop policy if exists "own claim_profile_addresses insert" on public.claim_profile_addresses;
create policy "own claim_profile_addresses insert" on public.claim_profile_addresses
  for insert with check (auth.uid() = user_id);

drop policy if exists "own claim_profile_addresses update" on public.claim_profile_addresses;
create policy "own claim_profile_addresses update" on public.claim_profile_addresses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own claim_profile_addresses delete" on public.claim_profile_addresses;
create policy "own claim_profile_addresses delete" on public.claim_profile_addresses
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Per-settlement claim action (public CTA). Null keeps existing "Start your claim".
-- ---------------------------------------------------------------------------
alter table public.lawsuits
  add column if not exists claim_action_type text;

alter table public.lawsuits
  add column if not exists claim_action jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'lawsuits_claim_action_type_check'
       and conrelid = 'public.lawsuits'::regclass
  ) then
    alter table public.lawsuits
      add constraint lawsuits_claim_action_type_check
      check (
        claim_action_type is null
        or claim_action_type in (
          'desk_file',
          'online_form',
          'needs_notice_id',
          'mail_in',
          'automatic_payment',
          'not_open'
        )
      );
  end if;
end $$;

comment on column public.lawsuits.claim_action_type is
  'Public claim CTA: desk_file, online_form, needs_notice_id, mail_in, automatic_payment, not_open. Null = existing Start your claim path. Filled by owner-apply SQL, not ingest.';

comment on column public.lawsuits.claim_action is
  'Optional extras for the CTA (mail-to, form URL, address-update URL). Never a payout amount.';
