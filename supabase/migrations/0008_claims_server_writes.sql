-- ClaimMatch 0008: claims are written only by server code (Phase 0, Part A).
--
-- RUN THIS ONLY AFTER THE PART A CODE IS DEPLOYED TO PRODUCTION.
-- The code live before Part A (the e-sign "Claim filed" flow and File-all)
-- writes claims through the signed-in user's own session. Once this runs, those
-- writes fail. Change the write path first, then revoke (WP:3145). Part A writes
-- claims only from route handlers with the service-role client (after checking
-- that the signed-in user owns the claim), through the functions in 0006.
--
-- Compatible with 0004_prefill.sql: that file tightened "own claims update"
-- with an explicit WITH CHECK. This file drops that policy after the deploy
-- has moved every claim write onto the server. Users keep reading their own
-- claims: the "own claims read" policy stays.
--
-- Safe to re-run. Rollback, if ever needed:
--   grant insert, update, delete on public.claims to authenticated;
--   recreate "own claims insert" from 0001:
--     create policy "own claims insert" on public.claims
--       for insert with check (auth.uid() = user_id);
--   recreate "own claims update" from 0004_prefill (WITH CHECK, not the
--   looser 0001 version) so a user still cannot reassign user_id:
--     create policy "own claims update" on public.claims
--       for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke insert, update, delete, truncate on public.claims from anon, authenticated;

drop policy if exists "own claims insert" on public.claims;
drop policy if exists "own claims update" on public.claims;
