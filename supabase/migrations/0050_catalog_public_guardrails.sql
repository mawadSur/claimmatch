-- ClaimMatch 0050: hide test listings + manual deadline override.
-- EXPAND ONLY. Do not edit 0049 or earlier.
--
-- is_test: rows that must never appear on public pages or the sitemap.
-- Existing test/dummy listings stay in the table; nothing is deleted.
--
-- deadline_override: admin-set public deadline. The feed deadline column is
-- unchanged. Public pages, the sitemap, alerts and past-deadline logic use
-- coalesce(deadline_override, deadline). Nightly ingest must not write these
-- override columns.
--
-- Safe to re-run. Nothing is deleted.
-- Rollback:
--   alter table public.lawsuits drop column if exists is_test;
--   alter table public.lawsuits drop column if exists deadline_override;
--   alter table public.lawsuits drop column if exists deadline_override_note;
--   alter table public.lawsuits drop column if exists deadline_override_at;

alter table public.lawsuits
  add column if not exists is_test boolean not null default false;

alter table public.lawsuits
  add column if not exists deadline_override date;

alter table public.lawsuits
  add column if not exists deadline_override_note text;

alter table public.lawsuits
  add column if not exists deadline_override_at timestamptz;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'lawsuits_deadline_override_note_len'
       and conrelid = 'public.lawsuits'::regclass
  ) then
    alter table public.lawsuits
      add constraint lawsuits_deadline_override_note_len
      check (
        deadline_override_note is null
        or char_length(deadline_override_note) <= 280
      );
  end if;
end $$;

comment on column public.lawsuits.is_test is
  'When true, the listing is excluded from public pages, the sitemap and public APIs. Never deleted.';

comment on column public.lawsuits.deadline_override is
  'Admin-set public claim deadline (YYYY-MM-DD). Null means use lawsuits.deadline. Ingest must not write this.';

comment on column public.lawsuits.deadline_override_note is
  'Optional reason for deadline_override. Never shown on public pages.';

comment on column public.lawsuits.deadline_override_at is
  'When deadline_override was last set or cleared.';

create index if not exists lawsuits_is_test_idx
  on public.lawsuits (is_test)
  where is_test;

create index if not exists lawsuits_deadline_override_idx
  on public.lawsuits (deadline_override)
  where deadline_override is not null;
