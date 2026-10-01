-- Task’in — 019 : l’agent déclare ses chiffres OSC en fin de shift
-- Règles : capture obligatoire avec l’heure visible et le filtre OSC « Aujourd’hui » (cases à cocher
-- obligatoires), heure du relevé indiquée par l’agent, heure d’envoi enregistrée par le serveur.
-- La déclaration ne remplace pas les chiffres officiels (agent_daily_stats) : l’admin ou le superviseur
-- la reprend (validée) ou la renvoie à l’agent avec un commentaire (refusée → l’agent corrige).

create table if not exists public.agent_stat_submissions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  day date not null,
  stat_values jsonb not null default '{}'::jsonb,
  stats_time time not null,
  osc_filter_today boolean not null check (osc_filter_today),
  clock_visible boolean not null check (clock_visible),
  screenshots jsonb not null default '[]'::jsonb check (jsonb_typeof(screenshots) = 'array' and jsonb_array_length(screenshots) between 1 and 5),
  note text check (char_length(note) <= 1000),
  submitted_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'validated', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (char_length(review_note) <= 1000),
  updated_at timestamptz not null default now(),
  unique (agent_id, day)
);
create index if not exists agent_stat_submissions_day_idx on public.agent_stat_submissions (day desc, status);

-- L’heure d’envoi est toujours celle du serveur (l’agent ne peut pas l’antidater).
create or replace function public.taskin_submission_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  if not public.is_taskin_ops_manager() then
    new.submitted_at := now();
    new.status := 'pending';
    new.reviewed_by := null; new.reviewed_at := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists agent_stat_submissions_stamp on public.agent_stat_submissions;
create trigger agent_stat_submissions_stamp before insert or update on public.agent_stat_submissions
  for each row execute function public.taskin_submission_stamp();

alter table public.agent_stat_submissions enable row level security;
drop policy if exists submissions_read on public.agent_stat_submissions;
create policy submissions_read on public.agent_stat_submissions for select to authenticated
  using (agent_id = auth.uid() or public.is_taskin_manager());
-- Agent : uniquement ses lignes, uniquement le jour même (± 1 jour pour les fuseaux), tant que non validée.
drop policy if exists submissions_insert_own on public.agent_stat_submissions;
create policy submissions_insert_own on public.agent_stat_submissions for insert to authenticated
  with check (agent_id = auth.uid() and public.current_taskin_role() = 'agent' and day between current_date - 1 and current_date + 1);
drop policy if exists submissions_update_own on public.agent_stat_submissions;
create policy submissions_update_own on public.agent_stat_submissions for update to authenticated
  using (agent_id = auth.uid() and status in ('pending', 'rejected'))
  with check (agent_id = auth.uid() and day between current_date - 1 and current_date + 1);
drop policy if exists submissions_manage on public.agent_stat_submissions;
create policy submissions_manage on public.agent_stat_submissions for all to authenticated
  using (public.is_taskin_ops_manager()) with check (public.is_taskin_ops_manager());
grant select, insert, update on public.agent_stat_submissions to authenticated;
grant delete on public.agent_stat_submissions to authenticated;

-- Trace dans les chiffres officiels : heure d’envoi et heure du relevé de la déclaration reprise.
alter table public.agent_daily_stats add column if not exists agent_submitted_at timestamptz;
alter table public.agent_daily_stats add column if not exists agent_stats_time time;

-- Captures de l’agent : dans son propre dossier du bucket privé « daily-stats » (<agent_id>/...).
drop policy if exists daily_stats_files_agent_read on storage.objects;
drop policy if exists daily_stats_files_agent_insert on storage.objects;
drop policy if exists daily_stats_files_agent_delete on storage.objects;
create policy daily_stats_files_agent_read on storage.objects for select to authenticated
  using (bucket_id = 'daily-stats' and (storage.foldername(name))[1] = auth.uid()::text);
create policy daily_stats_files_agent_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'daily-stats' and (storage.foldername(name))[1] = auth.uid()::text and public.current_taskin_role() = 'agent');
create policy daily_stats_files_agent_delete on storage.objects for delete to authenticated
  using (bucket_id = 'daily-stats' and (storage.foldername(name))[1] = auth.uid()::text and public.current_taskin_role() = 'agent');
