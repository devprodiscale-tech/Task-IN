-- Task'in / Supabase
-- Migration 008 : pôle des agents (Front Office, Back Office, Reconfirmation)
-- + verrou : seul un administrateur peut attribuer ou modifier un rôle ou un pôle.

alter table public.profiles
  add column if not exists pole text
  check (pole is null or pole in ('fo', 'bo', 'reconf'));

comment on column public.profiles.pole is
  'Pôle métier d''un agent : fo (Front Office), bo (Back Office), reconf (Reconfirmation). Null si non défini ou pour les autres rôles.';

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_taskin_admin() then
    if tg_op = 'INSERT' and (new.role <> 'agent' or new.pole is not null) then
      raise exception 'Seul un administrateur peut attribuer ce rôle ou ce pôle.' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and (new.role is distinct from old.role or new.pole is distinct from old.pole) then
      raise exception 'Seul un administrateur peut modifier un rôle ou un pôle.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
  before insert or update on public.profiles
  for each row execute function public.protect_profile_role();
