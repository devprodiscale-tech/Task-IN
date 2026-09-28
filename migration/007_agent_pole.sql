-- Task’in / Supabase
-- Migration 007 : pôle des agents (FO / BO / Reconf) + verrouillage des colonnes sensibles de profiles
-- Idempotente : peut être rejouée sans risque. Aucune donnée existante n'est supprimée.
--
-- Pourquoi cette migration ?
--   1) Ajouter la notion de pôle (fo, bo, reconf) sans toucher au rôle « agent ».
--   2) Corriger une faille : la policy profiles_update_self_or_admin (migration 001) laisse un
--      utilisateur modifier sa propre ligne, colonne role comprise (=> un agent pouvait se passer admin).

-- ---------------------------------------------------------------
-- 1) Colonne pole
-- ---------------------------------------------------------------
alter table public.profiles add column if not exists pole text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_pole_check') then
    alter table public.profiles
      add constraint profiles_pole_check
      check (pole is null or pole in ('fo', 'bo', 'reconf'));
  end if;
end
$$;

comment on column public.profiles.pole is
  'Pôle de l''agent : fo (Front Office), bo (Back Office), reconf (Reconfirmation). NULL = non défini ou rôle autre qu''agent.';

-- ---------------------------------------------------------------
-- 2) Garde-fou : seuls les admins peuvent définir role et pole
-- ---------------------------------------------------------------
-- auth.uid() vaut NULL quand l'appel ne vient pas d'un utilisateur connecté
-- (clé service_role côté serveur Vercel, SQL Editor Supabase, trigger handle_new_user).
-- Ces cas restent donc autorisés ; seules les requêtes d'utilisateurs authentifiés sont contrôlées.
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Un pôle n'a de sens que pour un agent.
  if new.role is distinct from 'agent'::public.taskin_role then
    new.pole := null;
  end if;

  -- Serveur, SQL Editor, trigger d'inscription, ou admin connecté : on laisse passer.
  if auth.uid() is null or public.is_taskin_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.role is distinct from 'agent'::public.taskin_role or new.pole is not null then
      raise exception 'Seul un administrateur peut définir le rôle ou le pôle.'
        using errcode = '42501';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role or new.pole is distinct from old.pole then
      raise exception 'Seul un administrateur peut modifier le rôle ou le pôle.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_privileged_columns on public.profiles;
create trigger profiles_protect_privileged_columns
  before insert or update on public.profiles
  for each row execute function public.protect_profile_privileged_columns();

comment on function public.protect_profile_privileged_columns() is
  'Empêche un utilisateur non admin de modifier role/pole (élévation de privilèges) et vide pole si le rôle n''est pas agent.';

-- ---------------------------------------------------------------
-- 3) Vérification (à lancer À LA MAIN dans le SQL Editor, tout est annulé par le rollback)
-- ---------------------------------------------------------------
-- Remplace <UUID_AGENT> par l'id d'un compte au rôle agent (table profiles).
--
-- begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<UUID_AGENT>","role":"authenticated"}';
--   update public.profiles set role = 'admin' where id = '<UUID_AGENT>';
--   -- Résultat attendu : ERROR 42501 « Seul un administrateur peut modifier le rôle ou le pôle. »
-- rollback;
