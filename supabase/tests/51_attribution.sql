-- Columns and tables added by 0011_attribution.sql.
\set ON_ERROR_STOP 1

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'first_utm_source'
  ) then
    raise exception '0011: profiles.first_utm_source is missing';
  end if;
  if to_regclass('public.share_links') is null then
    raise exception '0011: share_links is missing';
  end if;
  if to_regclass('public.share_link_clicks') is null then
    raise exception '0011: share_link_clicks is missing';
  end if;
end $$;

-- Signup copies first-touch UTMs + ref from auth metadata.
insert into auth.users (id, email, raw_user_meta_data)
values (
  'a1000000-0000-4000-8000-000000000011',
  'attr@example.com',
  jsonb_build_object(
    'full_name', 'Attr',
    'ref', 'tw1',
    'utm_source', 'twitter',
    'utm_medium', 'social',
    'utm_campaign', 'launch',
    'utm_content', 'bio'
  )
);

do $$
declare src text;
declare ref text;
begin
  select first_utm_source, first_ref into src, ref
    from public.profiles where id = 'a1000000-0000-4000-8000-000000000011';
  if src is distinct from 'twitter' then
    raise exception '0011: signup did not store first_utm_source (got %)', src;
  end if;
  if ref is distinct from 'tw1' then
    raise exception '0011: signup did not store first_ref (got %)', ref;
  end if;
end $$;

-- Later values must not overwrite first-touch.
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000011', true);
select public.persist_first_attribution('facebook', 'cpc', 'later', 'ad', 'fb1');

do $$
declare src text;
declare ref text;
begin
  select first_utm_source, first_ref into src, ref
    from public.profiles where id = 'a1000000-0000-4000-8000-000000000011';
  if src <> 'twitter' then
    raise exception '0011: first-touch utm_source was overwritten (got %)', src;
  end if;
  if ref <> 'tw1' then
    raise exception '0011: first-touch ref was overwritten (got %)', ref;
  end if;
end $$;

insert into public.share_links (code, destination, utm_source, label)
values ('tw1', '/', 'twitter', 'Twitter');
insert into public.share_link_clicks (code) values ('tw1'), ('tw1');

do $$
declare n int;
begin
  select count(*) into n from public.share_link_clicks where code = 'tw1';
  if n <> 2 then
    raise exception '0011: expected 2 clicks, got %', n;
  end if;
end $$;

delete from public.share_link_clicks where code = 'tw1';
delete from public.share_links where code = 'tw1';
delete from public.profiles where id = 'a1000000-0000-4000-8000-000000000011';
delete from auth.users where id = 'a1000000-0000-4000-8000-000000000011';
