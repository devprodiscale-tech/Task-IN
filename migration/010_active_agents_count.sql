-- 010 — « Équipe en direct » pour les agents
-- Les règles RLS ne montrent à un agent que son propre timer : l'extension affichait donc
-- « 0 » ou « 1 agent actif ». Cette fonction renvoie uniquement le nombre d'agents qui ont
-- un timer en cours, sans aucun détail (ni qui, ni quoi), aux seuls utilisateurs connectés.
create or replace function public.taskin_active_agents_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$ select count(*)::integer from public.active_timers $$;

revoke execute on function public.taskin_active_agents_count() from public, anon;
grant execute on function public.taskin_active_agents_count() to authenticated;
