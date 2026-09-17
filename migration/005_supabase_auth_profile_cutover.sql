-- Task’in / Supabase
-- Migration 005 : garantie du lien auth.users -> profiles
-- Idempotente et sans suppression de données historiques.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  metadata_name text;
  profile_name text;
begin
  metadata_name := nullif(trim(new.raw_user_meta_data->>'name'), '');
  profile_name := coalesce(metadata_name, nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Sans nom');

  insert into public.profiles (id, name, email, initials)
  values (
    new.id,
    profile_name,
    coalesce(new.email, ''),
    coalesce(
      nullif(upper(left(trim(new.raw_user_meta_data->>'initials'), 2)), ''),
      upper(left(profile_name, 2))
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'on_auth_user_created'
      and tgrelid = 'auth.users'::regclass
  ) then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;
end
$$;

insert into public.profiles (id, name, email, initials)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'Sans nom'
  ),
  coalesce(u.email, ''),
  coalesce(
    nullif(upper(left(trim(u.raw_user_meta_data->>'initials'), 2)), ''),
    upper(left(coalesce(nullif(trim(u.raw_user_meta_data->>'name'), ''), split_part(coalesce(u.email, ''), '@', 1), '??'), 2))
  )
from auth.users u
on conflict (id) do nothing;

comment on function public.handle_new_user() is
  'Crée un profil Task’in idempotent pour chaque utilisateur Supabase Auth.';
