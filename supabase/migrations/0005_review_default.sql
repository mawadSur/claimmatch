-- ClaimMatch 0005: new settlements wait for human review instead of publishing.
--
-- 0002 set lawsuits.review_status to default 'published', so any writer that
-- left the column out (the old scrape path, seed scripts, hand inserts)
-- published a row the moment it was written. From now on a new row lands in
-- the review queue as 'pending_review' unless the writer says otherwise.
--
-- Safe on a production database that already has rows: this changes only the
-- column default. No existing row changes and nothing is unpublished.
-- Idempotent: running it again sets the same default.
-- Rollback: alter table public.lawsuits alter column review_status set default 'published';
--
-- Production: run any time before deploy (see docs/PRODUCTION-RUNBOOK.md).

alter table public.lawsuits
  alter column review_status set default 'pending_review';
