-- Column grants checked by 0025_profile_consent_grant.sql.
\set ON_ERROR_STOP 1

\echo '  1 0025 authenticated may update the profile columns settings and onboarding write'
do $$
declare
  col text;
begin
  foreach col in array array[
    'full_name', 'state', 'zip', 'phone', 'address_line1', 'address_line2', 'city',
    'attributes', 'email_opt_in', 'sms_opt_in', 'onboarded', 'prefill_consent_at',
    'match_metrics_consent_at'
  ] loop
    if not has_column_privilege('authenticated', 'public.profiles', col, 'UPDATE') then
      raise exception '0025: authenticated cannot update profiles.%', col;
    end if;
  end loop;
end $$;

\echo '  2 0025 server-owned profile columns stay locked'
do $$
declare
  col text;
begin
  foreach col in array array['is_internal', 'cohort', 'is_admin', 'referral_code', 'referred_by', 'email'] loop
    if has_column_privilege('authenticated', 'public.profiles', col, 'UPDATE')
       or has_column_privilege('anon', 'public.profiles', col, 'UPDATE') then
      raise exception '0025: profiles.% must not be updatable by clients', col;
    end if;
  end loop;
  if has_column_privilege('anon', 'public.profiles', 'match_metrics_consent_at', 'UPDATE') then
    raise exception '0025: anon must not update match_metrics_consent_at';
  end if;
end $$;
