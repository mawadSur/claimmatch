-- ClaimMatch 0017: match events, feature snapshots, and labeled outcomes.
-- EXPAND ONLY. Do not edit 0016 or earlier.
--
-- Structured logs for a later match model. Optional health answers
-- (took_medication) must never be stored in features. Public UI and writes
-- stay off until MATCH_METRICS_ENABLED=1.
--
-- Safe to re-run. Nothing is deleted.
-- Rollback:
--   drop view if exists public.match_labeled_outcomes;
--   drop table if exists public.match_labels;
--   drop table if exists public.match_feature_snapshots;
--   drop table if exists public.match_events;
--   alter table public.profiles drop column if exists match_metrics_consent_at;

alter table public.profiles
  add column if not exists match_metrics_consent_at timestamptz;

comment on column public.profiles.match_metrics_consent_at is
  'When the user agreed to privacy-safe match-quality logging. Null means no consent recorded.';

create table if not exists public.match_events (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  lawsuit_id       uuid not null references public.lawsuits (id) on delete cascade,
  match_id         uuid references public.matches (id) on delete set null,
  event_type       text not null,
  score            numeric,
  rank             integer,
  matched_signals  jsonb not null default '[]'::jsonb,
  model_version    text not null default 'rule-v1',
  payout_amount    numeric,
  created_at       timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'match_events_type_check'
       and conrelid = 'public.match_events'::regclass
  ) then
    alter table public.match_events
      add constraint match_events_type_check
      check (event_type in (
        'impression', 'view', 'save', 'dismiss', 'open_form', 'filed', 'user_reported_payout'
      ));
  end if;
end $$;

comment on table public.match_events is
  'Structured match interactions: impression, view, save, dismiss, open_form, filed, user_reported_payout.';
comment on column public.match_events.matched_signals is
  'Non-health matcher reasons / attribute keys that fired. Never includes took_medication.';

create index if not exists match_events_user_idx on public.match_events (user_id, created_at desc);
create index if not exists match_events_lawsuit_idx on public.match_events (lawsuit_id, event_type);

create table if not exists public.match_feature_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  lawsuit_id          uuid not null references public.lawsuits (id) on delete cascade,
  match_event_id      uuid references public.match_events (id) on delete set null,
  attribute_overlap   jsonb not null default '[]'::jsonb,
  state               text,
  category            text,
  deadline_days       integer,
  proof_required      text,
  payout_size         numeric,
  model_version       text not null default 'rule-v1',
  created_at          timestamptz not null default now()
);

comment on table public.match_feature_snapshots is
  'Per-match feature snapshot for later training. Health answers are excluded from attribute_overlap.';

create index if not exists match_feature_snapshots_user_idx
  on public.match_feature_snapshots (user_id, lawsuit_id);

create table if not exists public.match_labels (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  lawsuit_id     uuid not null references public.lawsuits (id) on delete cascade,
  label          text not null,
  payout_amount  numeric,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, lawsuit_id)
);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'match_labels_label_check'
       and conrelid = 'public.match_labels'::regclass
  ) then
    alter table public.match_labels
      add constraint match_labels_label_check
      check (label in ('not_relevant', 'filed', 'paid'));
  end if;
end $$;

comment on table public.match_labels is
  'User-reported match outcomes: not_relevant, filed, or paid. Feeds the labeled-outcomes view.';

drop trigger if exists match_labels_touch on public.match_labels;
create trigger match_labels_touch before update on public.match_labels
  for each row execute function public.touch_updated_at();

create or replace view public.match_labeled_outcomes
  with (security_invoker = true)
as
select
  l.id,
  l.user_id,
  l.lawsuit_id,
  l.label,
  l.payout_amount,
  e.score,
  e.rank,
  e.matched_signals,
  e.model_version,
  f.attribute_overlap,
  f.state,
  f.category,
  f.deadline_days,
  f.proof_required,
  f.payout_size,
  l.created_at,
  l.updated_at as labeled_at
from public.match_labels l
left join lateral (
  select score, rank, matched_signals, model_version
    from public.match_events ev
   where ev.user_id = l.user_id
     and ev.lawsuit_id = l.lawsuit_id
   order by ev.created_at desc
   limit 1
) e on true
left join lateral (
  select attribute_overlap, state, category, deadline_days, proof_required, payout_size
    from public.match_feature_snapshots fs
   where fs.user_id = l.user_id
     and fs.lawsuit_id = l.lawsuit_id
   order by fs.created_at desc
   limit 1
) f on true;

comment on view public.match_labeled_outcomes is
  'Latest features and event score joined to each user-reported match label.';

alter table public.match_events enable row level security;
alter table public.match_feature_snapshots enable row level security;
alter table public.match_labels enable row level security;

drop policy if exists "own match_events read" on public.match_events;
create policy "own match_events read" on public.match_events
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "own match_events insert" on public.match_events;
create policy "own match_events insert" on public.match_events
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "own match_feature_snapshots read" on public.match_feature_snapshots;
create policy "own match_feature_snapshots read" on public.match_feature_snapshots
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "own match_labels read" on public.match_labels;
create policy "own match_labels read" on public.match_labels
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "own match_labels insert" on public.match_labels;
create policy "own match_labels insert" on public.match_labels
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "own match_labels update" on public.match_labels;
create policy "own match_labels update" on public.match_labels
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on table public.match_events from public, anon;
grant select, insert on table public.match_events to authenticated;
revoke update, delete, truncate on table public.match_events from authenticated;

revoke all on table public.match_feature_snapshots from public, anon;
grant select on table public.match_feature_snapshots to authenticated;
revoke insert, update, delete, truncate on table public.match_feature_snapshots from authenticated;

revoke all on table public.match_labels from public, anon;
grant select, insert, update on table public.match_labels to authenticated;
revoke delete, truncate on table public.match_labels from authenticated;

grant select on public.match_labeled_outcomes to authenticated;
revoke insert, update, delete on public.match_labeled_outcomes from authenticated, anon, public;
