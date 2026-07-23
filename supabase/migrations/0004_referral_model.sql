-- ClaimMatch — referral-model realignment
--
-- Business-model change (now locked): ClaimMatch is FREE to users and earns
-- referral / lead fees from partner services. It NEVER takes a percentage of a
-- user's recovery, and it never files on the user's behalf — it pre-fills forms
-- and deep-links the user to the OFFICIAL administrator site, where the user
-- reviews and submits personally.
--
-- The recoveries ledger therefore tracks only how much the USER recovered:
-- our "fee" is zero and net always equals gross. This migration rewrites the
-- 0002 contingency-fee columns to match.
--
-- Apply BY HAND — this repo has no automated migration runner:
--   `supabase db push`  — or paste this file into the Supabase SQL editor.
-- Idempotent: safe to run more than once.

-- Drop the old contingency generated columns. In 0002 these were computed from a
-- 15% fee_pct (fee_amount = gross*fee_pct, net_amount = gross*(1-fee_pct)).
alter table public.recoveries drop column if exists fee_amount;
alter table public.recoveries drop column if exists net_amount;

-- Our cut is now zero. Default fee_pct to 0 and zero out every existing row.
alter table public.recoveries alter column fee_pct set default 0;
update public.recoveries set fee_pct = 0 where fee_pct is distinct from 0;

-- Re-add net_amount as what the member actually keeps: the full gross, no fee.
alter table public.recoveries
  add column if not exists net_amount numeric
  generated always as (round(gross_amount, 2)) stored;
