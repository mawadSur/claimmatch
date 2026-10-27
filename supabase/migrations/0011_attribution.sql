-- ClaimMatch 0011: first-touch attribution + tracked share links.
-- EXPAND ONLY. Numbered 0011 so 0010 stays free for the feed-presence PR.
--
-- profiles: first_utm_source / first_utm_medium / first_utm_campaign /
-- first_utm_content / first_ref. Written once (signup metadata or
-- persist_first_attribution). Later clicks never overwrite.
--
-- share_links: admin campaign codes (destination + UTM fields + label).
-- share_link_clicks: one row per /r/:code hit (campaign or personal referral).
-- Signup counts are profiles.first_ref (and referrals.signed_up for personal).
--
-- Safe to re-run. Nothing is deleted.
-- Rollback:
--   drop function if exists public.persist_first_attribution(text, text, text, text, text);
--   drop table if exists public.share_link_clicks;
--   drop table if exists public.share_links;
--   alter table public.profiles
--     drop column if exists first_utm_source,
--     drop column if exists first_utm_medium,
--     drop column if exists first_utm_campaign,
--     drop column if exists first_utm_content,
--     drop column if exists first_ref;

alter table public.profiles add column if not exists first_utm_source text;
alter table public.profiles add column if not exists first_utm_medium text;
alter table public.profiles add column if not exists first_utm_campaign text;
alter table public.profiles add column if not exists first_utm_content text;
alter table public.profiles add column if not exists first_ref text;

comment on column public.profiles.first_utm_source is
  'First-touch utm_source. Set once; later campaigns do not overwrite.';
comment on column public.profiles.first_ref is
  'First-touch ref / share / referral code. Set once.';

create table if not exists public.share_links (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  destination   text not null default '/',
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  label         text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists share_links_created_at_idx
  on public.share_links (created_at desc);

create table if not exists public.share_link_clicks (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists share_link_clicks_code_idx
  on public.share_link_clicks (code);

alter table public.share_links enable row level security;
alter table public.share_link_clicks enable row level security;

-- No authenticated/anon policies: browsers never read these tables. The
-- /r/:code route and the admin API use the service role.

create or replace function public.persist_first_attribution(
  p_utm_source text,
  p_utm_medium text,
  p_utm_campaign text,
  p_utm_content text,
  p_ref text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  update public.profiles
     set first_utm_source   = coalesce(first_utm_source,   nullif(p_utm_source, '')),
         first_utm_medium   = coalesce(first_utm_medium,   nullif(p_utm_medium, '')),
         first_utm_campaign = coalesce(first_utm_campaign, nullif(p_utm_campaign, '')),
         first_utm_content  = coalesce(first_utm_content,  nullif(p_utm_content, '')),
         first_ref          = coalesce(first_ref,          nullif(p_ref, ''))
   where id = auth.uid();
end $$;

revoke all on function public.persist_first_attribution(text, text, text, text, text) from public;
grant execute on function public.persist_first_attribution(text, text, text, text, text) to authenticated;

-- Signup: copy first-touch UTMs + ref from auth metadata (AuthForm).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ref_code text := nullif(new.raw_user_meta_data->>'ref', '');
  referrer uuid;
begin
  if ref_code is not null then
    select id into referrer from public.profiles where referral_code = ref_code limit 1;
  end if;

  insert into public.profiles (
    id, email, full_name, referral_code, referred_by,
    first_utm_source, first_utm_medium, first_utm_campaign, first_utm_content, first_ref
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    public.gen_referral_code(),
    referrer,
    nullif(new.raw_user_meta_data->>'utm_source', ''),
    nullif(new.raw_user_meta_data->>'utm_medium', ''),
    nullif(new.raw_user_meta_data->>'utm_campaign', ''),
    nullif(new.raw_user_meta_data->>'utm_content', ''),
    ref_code
  )
  on conflict (id) do nothing;

  if referrer is not null then
    update public.referrals
      set status = 'signed_up', referred_user = new.id
      where referrer_id = referrer
        and status = 'pending'
        and (referred_email = new.email or referred_email is null);
  end if;

  return new;
end $$;
