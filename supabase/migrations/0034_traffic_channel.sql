-- ClaimMatch 0034: first-touch AI/search traffic channel on profiles.
-- EXPAND ONLY. Do not edit 0033 or earlier.
--
-- Closed-set channel (chatgpt, perplexity, copilot_bing, gemini,
-- google_organic, other) written once from signup metadata or
-- persist_first_traffic_channel. Later clicks never overwrite. No PII.
-- Public UI stays off until AI_REFERRER_ATTRIBUTION_ENABLED=1.
--
-- Safe to re-run. Nothing is deleted.
-- Rollback:
--   drop function if exists public.persist_first_traffic_channel(text);
--   alter table public.profiles drop column if exists first_traffic_channel;

alter table public.profiles
  add column if not exists first_traffic_channel text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'profiles_first_traffic_channel_ok'
       and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_first_traffic_channel_ok
      check (
        first_traffic_channel is null
        or first_traffic_channel in (
          'chatgpt',
          'perplexity',
          'copilot_bing',
          'gemini',
          'google_organic',
          'other'
        )
      );
  end if;
end $$;

comment on column public.profiles.first_traffic_channel is
  'First-touch AI/search channel. Closed set. Set once; later visits do not overwrite.';

create index if not exists profiles_first_traffic_channel_idx
  on public.profiles (first_traffic_channel)
  where first_traffic_channel is not null;

-- Authenticated users cannot write this column directly (0002 grant list).
-- The security-definer RPC below fills a blank once.

create or replace function public.persist_first_traffic_channel(p_channel text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if p_channel is null or p_channel = '' then
    return;
  end if;
  if p_channel not in (
    'chatgpt',
    'perplexity',
    'copilot_bing',
    'gemini',
    'google_organic',
    'other'
  ) then
    return;
  end if;
  update public.profiles
     set first_traffic_channel = coalesce(first_traffic_channel, p_channel)
   where id = auth.uid();
end $$;

revoke all on function public.persist_first_traffic_channel(text) from public;
revoke all on function public.persist_first_traffic_channel(text) from anon;
grant execute on function public.persist_first_traffic_channel(text) to authenticated;
grant execute on function public.persist_first_traffic_channel(text) to service_role;

-- Signup: copy first-touch UTMs + ref + channel from auth metadata (AuthForm).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ref_code text := nullif(new.raw_user_meta_data->>'ref', '');
  referrer uuid;
  channel text := nullif(new.raw_user_meta_data->>'traffic_channel', '');
begin
  if channel is not null and channel not in (
    'chatgpt',
    'perplexity',
    'copilot_bing',
    'gemini',
    'google_organic',
    'other'
  ) then
    channel := null;
  end if;

  if ref_code is not null then
    select id into referrer from public.profiles where referral_code = ref_code limit 1;
  end if;

  insert into public.profiles (
    id, email, full_name, referral_code, referred_by,
    first_utm_source, first_utm_medium, first_utm_campaign, first_utm_content, first_ref,
    first_traffic_channel
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
    ref_code,
    channel
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

-- Classify existing first_utm_source values we already store. Unknown sources
-- stay null so the app can still tag them as "other" at query time.
update public.profiles
   set first_traffic_channel = case
     when lower(coalesce(first_utm_source, '')) like '%chatgpt%'
       or lower(coalesce(first_utm_source, '')) = 'openai' then 'chatgpt'
     when lower(coalesce(first_utm_source, '')) like '%perplexity%' then 'perplexity'
     when lower(coalesce(first_utm_source, '')) like '%copilot%'
       or lower(coalesce(first_utm_source, '')) in ('bing', 'msn') then 'copilot_bing'
     when lower(coalesce(first_utm_source, '')) like '%gemini%'
       or lower(coalesce(first_utm_source, '')) = 'bard' then 'gemini'
     when lower(coalesce(first_utm_source, '')) in ('google', 'google.com') then 'google_organic'
     else first_traffic_channel
   end
 where first_traffic_channel is null
   and first_utm_source is not null
   and first_utm_source <> '';
