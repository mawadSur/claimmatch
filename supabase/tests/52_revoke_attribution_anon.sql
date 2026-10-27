-- 0012: anon cannot execute persist_first_attribution; authenticated can.
-- scripts/db-test.sh runs this after every migration, including 0012.
\set ON_ERROR_STOP 1

do $$
begin
  if has_function_privilege(
    'anon',
    'public.persist_first_attribution(text, text, text, text, text)',
    'execute'
  ) then
    raise exception '0012: anon still has execute on persist_first_attribution';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.persist_first_attribution(text, text, text, text, text)',
    'execute'
  ) then
    raise exception '0012: authenticated lost execute on persist_first_attribution';
  end if;
end $$;

-- set local role anon: the call must fail with insufficient_privilege (42501)
-- before the function body runs (it would otherwise raise "not signed in").
begin;
set local role anon;
do $$
begin
  begin
    perform public.persist_first_attribution('a', 'b', 'c', 'd', 'e');
    raise exception '0012: anon was allowed to execute persist_first_attribution';
  exception
    when insufficient_privilege then
      null; -- SQLSTATE 42501
    when others then
      raise exception '0012: anon execute failed with SQLSTATE % (expected 42501): %',
        SQLSTATE, SQLERRM;
  end;
end $$;
rollback;

-- Authenticated, signed in: the body runs (no privilege error).
insert into auth.users (id, email)
values ('a2000000-0000-4000-8000-000000000012', 'attr-0012@example.com');

begin;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000012', true);
set local role authenticated;
select public.persist_first_attribution('twitter', 'social', 'launch', 'bio', 'tw1');
reset role;
commit;

do $$
declare src text;
begin
  select first_utm_source into src
    from public.profiles where id = 'a2000000-0000-4000-8000-000000000012';
  if src is distinct from 'twitter' then
    raise exception '0012: authenticated persist did not write first_utm_source (got %)', src;
  end if;
end $$;

delete from public.profiles where id = 'a2000000-0000-4000-8000-000000000012';
delete from auth.users where id = 'a2000000-0000-4000-8000-000000000012';
