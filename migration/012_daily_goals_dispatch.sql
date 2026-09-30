-- Task’in — 012 : objectifs du jour (ajustés par l’admin / le superviseur) et dispatch déclaré par l’agent
-- La cliente ne fixe pas d’objectif : l’objectif du jour J se calcule depuis le dernier résultat OSC
-- de l’agent (J-1) + une progression réglable. Cette table ne garde que les corrections manuelles
-- et le message « sur quoi travailler aujourd’hui ». Lecture : équipe. Écriture : admin et superviseur.

create table if not exists public.agent_daily_goals (
  agent_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  goals jsonb not null default '{}'::jsonb check (jsonb_typeof(goals) = 'object'),
  focus text check (char_length(focus) <= 500),
  set_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (agent_id, day)
);

drop trigger if exists agent_daily_goals_updated_at on public.agent_daily_goals;
create trigger agent_daily_goals_updated_at before update on public.agent_daily_goals
  for each row execute function public.set_updated_at();

alter table public.agent_daily_goals enable row level security;
drop policy if exists daily_goals_read on public.agent_daily_goals;
drop policy if exists daily_goals_write on public.agent_daily_goals;
create policy daily_goals_read on public.agent_daily_goals for select to authenticated using (true);
create policy daily_goals_write on public.agent_daily_goals for all to authenticated
  using (public.is_taskin_ops_manager()) with check (public.is_taskin_ops_manager());

-- Dispatch client : l’agent déclare lui-même, pendant son shift, les canaux sur lesquels il est
-- dispatché (liste vide = aucun dispatch). Chaque changement = une ligne horodatée.
create table if not exists public.agent_dispatch_log (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.profiles(id) on delete cascade,
  channels text[] not null default '{}' check (cardinality(channels) <= 10),
  note text check (char_length(note) <= 300),
  started_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null default auth.uid()
);
create index if not exists agent_dispatch_log_agent_idx on public.agent_dispatch_log (agent_id, started_at desc);
create index if not exists agent_dispatch_log_started_idx on public.agent_dispatch_log (started_at desc);

alter table public.agent_dispatch_log enable row level security;
drop policy if exists dispatch_read on public.agent_dispatch_log;
drop policy if exists dispatch_insert on public.agent_dispatch_log;
drop policy if exists dispatch_delete on public.agent_dispatch_log;
create policy dispatch_read on public.agent_dispatch_log for select to authenticated using (true);
create policy dispatch_insert on public.agent_dispatch_log for insert to authenticated
  with check (agent_id = auth.uid() or public.is_taskin_ops_manager());
create policy dispatch_delete on public.agent_dispatch_log for delete to authenticated
  using (public.is_taskin_ops_manager());
