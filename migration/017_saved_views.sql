-- Task’in — 017 : vues enregistrées (Pilotage 360°, exports)
-- Une vue = un nom + une configuration (période, pôle, KPI, tri…). Chaque encadrant gère les siennes ;
-- une vue « partagée » est visible par tous les encadrants (admin, superviseur, formateur).

create table if not exists public.taskin_saved_views (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  scope text not null default 'pilotage' check (scope in ('pilotage', 'export')),
  name text not null check (char_length(name) between 1 and 60),
  config jsonb not null default '{}'::jsonb,
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists taskin_saved_views_owner_idx on public.taskin_saved_views (owner_id, scope);

alter table public.taskin_saved_views enable row level security;

drop policy if exists saved_views_select on public.taskin_saved_views;
create policy saved_views_select on public.taskin_saved_views for select to authenticated
  using (public.is_taskin_manager() and (owner_id = auth.uid() or shared));

drop policy if exists saved_views_insert on public.taskin_saved_views;
create policy saved_views_insert on public.taskin_saved_views for insert to authenticated
  with check (public.is_taskin_manager() and owner_id = auth.uid());

drop policy if exists saved_views_update on public.taskin_saved_views;
create policy saved_views_update on public.taskin_saved_views for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists saved_views_delete on public.taskin_saved_views;
create policy saved_views_delete on public.taskin_saved_views for delete to authenticated
  using (owner_id = auth.uid() or public.is_taskin_ops_manager());

grant select, insert, update, delete on public.taskin_saved_views to authenticated;
