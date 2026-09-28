-- Task'in / Supabase
-- Migration 006 : journal des connexions/déconnexions agents (tous rôles).

create table if not exists public.agent_sessions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.profiles(id) on delete cascade,
  event text not null check (event in ('login', 'logout')),
  created_at timestamptz not null default now()
);

create index if not exists agent_sessions_agent_idx on public.agent_sessions(agent_id, created_at desc);
create index if not exists agent_sessions_created_idx on public.agent_sessions(created_at desc);

alter table public.agent_sessions enable row level security;

create policy agent_sessions_read_own_or_manager on public.agent_sessions
  for select to authenticated
  using (agent_id = auth.uid() or public.is_taskin_manager());

create policy agent_sessions_insert_own on public.agent_sessions
  for insert to authenticated
  with check (agent_id = auth.uid());

comment on table public.agent_sessions is
  'Journal des connexions/déconnexions de tous les rôles Task''in, visible par Superviseur/Admin/Formateur.';
