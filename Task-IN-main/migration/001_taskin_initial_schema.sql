-- Task’in / Supabase
-- Migration 001 : schéma cible hors production
-- Cette migration ne doit être exécutée qu’après création d’un projet Supabase de test.

create extension if not exists pgcrypto;

create type public.taskin_role as enum ('admin', 'supervisor', 'formateur', 'agent');
create type public.training_status as enum ('draft', 'published', 'archived');
create type public.archive_status as enum ('started', 'verified', 'failed', 'restored');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Sans nom',
  email text not null default '',
  color text not null default '#2B4C7E',
  initials text not null default '??',
  role public.taskin_role not null default 'agent',
  photo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.time_entries (
  id text primary key,
  raw_id text not null default '',
  source text not null default 'ticket',
  description text not null default '',
  treatment text not null default '',
  agent_id uuid not null references public.profiles(id) on delete restrict,
  inbound_time text not null default '--:--',
  started_at timestamptz not null,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.active_timers (
  agent_id uuid primary key references public.profiles(id) on delete cascade,
  source text not null default 'ticket',
  description text not null default '',
  started_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.procedures (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  category text not null default '',
  description text not null default '',
  version text not null default '1.0',
  status text not null default 'draft',
  validation_status text not null default 'draft',
  owner_id uuid references public.profiles(id) on delete set null,
  training_owner_id uuid references public.profiles(id) on delete set null,
  sections jsonb not null default '[]'::jsonb,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.complex_cases (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.profiles(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  status text not null default 'open',
  priority text not null default 'normal',
  title text not null default '',
  description text not null default '',
  escalation_level text not null default '',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'team',
  owner_id uuid references public.profiles(id) on delete set null,
  period_start date,
  period_end date,
  target jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.training_modules (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  description text not null default '',
  category text not null default '',
  duration_min integer not null default 0 check (duration_min >= 0),
  status public.training_status not null default 'draft',
  objectives jsonb not null default '[]'::jsonb,
  modules jsonb not null default '[]'::jsonb,
  source_procedure_id uuid references public.procedures(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.training_quizzes (
  id uuid primary key default gen_random_uuid(),
  module_id uuid references public.training_modules(id) on delete cascade,
  title text not null default '',
  description text not null default '',
  passing_score integer not null default 70 check (passing_score between 0 and 100),
  status public.training_status not null default 'draft',
  questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.training_progress (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.profiles(id) on delete cascade,
  module_id uuid not null references public.training_modules(id) on delete cascade,
  status text not null default 'not_started',
  progress_pct numeric(5,2) not null default 0 check (progress_pct between 0 and 100),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (agent_id, module_id)
);

create table public.training_skills (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  description text not null default '',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.training_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  summary text not null default '',
  type text not null default 'processus',
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.training_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.profiles(id) on delete cascade,
  module_id uuid references public.training_modules(id) on delete cascade,
  update_id uuid references public.training_updates(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);

create table public.coaching_reviews (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.profiles(id) on delete set null,
  reviewer_id uuid references public.profiles(id) on delete set null,
  channel text not null default '',
  review_date timestamptz,
  contact_date timestamptz,
  communication_number text not null default '',
  scores jsonb not null default '{}'::jsonb,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coaching_sheets (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.profiles(id) on delete set null,
  supervisor_id uuid references public.profiles(id) on delete set null,
  sheet_date timestamptz,
  objectives jsonb not null default '[]'::jsonb,
  notes text not null default '',
  next_review_date timestamptz,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.archive_runs (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  status public.archive_status not null default 'started',
  manifest jsonb not null default '{}'::jsonb,
  checksum text,
  storage_path text,
  external_backup_url text,
  error_message text,
  started_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index time_entries_agent_started_idx on public.time_entries(agent_id, started_at desc);
create index time_entries_started_idx on public.time_entries(started_at desc);
create index active_timers_updated_idx on public.active_timers(updated_at desc);
create index procedures_owner_idx on public.procedures(owner_id);
create index complex_cases_status_idx on public.complex_cases(status, updated_at desc);
create index training_progress_agent_idx on public.training_progress(agent_id, updated_at desc);
create index archive_runs_period_idx on public.archive_runs(period_end desc);

create or replace function public.set_updated_at() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles','active_timers','settings','procedures','complex_cases','goals','training_modules','training_quizzes','training_progress','training_skills','training_updates','coaching_reviews','coaching_sheets'] loop
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

create or replace function public.current_taskin_role()
returns public.taskin_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.is_taskin_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;

create or replace function public.is_taskin_manager()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','supervisor','formateur')) $$;

alter table public.profiles enable row level security;
alter table public.time_entries enable row level security;
alter table public.active_timers enable row level security;
alter table public.settings enable row level security;
alter table public.procedures enable row level security;
alter table public.complex_cases enable row level security;
alter table public.goals enable row level security;
alter table public.training_modules enable row level security;
alter table public.training_quizzes enable row level security;
alter table public.training_progress enable row level security;
alter table public.training_skills enable row level security;
alter table public.training_updates enable row level security;
alter table public.training_acknowledgements enable row level security;
alter table public.coaching_reviews enable row level security;
alter table public.coaching_sheets enable row level security;
alter table public.archive_runs enable row level security;

create policy profiles_read_authenticated on public.profiles for select to authenticated using (true);
create policy profiles_update_self_or_admin on public.profiles for update to authenticated using (id = auth.uid() or public.is_taskin_admin()) with check (id = auth.uid() or public.is_taskin_admin());
create policy profiles_insert_admin on public.profiles for insert to authenticated with check (public.is_taskin_admin() or id = auth.uid());
create policy profiles_delete_admin on public.profiles for delete to authenticated using (public.is_taskin_admin() and id <> auth.uid());

create policy entries_read_own_or_manager on public.time_entries for select to authenticated using (agent_id = auth.uid() or public.is_taskin_manager());
create policy entries_insert_own on public.time_entries for insert to authenticated with check (agent_id = auth.uid() or public.is_taskin_manager());
create policy entries_update_own_or_manager on public.time_entries for update to authenticated using (agent_id = auth.uid() or public.is_taskin_manager()) with check (agent_id = auth.uid() or public.is_taskin_manager());
create policy entries_delete_own_or_admin on public.time_entries for delete to authenticated using (agent_id = auth.uid() or public.is_taskin_admin());

create policy timers_read_own_or_manager on public.active_timers for select to authenticated using (agent_id = auth.uid() or public.is_taskin_manager());
create policy timers_write_own_or_admin on public.active_timers for all to authenticated using (agent_id = auth.uid() or public.is_taskin_admin()) with check (agent_id = auth.uid() or public.is_taskin_admin());

create policy settings_read_authenticated on public.settings for select to authenticated using (true);
create policy settings_write_admin on public.settings for all to authenticated using (public.is_taskin_admin()) with check (public.is_taskin_admin());

create policy procedures_read_authenticated on public.procedures for select to authenticated using (true);
create policy procedures_write_manager on public.procedures for all to authenticated using (public.is_taskin_manager()) with check (public.is_taskin_manager());
create policy cases_read_authenticated on public.complex_cases for select to authenticated using (true);
create policy cases_write_manager on public.complex_cases for all to authenticated using (public.is_taskin_manager()) with check (public.is_taskin_manager());
create policy goals_read_authenticated on public.goals for select to authenticated using (true);
create policy goals_write_manager on public.goals for all to authenticated using (public.is_taskin_manager()) with check (public.is_taskin_manager());

create policy training_modules_read_authenticated on public.training_modules for select to authenticated using (true);
create policy training_modules_write_manager on public.training_modules for all to authenticated using (public.is_taskin_manager()) with check (public.is_taskin_manager());
create policy training_quizzes_read_authenticated on public.training_quizzes for select to authenticated using (true);
create policy training_quizzes_write_manager on public.training_quizzes for all to authenticated using (public.is_taskin_manager()) with check (public.is_taskin_manager());
create policy training_progress_read_own_or_manager on public.training_progress for select to authenticated using (agent_id = auth.uid() or public.is_taskin_manager());
create policy training_progress_write_own_or_manager on public.training_progress for all to authenticated using (agent_id = auth.uid() or public.is_taskin_manager()) with check (agent_id = auth.uid() or public.is_taskin_manager());
create policy training_skills_read_authenticated on public.training_skills for select to authenticated using (true);
create policy training_skills_write_manager on public.training_skills for all to authenticated using (public.is_taskin_manager()) with check (public.is_taskin_manager());
create policy training_updates_read_authenticated on public.training_updates for select to authenticated using (true);
create policy training_updates_write_manager on public.training_updates for all to authenticated using (public.is_taskin_manager()) with check (public.is_taskin_manager());
create policy acknowledgements_read_own_or_manager on public.training_acknowledgements for select to authenticated using (agent_id = auth.uid() or public.is_taskin_manager());
create policy acknowledgements_write_own_or_manager on public.training_acknowledgements for all to authenticated using (agent_id = auth.uid() or public.is_taskin_manager()) with check (agent_id = auth.uid() or public.is_taskin_manager());

create policy reviews_read_manager on public.coaching_reviews for select to authenticated using (public.is_taskin_manager());
create policy reviews_write_manager on public.coaching_reviews for all to authenticated using (public.is_taskin_manager()) with check (public.is_taskin_manager());
create policy sheets_read_manager_or_agent on public.coaching_sheets for select to authenticated using (agent_id = auth.uid() or public.is_taskin_manager());
create policy sheets_write_manager on public.coaching_sheets for all to authenticated using (public.is_taskin_manager()) with check (public.is_taskin_manager());
create policy archives_read_admin on public.archive_runs for select to authenticated using (public.is_taskin_admin());
create policy archives_write_admin on public.archive_runs for all to authenticated using (public.is_taskin_admin()) with check (public.is_taskin_admin());

-- Création automatique du profil après inscription Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, initials)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1)), coalesce(new.email, ''), upper(left(coalesce(new.raw_user_meta_data->>'name', '??'), 2)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
