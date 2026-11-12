-- ClaimMatch 0036: opt-in "new match" alert send log and one-click start tokens.
-- EXPAND ONLY. Do not edit 0035 or earlier.
--
-- Feature flag (default off): MATCH_ALERT_EMAILS_ENABLED.
-- This migration only adds tables/columns and updates the signup trigger so an
-- explicit signup checkbox can set profiles.email_opt_in. It does not send email.
--
-- Safe to re-run. Nothing is deleted.
-- Rollback:
--   drop table if exists public.match_alert_tokens;
--   drop table if exists public.match_alert_sends;
--   alter table public.subscribers drop column if exists unsubscribed_at;
--   -- restore handle_new_user from 0034 if needed

-- Newsletter subscribers who used one-click unsubscribe.
alter table public.subscribers
  add column if not exists unsubscribed_at timestamptz;

create index if not exists subscribers_unsubscribed_idx
  on public.subscribers (unsubscribed_at)
  where unsubscribed_at is null;

comment on column public.subscribers.unsubscribed_at is
  'Set when the address unsubscribes. Confirmed rows with a null value remain opted in to match alerts.';

create table if not exists public.match_alert_sends (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  user_id     uuid references auth.users(id) on delete cascade,
  lawsuit_id  uuid not null references public.lawsuits(id) on delete cascade,
  source      text not null,
  sent_at     timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'match_alert_sends_source_check'
       and conrelid = 'public.match_alert_sends'::regclass
  ) then
    alter table public.match_alert_sends
      add constraint match_alert_sends_source_check
      check (source in ('profile', 'subscriber'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'match_alert_sends_email_lawsuit_key'
       and conrelid = 'public.match_alert_sends'::regclass
  ) then
    alter table public.match_alert_sends
      add constraint match_alert_sends_email_lawsuit_key
      unique (email, lawsuit_id);
  end if;
end $$;

create index if not exists match_alert_sends_email_sent_idx
  on public.match_alert_sends (email, sent_at desc);

create index if not exists match_alert_sends_user_idx
  on public.match_alert_sends (user_id, sent_at desc)
  where user_id is not null;

comment on table public.match_alert_sends is
  'One row per email+lawsuit after a successful match-alert Resend send. Service role only. Cap: one email per address per week is enforced in the job.';

alter table public.match_alert_sends enable row level security;

revoke all on table public.match_alert_sends from public, anon, authenticated;

create table if not exists public.match_alert_tokens (
  id          uuid primary key default gen_random_uuid(),
  token_hash  text not null,
  email       text not null,
  lawsuit_id  uuid not null references public.lawsuits(id) on delete cascade,
  send_id     uuid references public.match_alert_sends(id) on delete set null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'match_alert_tokens_hash_key'
       and conrelid = 'public.match_alert_tokens'::regclass
  ) then
    alter table public.match_alert_tokens
      add constraint match_alert_tokens_hash_key
      unique (token_hash);
  end if;
end $$;

create index if not exists match_alert_tokens_email_idx
  on public.match_alert_tokens (email, created_at desc);

create index if not exists match_alert_tokens_unused_idx
  on public.match_alert_tokens (token_hash)
  where used_at is null;

comment on table public.match_alert_tokens is
  'Hashed one-click start tokens (email + claim, 72h). Raw tokens never stored. Service role only.';

alter table public.match_alert_tokens enable row level security;

revoke all on table public.match_alert_tokens from public, anon, authenticated;

-- Signup: copy first-touch UTMs + ref + channel from auth metadata (AuthForm),
-- and honor an explicit email_opt_in checkbox (default remains false).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ref_code text := nullif(new.raw_user_meta_data->>'ref', '');
  referrer uuid;
  channel text := nullif(new.raw_user_meta_data->>'traffic_channel', '');
  alerts_opt_in boolean := false;
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

  if lower(coalesce(new.raw_user_meta_data->>'email_opt_in', '')) in ('true', '1', 't') then
    alerts_opt_in := true;
  end if;

  if ref_code is not null then
    select id into referrer from public.profiles where referral_code = ref_code limit 1;
  end if;

  insert into public.profiles (
    id, email, full_name, referral_code, referred_by,
    first_utm_source, first_utm_medium, first_utm_campaign, first_utm_content, first_ref,
    first_traffic_channel, email_opt_in
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
    channel,
    alerts_opt_in
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
