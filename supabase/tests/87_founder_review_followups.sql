-- Official-form opens and expanded drip kinds from 0055.
\set ON_ERROR_STOP 1

\echo '  1 official_form_opens first-open-wins; drip kinds 24h and trial_will_end'

do $$
begin
  if to_regclass('public.official_form_opens') is null then
    raise exception '0055: official_form_opens is missing';
  end if;
end $$;

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000055', 'followup-a@example.test')
on conflict (id) do nothing;

insert into public.lawsuits (id, slug, title)
values (
  '10000000-0000-4000-8000-000000000055',
  'followup-test-settlement',
  'Follow-up test settlement'
)
on conflict (id) do nothing;

insert into public.claims (id, user_id, lawsuit_id, lawsuit_title, status)
values (
  'c0000000-0000-4000-8000-000000000055',
  'a0000000-0000-4000-8000-000000000055',
  '10000000-0000-4000-8000-000000000055',
  'Follow-up test settlement',
  'self_file'
)
on conflict (id) do nothing;

insert into public.official_form_opens (user_id, lawsuit_id)
values (
  'a0000000-0000-4000-8000-000000000055',
  '10000000-0000-4000-8000-000000000055'
);

do $$
begin
  begin
    insert into public.official_form_opens (user_id, lawsuit_id)
    values (
      'a0000000-0000-4000-8000-000000000055',
      '10000000-0000-4000-8000-000000000055'
    );
    raise exception '0055: official_form_opens accepted a duplicate open';
  exception
    when unique_violation then
      null;
  end;
end $$;

insert into public.drip_email_sends (user_id, kind, claim_id, lawsuit_id)
values (
  'a0000000-0000-4000-8000-000000000055',
  'did_you_file_24h',
  'c0000000-0000-4000-8000-000000000055',
  '10000000-0000-4000-8000-000000000055'
);

insert into public.drip_email_sends (user_id, kind, stripe_subscription_id)
values (
  'a0000000-0000-4000-8000-000000000055',
  'trial_will_end',
  'sub_test_0055'
);

do $$
begin
  begin
    insert into public.drip_email_sends (user_id, kind, claim_id, lawsuit_id)
    values (
      'a0000000-0000-4000-8000-000000000055',
      'did_you_file_24h',
      'c0000000-0000-4000-8000-000000000055',
      '10000000-0000-4000-8000-000000000055'
    );
    raise exception '0055: did_you_file_24h accepted a duplicate user+lawsuit';
  exception
    when unique_violation then
      null;
  end;
  begin
    insert into public.drip_email_sends (user_id, kind, stripe_subscription_id)
    values (
      'a0000000-0000-4000-8000-000000000055',
      'trial_will_end',
      'sub_test_0055'
    );
    raise exception '0055: trial_will_end accepted a duplicate subscription';
  exception
    when unique_violation then
      null;
  end;
  begin
    insert into public.drip_email_sends (user_id, kind)
    values (
      'a0000000-0000-4000-8000-000000000055',
      'welcome'
    );
    raise exception '0055: accepted an unknown drip kind';
  exception
    when check_violation then
      null;
  end;
  begin
    insert into public.drip_email_sends (user_id, kind, stripe_subscription_id)
    values (
      'a0000000-0000-4000-8000-000000000055',
      'did_you_file_24h',
      'sub_wrong'
    );
    raise exception '0055: did_you_file_24h accepted a stripe_subscription_id';
  exception
    when check_violation then
      null;
  end;
  begin
    insert into public.drip_email_sends (user_id, kind, claim_id, stripe_subscription_id)
    values (
      'a0000000-0000-4000-8000-000000000055',
      'trial_will_end',
      'c0000000-0000-4000-8000-000000000055',
      'sub_wrong_claim'
    );
    raise exception '0055: trial_will_end accepted a claim_id';
  exception
    when check_violation then
      null;
  end;
end $$;
