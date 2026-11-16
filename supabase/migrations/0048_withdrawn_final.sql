-- 0048: a withdrawn claim is final (founder decision 2026-11-15,
-- docs/legal/signoff-checklist.md).
--
-- The app never moves a claim out of withdrawn (src/lib/claims.ts,
-- CLAIM_TRANSITIONS in src/lib/filing/v2/contract-base.ts), and 0042 already
-- refuses withdrawn -> any one-click status. This closes the rest in the
-- database: withdrawn -> self_file, reported_filed, submitted or any other
-- status is refused with CM001, whoever writes it (claim_apply_change,
-- filing_move_claim or a direct update). A member who changes their mind
-- files on the official site; nothing reopens the withdrawn claim.
--
-- Additive and idempotent: one function and one trigger, replaced in place.
-- Independent of 0037. Does not touch existing rows. Rollback:
--   drop trigger if exists claims_withdrawn_final on public.claims;
--   drop function if exists public.claims_withdrawn_final();

create or replace function public.claims_withdrawn_final()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.status = 'withdrawn' and new.status is distinct from old.status then
    raise exception 'a withdrawn claim is final: it cannot move to %', new.status using errcode = 'CM001';
  end if;
  return new;
end $$;

drop trigger if exists claims_withdrawn_final on public.claims;
create trigger claims_withdrawn_final before update of status on public.claims
  for each row execute function public.claims_withdrawn_final();

revoke all on function public.claims_withdrawn_final() from public, anon, authenticated;
