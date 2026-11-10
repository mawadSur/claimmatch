-- 0034: first_traffic_channel on profiles; persist_first_traffic_channel is
-- first-touch, authenticated-only, and ignores junk values.
\set ON_ERROR_STOP 1

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'first_traffic_channel'
  ) then
    raise exception '0034: profiles.first_traffic_channel is missing';
  end if;
  if has_function_privilege(
    'anon',
    'public.persist_first_traffic_channel(text)',
    'execute'
  ) then
    raise exception '0034: anon still has execute on persist_first_traffic_channel';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.persist_first_traffic_channel(text)',
    'execute'
  ) then
    raise exception '0034: authenticated lost execute on persist_first_traffic_channel';
  end if;
end $$;

begin;
set local role anon;
do $$
begin
  begin
    perform public.persist_first_traffic_channel('chatgpt');
    raise exception '0034: anon was allowed to execute persist_first_traffic_channel';
  exception
    when insufficient_privilege then
      null;
    when others then
      raise exception '0034: anon execute failed with SQLSTATE % (expected 42501): %',
        SQLSTATE, SQLERRM;
  end;
end $$;
rollback;

-- Signup copies a closed-set traffic_channel from auth metadata.
insert into auth.users (id, email, raw_user_meta_data)
values (
  'a0000000-0000-4000-8000-0000000000c1',
  'channel-signup@example.test',
  jsonb_build_object(
    'full_name', 'Channel User',
    'utm_source', 'chatgpt.com',
    'traffic_channel', 'chatgpt'
  )
);

do $$
declare
  src text;
  ch text;
begin
  select first_utm_source, first_traffic_channel into src, ch
    from public.profiles
   where id = 'a0000000-0000-4000-8000-0000000000c1';
  if src is distinct from 'chatgpt.com' then
    raise exception '0034: signup did not store first_utm_source (got %)', src;
  end if;
  if ch is distinct from 'chatgpt' then
    raise exception '0034: signup did not store first_traffic_channel (got %)', ch;
  end if;
end $$;

-- Junk channel values on signup are dropped.
insert into auth.users (id, email, raw_user_meta_data)
values (
  'a0000000-0000-4000-8000-0000000000c2',
  'channel-junk@example.test',
  jsonb_build_object('traffic_channel', 'not-a-channel')
);

do $$
declare
  ch text;
begin
  select first_traffic_channel into ch
    from public.profiles
   where id = 'a0000000-0000-4000-8000-0000000000c2';
  if ch is not null then
    raise exception '0034: junk traffic_channel was stored (got %)', ch;
  end if;
end $$;

-- Authenticated persist is first-touch and ignores unknown strings.
begin;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-0000000000c2', true);
select public.persist_first_traffic_channel('chatgpt');
select public.persist_first_traffic_channel('perplexity');
select public.persist_first_traffic_channel('nope');
commit;

do $$
declare
  ch text;
begin
  select first_traffic_channel into ch
    from public.profiles
   where id = 'a0000000-0000-4000-8000-0000000000c2';
  if ch is distinct from 'chatgpt' then
    raise exception '0034: persist was not first-touch (got %)', ch;
  end if;
end $$;
