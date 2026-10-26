-- Columns added by 0100_feed_presence.sql.
\set ON_ERROR_STOP 1

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'lawsuits' and column_name = 'last_seen_at'
  ) then
    raise exception '0100: lawsuits.last_seen_at is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'lawsuits' and column_name = 'missed_feed_count'
  ) then
    raise exception '0100: lawsuits.missed_feed_count is missing';
  end if;
end $$;

insert into public.lawsuits (slug, title) values ('feed-presence-default', 'Presence default');
do $$
declare seen timestamptz;
declare misses int;
begin
  select last_seen_at, missed_feed_count into seen, misses
    from public.lawsuits where slug = 'feed-presence-default';
  if seen is not null then
    raise exception '0100: last_seen_at must start null';
  end if;
  if misses <> 0 then
    raise exception '0100: missed_feed_count must default to 0';
  end if;
end $$;
delete from public.lawsuits where slug = 'feed-presence-default';
