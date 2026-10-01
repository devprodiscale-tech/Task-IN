-- Task’in — 014 : journal partagé des appels manqués (remplace le Google Sheet « Journal des appels manqués »)
-- Chaque agent saisit ses appels manqués pendant son shift ; toute l’équipe voit le journal
-- pour ne pas rappeler deux fois le même client (prise en charge « Je rappelle »).
-- Lecture et mise à jour : toute l’équipe (comme le Sheet partagé). Suppression : auteur ou admin/superviseur.

create table if not exists public.missed_calls (
  id uuid primary key default gen_random_uuid(),
  call_date date not null,
  call_time time not null,
  agent_id uuid references public.profiles(id) on delete set null,
  cause text not null check (cause in (
    'Snooze non activé','Surcharge tickets','En communication','Problème technique','Réunion',
    'Pause déjeuner','Pause toilette','Pause','Cas complexe immédiat','Appel trop court',
    'Surcharge CRISP','N''a pas sonné de notre côté','Autre')),
  callback text not null default 'pending' check (callback in ('pending','5','10','10+','none')),
  callback_by uuid references public.profiles(id) on delete set null,
  callback_by_other text check (char_length(callback_by_other) <= 60),
  callback_time time,
  call_ref text check (char_length(call_ref) <= 60),
  notes text check (char_length(notes) <= 1000),
  claimed_by uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists missed_calls_date_idx on public.missed_calls (call_date desc, call_time desc);
create index if not exists missed_calls_ref_idx on public.missed_calls (call_ref) where call_ref is not null;

drop trigger if exists missed_calls_updated_at on public.missed_calls;
create trigger missed_calls_updated_at before update on public.missed_calls
  for each row execute function public.set_updated_at();

alter table public.missed_calls enable row level security;
drop policy if exists missed_calls_read on public.missed_calls;
drop policy if exists missed_calls_insert on public.missed_calls;
drop policy if exists missed_calls_update on public.missed_calls;
drop policy if exists missed_calls_delete on public.missed_calls;
create policy missed_calls_read on public.missed_calls for select to authenticated using (true);
create policy missed_calls_insert on public.missed_calls for insert to authenticated
  with check (created_by = auth.uid());
create policy missed_calls_update on public.missed_calls for update to authenticated
  using (public.current_taskin_role() in ('agent','supervisor','admin'))
  with check (public.current_taskin_role() in ('agent','supervisor','admin'));
create policy missed_calls_delete on public.missed_calls for delete to authenticated
  using (created_by = auth.uid() or public.is_taskin_ops_manager());
