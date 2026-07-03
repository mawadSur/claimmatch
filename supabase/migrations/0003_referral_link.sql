-- ClaimMatch — wire the referral loop end to end.
-- When a new user signs up with a ?ref code (captured into auth metadata as
-- `ref`), link them to the referrer and advance the pending referral record.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ref_code text := nullif(new.raw_user_meta_data->>'ref', '');
  referrer  uuid;
begin
  if ref_code is not null then
    select id into referrer from public.profiles where referral_code = ref_code limit 1;
  end if;

  insert into public.profiles (id, email, full_name, referral_code, referred_by)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    public.gen_referral_code(),
    referrer
  )
  on conflict (id) do nothing;

  -- Advance a matching pending referral (by email or an open code invite).
  if referrer is not null then
    update public.referrals
      set status = 'signed_up', referred_user = new.id
      where referrer_id = referrer
        and status = 'pending'
        and (referred_email = new.email or referred_email is null);
  end if;

  return new;
end $$;
