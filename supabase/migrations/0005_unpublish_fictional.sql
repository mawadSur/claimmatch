-- ClaimMatch 0005: unpublish the 22 fictional settlements (Phase 0, D38).
--
-- RUN ONLY AFTER the read-only snapshot that the private plan (D38) requires
-- before this step. Unpublishing changes what users with claims or matches on
-- these settlements see (the settlements become unavailable). To make that
-- order explicit, the file stops with an error when it would change rows
-- unless the session confirms the snapshot first:
--   set claimmatch.d38_export_done = 'yes';
-- (On an empty database, such as CI, there is nothing to change and it runs.)
--
-- What it changes:
--   - the 16 rows from the old supabase/seed.sql, matched by slug (they have
--     no external_id), and
--   - the 6 rows from the sample-aggregator adapter, matched by slug, by their
--     external_id ('sample-aggregator:...') or by the sample-aggregator source:
--       review_status = 'rejected'  (RLS hides them from the public)
--       status        = 'closed'
--       is_featured   = false
--   - the sample-aggregator source is disabled, so no job writes to it again.
-- The app also hides these slugs in code (src/lib/fictional-slugs.ts).
--
-- Never deletes: deleting a lawsuit cascades into users' claims and matches.
-- Idempotent: rows already in that state are left alone.
-- Uses only columns from 0001 and 0002, so it can run without 0004.
-- Rollback: restore the three columns from the D38 snapshot. Never republish
-- these rows: none of these settlements exist.

begin;

create temporary table fictional_lawsuit_ids on commit drop as
select l.id
  from public.lawsuits l
 where l.slug in (
         -- 16 rows from the old supabase/seed.sql
         'healthcare-provider-data-breach-2025',
         'prepaid-card-hidden-fees-settlement',
         'smart-tv-viewing-data-settlement',
         'defective-brake-system-settlement',
         'contaminated-eye-drops-settlement',
         'gig-driver-expense-reimbursement-settlement',
         'protein-powder-protein-spiking-settlement',
         'wireless-router-security-flaw-settlement',
         'nonstick-cookware-coating-settlement',
         'robocall-tcpa-settlement',
         'university-student-records-breach-settlement',
         'mortgage-late-fee-settlement',
         'voice-assistant-recording-settlement',
         'sunscreen-benzene-recall-settlement',
         'retail-off-the-clock-wages-settlement',
         'sparkling-water-natural-flavor-settlement',
         -- 6 rows from the sample-aggregator adapter
         'heartburn-medication-impurity-settlement',
         'unpaid-overtime-missed-break-wage-settlement',
         'extra-virgin-olive-oil-mislabeling-settlement',
         'wireless-administrative-fee-settlement',
         'photo-app-face-geometry-privacy-settlement',
         'dishwasher-control-board-defect-settlement'
       )
    or l.external_id in (
         'sample-aggregator:heartburn-rx-recall-2025',
         'sample-aggregator:hourly-overtime-ca-2025',
         'sample-aggregator:olive-oil-mislabel-2025',
         'sample-aggregator:telecom-admin-fee-2025',
         'sample-aggregator:photo-face-scan-privacy-2025',
         'sample-aggregator:dishwasher-defect-2025'
       )
    or l.source_id in (select s.id from public.sources s where s.slug = 'sample-aggregator');

do $$
begin
  if exists (
       select 1
         from public.lawsuits l
         join fictional_lawsuit_ids f on f.id = l.id
        where l.review_status <> 'rejected' or l.status <> 'closed' or l.is_featured
     )
     and coalesce(current_setting('claimmatch.d38_export_done', true), '') <> 'yes'
  then
    raise exception using
      message = '0005 unpublishes fictional settlements that users may have claims on.',
      hint = 'Take the read-only snapshot the private plan (D38) requires first, then run '
          || 'set claimmatch.d38_export_done = ''yes''; in the same session and apply this file again.';
  end if;
end $$;

update public.lawsuits l
   set review_status = 'rejected',
       status        = 'closed',
       is_featured   = false
  from fictional_lawsuit_ids f
 where l.id = f.id
   and (l.review_status <> 'rejected' or l.status <> 'closed' or l.is_featured);

update public.sources
   set enabled = false
 where slug = 'sample-aggregator'
   and enabled;

commit;
