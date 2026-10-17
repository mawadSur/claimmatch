-- ClaimMatch 0008: a durable marker for the corrective notice (Phase 0, Part A).
-- EXPAND ONLY.
--
-- The app shows the D42 corrective notice ("ClaimMatch did not file this
-- claim"), with its one-tap "I already filed", on every claim that the retired
-- e-sign or File-all flow recorded as filed. Until now it found those claims
-- by their legacy status alone: 'submitted' without a confirmation number,
-- 'processing', 'approved', 'rejected' or 'paid'. The D38 data correction moves
-- exactly those rows to 'self_file', so the notice would disappear for
-- everyone who has not answered it yet.
--
-- claims.corrective_notice_required records that a claim needs the notice,
-- and no status change clears it:
--   - this file sets it on the rows that already carry the evidence: legacy
--     statuses other than 'submitted' (the 0006 CHECK refuses any update of a
--     'submitted' row without a number that leaves it 'submitted'), and rows
--     the e-sign or File-all flow stamped with filed_at or authorized_at;
--   - a trigger sets it whenever a claim in a legacy status, or with those
--     stamps, is updated, whoever updates it (the app or the correction).
-- The app shows the notice while the marker or a legacy status is present and
-- corrective_notice_answered_at is empty, whatever the current status.
--
-- Order: run after 0006 and BEFORE the D38 data correction. The correction
-- must not set corrective_notice_answered_at, and must not clear this column,
-- filed_at or authorized_at; the trigger then keeps the marker on every row it
-- moves. Part A code works with or without this file applied.
--
-- Safe on a production database that already has claims, and safe to re-run:
-- it adds one nullable column (no default, so no table rewrite) and only ever
-- sets it to true. Nothing is deleted and no status changes.
-- Rollback:
--   drop trigger if exists claims_keep_corrective_marker on public.claims;
--   drop function if exists public.claims_keep_corrective_marker();
--   alter table public.claims drop column if exists corrective_notice_required;

alter table public.claims add column if not exists corrective_notice_required boolean;

comment on column public.claims.corrective_notice_required is
  'True when the retired e-sign or File-all flow recorded this claim as filed, so the D42 corrective notice applies until corrective_notice_answered_at is set. Set by 0008 and its trigger; the app never clears it.';

create or replace function public.claims_keep_corrective_marker()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.corrective_notice_required is distinct from true
     and (old.status::text in ('processing', 'approved', 'rejected', 'paid')
          or (old.status::text = 'submitted' and coalesce(btrim(old.confirmation_number), '') = '')
          or old.filed_at is not null
          or old.authorized_at is not null)
  then
    new.corrective_notice_required := true;
  end if;
  return new;
end $$;

drop trigger if exists claims_keep_corrective_marker on public.claims;
create trigger claims_keep_corrective_marker before update on public.claims
  for each row execute function public.claims_keep_corrective_marker();

revoke all on function public.claims_keep_corrective_marker() from public, anon, authenticated;

update public.claims
   set corrective_notice_required = true
 where corrective_notice_required is distinct from true
   and status::text <> 'submitted'
   and (status::text in ('processing', 'approved', 'rejected', 'paid')
        or filed_at is not null
        or authorized_at is not null);
