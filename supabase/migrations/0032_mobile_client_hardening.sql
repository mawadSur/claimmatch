-- ClaimMatch 0032: close direct-write holes before the native app ships.
-- EXPAND ONLY. Do not edit 0031 or earlier.
--
-- profiles: the "own profile upsert" policy (0001_init.sql) let a signed-in
-- user with no profile row insert one with is_admin = true (SEC-9). Every
-- profile is created by the handle_new_user signup trigger, which is SECURITY
-- DEFINER (0011_attribution.sql), so signup does not need this grant.
-- subscribers: the "anyone subscribe" policy (0001_init.sql) let anyone with
-- the anon key add rows, and /api/subscribe is retired (410). No app code
-- inserts or upserts profiles or subscribers; the service role is unaffected.
-- That still holds with 0027-0031: onboarding, settings (email_frequency) and
-- attribution only UPDATE the user's profile row, and profile facts and
-- consent are written to their own tables.
-- is_admin() keeps its EXECUTE grant: RLS policies call it as the invoking role.
--
-- Probed in supabase/tests/10_rls_basics.sql, section 6.
-- Safe to re-run. Nothing is deleted.
-- Rollback (restores the 0001 behavior):
--   grant insert on public.profiles to authenticated;
--   grant insert on public.subscribers to anon, authenticated;
--   create policy "own profile upsert" on public.profiles
--     for insert with check (auth.uid() = id);
--   create policy "anyone subscribe" on public.subscribers
--     for insert with check (true);

revoke insert on public.profiles from anon, authenticated;            -- SEC-9
drop policy if exists "own profile upsert" on public.profiles;         -- created in 0001_init.sql
drop policy if exists "anyone subscribe" on public.subscribers;        -- created in 0001_init.sql; /api/subscribe is retired (410)
revoke insert on public.subscribers from anon, authenticated;
