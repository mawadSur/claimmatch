-- ClaimMatch 0025: let signed-in users set their own match-metrics consent.
-- EXPAND ONLY. Do not edit 0024 or earlier.
--
-- 0017 added profiles.match_metrics_consent_at but no column grant, so every
-- POST /api/settings (which always sends the consent choice) failed with 42501.
-- Row access is still limited to the user's own profile by the existing RLS
-- policy. is_internal, cohort and is_admin stay server-only (no grant).
--
-- Safe to re-run. Nothing is deleted.
-- Rollback:
--   revoke update (match_metrics_consent_at) on public.profiles from authenticated;

grant update (match_metrics_consent_at) on public.profiles to authenticated;
