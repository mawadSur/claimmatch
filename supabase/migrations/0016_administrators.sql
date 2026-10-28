-- ClaimMatch 0016: administrator registry and form mappings (stage 3 groundwork).
-- EXPAND ONLY. Do not edit 0015 or earlier.
--
-- Filing as an authorized agent stays off until DIRECT_FILING_ENABLED=1
-- (API adapters) or ASSISTED_FILING_ENABLED=1 (browser worker). Both default
-- off. Seeded administrators use filing_method = 'manual'.
--
-- Safe to re-run. Nothing is deleted.
-- Rollback:
--   alter table public.lawsuits drop column if exists administrator_id;
--   drop table if exists public.administrator_form_mappings;
--   drop table if exists public.administrators;

create table if not exists public.administrators (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  filing_method text not null default 'manual',
  homepage_url  text,
  notes         text,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'administrators_filing_method_check'
       and conrelid = 'public.administrators'::regclass
  ) then
    alter table public.administrators
      add constraint administrators_filing_method_check
      check (filing_method in ('manual', 'browser', 'api'));
  end if;
end $$;

comment on table public.administrators is
  'Settlement administrator registry (Epiq, Kroll, JND, Angeion, …). filing_method is manual, browser or api.';
comment on column public.administrators.filing_method is
  'How ClaimMatch may later submit: manual (export only), browser (Playwright / hosted browser), or api (administrator adapter).';

drop trigger if exists administrators_touch on public.administrators;
create trigger administrators_touch before update on public.administrators
  for each row execute function public.touch_updated_at();

insert into public.administrators (slug, name, filing_method, homepage_url)
values
  ('epiq', 'Epiq', 'manual', 'https://www.epiqglobal.com'),
  ('kroll', 'Kroll', 'manual', 'https://www.kroll.com'),
  ('jnd', 'JND Legal Administration', 'manual', 'https://www.jndla.com'),
  ('angeion', 'Angeion Group', 'manual', 'https://www.angeiongroup.com'),
  ('rust', 'Rust Consulting', 'manual', 'https://www.rustconsulting.com'),
  ('rg2', 'RG/2 Claims Administration', 'manual', 'https://www.rg2claims.com')
on conflict (slug) do nothing;

create table if not exists public.administrator_form_mappings (
  id                uuid primary key default gen_random_uuid(),
  administrator_id  uuid not null references public.administrators (id) on delete cascade,
  lawsuit_id        uuid references public.lawsuits (id) on delete cascade,
  mapping           jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists administrator_form_mappings_admin_lawsuit_idx
  on public.administrator_form_mappings (
    administrator_id,
    (coalesce(lawsuit_id, '00000000-0000-0000-0000-000000000000'::uuid))
  );

comment on table public.administrator_form_mappings is
  'Per-administrator (and optional per-settlement) official-form field mapping used by the browser worker.';

drop trigger if exists administrator_form_mappings_touch on public.administrator_form_mappings;
create trigger administrator_form_mappings_touch before update on public.administrator_form_mappings
  for each row execute function public.touch_updated_at();

alter table public.lawsuits
  add column if not exists administrator_id uuid references public.administrators (id) on delete set null;

comment on column public.lawsuits.administrator_id is
  'Optional FK to public.administrators. lawsuits.administrator (text) stays as the feed-provided name.';

alter table public.administrators enable row level security;
alter table public.administrator_form_mappings enable row level security;

drop policy if exists "administrators public read" on public.administrators;
create policy "administrators public read" on public.administrators
  for select
  using (enabled = true);

revoke all on table public.administrators from public, anon;
grant select on table public.administrators to anon, authenticated;
revoke insert, update, delete, truncate on table public.administrators from anon, authenticated;

revoke all on table public.administrator_form_mappings from public, anon, authenticated;
