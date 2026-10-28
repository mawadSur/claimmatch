-- ClaimMatch 0022: user-reported payouts on recoveries.
-- EXPAND ONLY. Do not edit 0021 or earlier.
--
-- Users may record that they were paid (amount, date, method). No fee is
-- calculated, shown or invoiced. User-reported rows set fee_pct = 0 so the
-- generated fee_amount stays 0. Writes stay off until PAYOUT_REPORT_ENABLED=1.
--
-- Safe to re-run. Nothing is deleted.
-- Rollback:
--   alter table public.recoveries drop column if exists source;
--   alter table public.recoveries drop column if exists payout_method;
--   alter table public.recoveries drop column if exists user_reported_at;

alter table public.recoveries
  add column if not exists source text not null default 'legacy';

alter table public.recoveries
  add column if not exists payout_method text;

alter table public.recoveries
  add column if not exists user_reported_at timestamptz;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'recoveries_source_check'
       and conrelid = 'public.recoveries'::regclass
  ) then
    alter table public.recoveries
      add constraint recoveries_source_check
      check (source in ('legacy', 'user_reported'));
  end if;
  if not exists (
    select 1
      from pg_constraint
     where conname = 'recoveries_payout_method_check'
       and conrelid = 'public.recoveries'::regclass
  ) then
    alter table public.recoveries
      add constraint recoveries_payout_method_check
      check (payout_method is null or payout_method in ('check', 'card', 'e_payment', 'other'));
  end if;
end $$;

comment on column public.recoveries.source is
  'legacy = retired e-sign ledger; user_reported = the member said they were paid.';
comment on column public.recoveries.payout_method is
  'How the administrator paid the member (user-reported). Never a ClaimMatch payment.';
