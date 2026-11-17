-- ClaimMatch 0049: "I filed this myself" self-reports + private confirmation
-- screenshots.
-- EXPAND ONLY. Do not edit 0048 or earlier.
--
-- Feature flag (default off):
--   SELF_FILED_REPORT_ENABLED
-- This migration only adds a table and a private storage bucket. It does not
-- change claim statuses, the trust scorecard, or public pages. UI and API
-- writes stay off until the flag is exactly "1".
--
-- Safe to re-run. Nothing is deleted.
-- Rollback:
--   drop table if exists public.self_filed_reports;
--   -- storage (production / Supabase only; skipped in plain-Postgres CI):
--   --   delete from storage.objects where bucket_id = 'self-filed-confirmations';
--   --   delete from storage.buckets where id = 'self-filed-confirmations';

create table if not exists public.self_filed_reports (
  id                         uuid primary key default gen_random_uuid(),
  user_id                    uuid not null references auth.users(id) on delete cascade,
  lawsuit_id                 uuid not null references public.lawsuits(id) on delete cascade,
  claim_id                   uuid not null references public.claims(id) on delete cascade,
  confirmation_number        text,
  confirmation_storage_path  text,
  confirmation_mime          text,
  confirmation_bytes         integer,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (user_id, lawsuit_id)
);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'self_filed_reports_confirmation_number_len'
       and conrelid = 'public.self_filed_reports'::regclass
  ) then
    alter table public.self_filed_reports
      add constraint self_filed_reports_confirmation_number_len
      check (confirmation_number is null or char_length(confirmation_number) <= 64);
  end if;
  if not exists (
    select 1
      from pg_constraint
     where conname = 'self_filed_reports_confirmation_mime_check'
       and conrelid = 'public.self_filed_reports'::regclass
  ) then
    alter table public.self_filed_reports
      add constraint self_filed_reports_confirmation_mime_check
      check (
        confirmation_mime is null
        or confirmation_mime in (
          'image/jpeg', 'image/png', 'image/heic', 'image/heif',
          'image/webp', 'application/pdf'
        )
      );
  end if;
  if not exists (
    select 1
      from pg_constraint
     where conname = 'self_filed_reports_confirmation_bytes_check'
       and conrelid = 'public.self_filed_reports'::regclass
  ) then
    alter table public.self_filed_reports
      add constraint self_filed_reports_confirmation_bytes_check
      check (
        confirmation_bytes is null
        or (confirmation_bytes >= 1 and confirmation_bytes <= 10485760)
      );
  end if;
  if not exists (
    select 1
      from pg_constraint
     where conname = 'self_filed_reports_screenshot_together'
       and conrelid = 'public.self_filed_reports'::regclass
  ) then
    alter table public.self_filed_reports
      add constraint self_filed_reports_screenshot_together
      check (
        (confirmation_storage_path is null
          and confirmation_mime is null
          and confirmation_bytes is null)
        or (confirmation_storage_path is not null
          and confirmation_mime is not null
          and confirmation_bytes is not null)
      );
  end if;
end $$;

comment on table public.self_filed_reports is
  'User said they filed this claim on the official site. One row per user per settlement. Screenshot files live in the private self-filed-confirmations bucket. Public UI stays off until SELF_FILED_REPORT_ENABLED=1.';
comment on column public.self_filed_reports.confirmation_number is
  'Optional administrator confirmation number, also stored on the claim. Never sent to PostHog.';
comment on column public.self_filed_reports.confirmation_storage_path is
  'Private storage path {user_id}/{report_id}/confirmation.{ext}. Null when no screenshot was uploaded.';

create index if not exists self_filed_reports_user_idx
  on public.self_filed_reports (user_id, created_at desc);
create index if not exists self_filed_reports_claim_idx
  on public.self_filed_reports (claim_id);

alter table public.self_filed_reports enable row level security;

drop policy if exists "own self_filed_reports read" on public.self_filed_reports;
create policy "own self_filed_reports read" on public.self_filed_reports
  for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "own self_filed_reports insert" on public.self_filed_reports;
create policy "own self_filed_reports insert" on public.self_filed_reports
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "own self_filed_reports update" on public.self_filed_reports;
create policy "own self_filed_reports update" on public.self_filed_reports
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own self_filed_reports delete" on public.self_filed_reports;
create policy "own self_filed_reports delete" on public.self_filed_reports
  for delete
  to authenticated
  using (auth.uid() = user_id);

revoke all on table public.self_filed_reports from public, anon;
grant select, insert, update, delete on table public.self_filed_reports to authenticated;

-- Private storage bucket for confirmation screenshots. Paths
-- {user_id}/{report_id}/confirmation.{ext}. Members and admins may read;
-- no API role may write: uploads use signed URLs the server creates for a
-- path it chose. Plain PostgreSQL (CI) has no storage schema, so this part
-- is skipped there.
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null
     or to_regprocedure('storage.foldername(text)') is null then
    raise notice '0049: no Supabase storage schema here; skipping the self-filed-confirmations bucket';
    return;
  end if;
  insert into storage.buckets (id, name, public)
    values ('self-filed-confirmations', 'self-filed-confirmations', false)
  on conflict (id) do update set public = false;
  if exists (select 1 from information_schema.columns where table_schema = 'storage'
              and table_name = 'buckets' and column_name = 'file_size_limit') then
    execute $q$update storage.buckets set file_size_limit = 10485760 where id = 'self-filed-confirmations'$q$;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'storage'
              and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    execute $q$update storage.buckets
      set allowed_mime_types = array['image/jpeg', 'image/png', 'image/heic', 'image/heif',
                                     'image/webp', 'application/pdf']
      where id = 'self-filed-confirmations'$q$;
  end if;
  execute $q$drop policy if exists "self-filed confirmations: members read own" on storage.objects$q$;
  execute $q$create policy "self-filed confirmations: members read own" on storage.objects
    for select to authenticated
    using (
      bucket_id = 'self-filed-confirmations'
      and array_length(storage.foldername(name), 1) >= 1
      and (
        (storage.foldername(name))[1] = (select auth.uid())::text
        or public.is_admin()
      )
    )$q$;
end $$;
