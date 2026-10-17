-- ClaimMatch: claims are written only by server code (Phase 0, Part A).
--
-- RUN THIS ONLY AFTER THE PART A CODE IS DEPLOYED TO PRODUCTION.
-- The code live before Part A (the e-sign "Claim filed" flow and File-all)
-- writes claims through the signed-in user's own session. Once this runs, those
-- writes fail. Change the write path first, then revoke (WP:3145). Part A writes
-- claims only from route handlers with the service-role client (after checking
-- that the signed-in user owns the claim), through the functions in 0006.
--
-- Safe to re-run. Rollback, if ever needed:
--   grant insert, update, delete on public.claims to authenticated;
--   and recreate the "own claims insert" / "own claims update" policies from 0001.
--
-- Users keep reading their own claims: the "own claims read" policy stays.

revoke insert, update, delete, truncate on public.claims from anon, authenticated;

drop policy if exists "own claims insert" on public.claims;
drop policy if exists "own claims update" on public.claims;
