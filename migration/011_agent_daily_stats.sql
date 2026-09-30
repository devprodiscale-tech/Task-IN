-- Task’in — 011 : résultats quotidiens OSC par agent (saisie manuelle ou import CSV)
-- Les agents n’ont aucun accès OSC admin : l’admin ou le superviseur recopie chaque jour
-- les chiffres « Activité agents » d’OSC / Ringover / Crisp, preuve (capture) à l’appui.
-- Lecture : toute l’équipe (tableau de résultats partagé). Écriture : admin et superviseur.

create or replace function public.is_taskin_ops_manager()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','supervisor')) $$;

create table if not exists public.agent_daily_stats (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  worked_minutes integer check (worked_minutes between 0 and 1440),
  calls_in integer check (calls_in between 0 and 5000),
  calls_out integer check (calls_out between 0 and 5000),
  call_minutes integer check (call_minutes between 0 and 1440),
  tasks_open integer check (tasks_open between 0 and 5000),
  tickets_assigned integer check (tickets_assigned between 0 and 5000),
  actions integer check (actions between 0 and 10000),
  created integer check (created between 0 and 10000),
  resolved integer check (resolved between 0 and 10000),
  crisp_conversations integer check (crisp_conversations between 0 and 10000),
  crisp_messages integer check (crisp_messages between 0 and 100000),
  note text check (char_length(note) <= 2000),
  screenshots jsonb not null default '[]'::jsonb check (jsonb_typeof(screenshots) = 'array' and jsonb_array_length(screenshots) <= 10),
  source text not null default 'manual' check (source in ('manual','csv','mixed')),
  entered_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, day)
);

create index if not exists agent_daily_stats_day_idx on public.agent_daily_stats (day desc);

drop trigger if exists agent_daily_stats_updated_at on public.agent_daily_stats;
create trigger agent_daily_stats_updated_at before update on public.agent_daily_stats
  for each row execute function public.set_updated_at();

alter table public.agent_daily_stats enable row level security;
drop policy if exists daily_stats_read on public.agent_daily_stats;
drop policy if exists daily_stats_write on public.agent_daily_stats;
create policy daily_stats_read on public.agent_daily_stats for select to authenticated using (true);
create policy daily_stats_write on public.agent_daily_stats for all to authenticated
  using (public.is_taskin_ops_manager()) with check (public.is_taskin_ops_manager());

-- Captures : espace privé, images uniquement, 5 Mo max. Réservé à l’admin et au superviseur.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('daily-stats', 'daily-stats', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists daily_stats_files_read on storage.objects;
drop policy if exists daily_stats_files_insert on storage.objects;
drop policy if exists daily_stats_files_delete on storage.objects;
create policy daily_stats_files_read on storage.objects for select to authenticated
  using (bucket_id = 'daily-stats' and public.is_taskin_ops_manager());
create policy daily_stats_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'daily-stats' and public.is_taskin_ops_manager());
create policy daily_stats_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'daily-stats' and public.is_taskin_ops_manager());
