-- Task’in / Supabase
-- Migration 002 : staging des entrées Firebase
-- Cette migration crée uniquement une zone de préparation. Elle n’insère aucune donnée métier.

create table if not exists public.time_entries_staging (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null,
  source_record_id text not null,
  legacy_agent_key text not null default '',
  source text not null default 'ticket',
  description text not null default '',
  inbound_time text not null default '--:--',
  legacy_start_time text not null default '',
  normalized_start_time timestamptz,
  duration_seconds integer not null default 0,
  raw_payload jsonb not null default '{}'::jsonb,
  anomaly_code text not null default 'none',
  review_note text not null default '',
  created_at timestamptz not null default now(),
  unique (import_batch_id, source_record_id)
);

create index if not exists time_entries_staging_batch_idx
  on public.time_entries_staging(import_batch_id);
create index if not exists time_entries_staging_agent_idx
  on public.time_entries_staging(legacy_agent_key);
create index if not exists time_entries_staging_anomaly_idx
  on public.time_entries_staging(import_batch_id, anomaly_code);

alter table public.time_entries_staging enable row level security;

create policy staging_read_admin
  on public.time_entries_staging for select to authenticated
  using (public.is_taskin_admin());
create policy staging_write_admin
  on public.time_entries_staging for all to authenticated
  using (public.is_taskin_admin())
  with check (public.is_taskin_admin());

create or replace view public.time_entries_staging_summary as
select
  import_batch_id,
  count(*) as total_rows,
  count(*) filter (where anomaly_code = 'none') as valid_rows,
  count(*) filter (where anomaly_code <> 'none') as anomaly_rows,
  count(*) filter (where anomaly_code = 'missing_start_time') as missing_start_time_rows,
  count(*) filter (where anomaly_code = 'negative_duration') as negative_duration_rows,
  count(distinct legacy_agent_key) as distinct_legacy_agents
from public.time_entries_staging
group by import_batch_id;
