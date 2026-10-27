-- ClaimMatch 0012: revoke persist_first_attribution from anon.
-- EXPAND ONLY. Safe to re-run.
--
-- Supabase grants EXECUTE on new functions to PUBLIC and to the `anon` role
-- (see default privileges). 0011's `revoke ... from public` does not remove
-- the separate `anon` grant, so PostgREST still lets an anonymous caller hit
-- the function (it raises "not signed in" today). This migration revokes
-- execute from public and anon, then re-grants it to authenticated (and
-- service_role, so the schema health check can probe the function).
--
-- Rollback (NOT recommended):
--   grant execute on function public.persist_first_attribution(text, text, text, text, text) to anon;
--   Re-granting to anon is NOT recommended. Keep execute revoked; the
--   intended end state is authenticated (and service_role) only.

revoke execute on function public.persist_first_attribution(text, text, text, text, text) from public;
revoke execute on function public.persist_first_attribution(text, text, text, text, text) from anon;
grant execute on function public.persist_first_attribution(text, text, text, text, text) to authenticated;
grant execute on function public.persist_first_attribution(text, text, text, text, text) to service_role;
