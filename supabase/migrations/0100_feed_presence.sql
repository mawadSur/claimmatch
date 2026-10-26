-- ClaimMatch 0100: feed presence + consecutive-miss tracking for stale closes.
-- EXPAND ONLY.
--
-- Numbered 0100 so it cannot clash with the in-flight PR that is reconciling
-- p0/02-ci onto main and renumbering 0004–0008. Renumber this file at merge
-- to the next free slot after that reconciliation.
--
-- The nightly ingest (PR #11) closes a row only when the feed still lists it
-- and explicitly marks it closed. Rows that drop out of the feed stay open
-- forever. This file adds the columns the ingest uses to close those rows
-- after N consecutive *successful, non-empty* feeds, and to stamp the last
-- time a row was present:
--   - last_seen_at: set when the row appears in a successful feed
--   - missed_feed_count: incremented only on a successful non-empty feed
--     that does not mention the row; reset to 0 when it reappears
--
-- A failed or empty feed never increments missed_feed_count.
-- Existing rows start at missed_feed_count = 0 and last_seen_at = null, so
-- the first N successful feeds after this migration only start the clock.
--
-- Safe to re-run. Nothing is deleted and no status changes here.
-- Rollback:
--   drop index if exists public.lawsuits_open_source_idx;
--   alter table public.lawsuits drop column if exists missed_feed_count;
--   alter table public.lawsuits drop column if exists last_seen_at;

alter table public.lawsuits add column if not exists last_seen_at timestamptz;
alter table public.lawsuits add column if not exists missed_feed_count int not null default 0;

comment on column public.lawsuits.last_seen_at is
  'Last time this row appeared in a successful, non-empty source feed. Null until the first successful feed after 0100.';
comment on column public.lawsuits.missed_feed_count is
  'Consecutive successful non-empty feeds this feed-source row was missing from. Reset to 0 when the row reappears. Never incremented on a failed or empty feed.';

create index if not exists lawsuits_open_source_idx
  on public.lawsuits (source_id)
  where status in ('open', 'closing_soon');
