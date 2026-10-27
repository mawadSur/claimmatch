-- ClaimMatch 0013: verified fields on lawsuits (C7).
-- EXPAND ONLY. Numbered 0013 so 0012 stays free for the thin-data /
-- attribution-revoke PR.
--
-- lawsuits.verified_at / verified_by: set only by an admin "mark verified"
-- action (never by the public client). The public "Verified on {date}" badge
-- reads these plus the verified content columns.
--
-- lawsuits.eligibility_verified: who qualifies, as a human checked it.
-- lawsuits.proof_verified: yes / no / optional / unknown (not a boolean).
-- lawsuits.form_field_order: reserved for C10 (brief 3b); unused here.
--
-- RLS unchanged: public read of published rows only through the existing
-- policies. Anon and authenticated still cannot write the catalog.
--
-- Safe to re-run. Nothing is deleted.
-- Rollback (not recommended once rows are verified; this only drops columns):
--   alter table public.lawsuits
--     drop constraint if exists lawsuits_proof_verified_check,
--     drop column if exists form_field_order,
--     drop column if exists proof_verified,
--     drop column if exists eligibility_verified,
--     drop column if exists verified_by,
--     drop column if exists verified_at;

alter table public.lawsuits add column if not exists verified_at timestamptz;
alter table public.lawsuits add column if not exists verified_by uuid references auth.users (id) on delete set null;
alter table public.lawsuits add column if not exists eligibility_verified text;
alter table public.lawsuits add column if not exists proof_verified text;
alter table public.lawsuits add column if not exists form_field_order text[];

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'lawsuits_proof_verified_check'
       and conrelid = 'public.lawsuits'::regclass
  ) then
    alter table public.lawsuits
      add constraint lawsuits_proof_verified_check
      check (
        proof_verified is null
        or proof_verified in ('yes', 'no', 'optional', 'unknown')
      );
  end if;
end $$;

comment on column public.lawsuits.verified_at is
  'When an admin marked this listing verified against the official notice. Null = no public verified badge.';
comment on column public.lawsuits.verified_by is
  'auth.users id of the admin who set verified_at. Set only by the admin API.';
comment on column public.lawsuits.eligibility_verified is
  'Who qualifies, as checked against the official notice. Preferred over eligibility_text when verified.';
comment on column public.lawsuits.proof_verified is
  'Proof rule as checked: yes / no / optional / unknown. Not a boolean.';
comment on column public.lawsuits.form_field_order is
  'Optional official-form field order (C10). Null = default packet order.';

create index if not exists lawsuits_verified_at_idx
  on public.lawsuits (verified_at)
  where verified_at is not null;
