-- ClaimMatch 0023: per-settlement third-party fee policy.
-- EXPAND ONLY. Do not edit 0022 or earlier.
--
-- Some settlements may bar third-party fees. Stage 2 must never offer a paid
-- filing unless the status is allowed. Default is unknown (not allowed).
-- third_party_fee_allowed is generated: true only when status = allowed.
--
-- Safe to re-run. Nothing is deleted.
-- Rollback:
--   alter table public.lawsuits drop column if exists third_party_fee_allowed;
--   alter table public.lawsuits drop column if exists third_party_fee_status;

alter table public.lawsuits
  add column if not exists third_party_fee_status text not null default 'unknown';

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'lawsuits_third_party_fee_status_check'
       and conrelid = 'public.lawsuits'::regclass
  ) then
    alter table public.lawsuits
      add constraint lawsuits_third_party_fee_status_check
      check (third_party_fee_status in ('unknown', 'allowed', 'barred'));
  end if;
end $$;

alter table public.lawsuits
  add column if not exists third_party_fee_allowed boolean
    generated always as (third_party_fee_status = 'allowed') stored;

comment on column public.lawsuits.third_party_fee_status is
  'Whether a third-party fee is allowed on this settlement: unknown, allowed or barred.';
comment on column public.lawsuits.third_party_fee_allowed is
  'True only when third_party_fee_status is allowed. Default false.';
