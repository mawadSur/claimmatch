-- ClaimMatch 0024: self-serve account deletion audit (no PII).
-- EXPAND ONLY. Do not edit 0023 or earlier.
--
-- One row per deletion request. Stores no email, name, address or health
-- answers. The auth user and owned rows are removed by the service role.
--
-- Safe to re-run. Nothing is deleted.
-- Rollback:
--   drop table if exists public.account_deletion_audit;

create table if not exists public.account_deletion_audit (
  id          uuid primary key default gen_random_uuid(),
  reason      text not null default 'self_serve',
  created_at  timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'account_deletion_audit_reason_check'
       and conrelid = 'public.account_deletion_audit'::regclass
  ) then
    alter table public.account_deletion_audit
      add constraint account_deletion_audit_reason_check
      check (reason in ('self_serve', 'admin'));
  end if;
end $$;

comment on table public.account_deletion_audit is
  'Account deletion events. No PII: no email, name, address or attributes.';

alter table public.account_deletion_audit enable row level security;

revoke all on table public.account_deletion_audit from public, anon, authenticated;
