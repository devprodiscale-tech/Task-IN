-- Task’in — jeu de démonstration v2 · 3/3 : effacement TOTAL (comptes @demo-taskin.invalid + leurs données)
-- À lancer avant la mise en production réelle. Ne touche à aucun vrai compte : tout est filtré sur le
-- domaine réservé @demo-taskin.invalid. Une seule requête (les DELETE sont regroupés dans des CTE).
-- Ordre : les traitements d’abord (clé étrangère « restrict »), puis tout ce qui est lié aux comptes,
-- les shifts du réglage account_shifts, et enfin les comptes (profil supprimé en cascade).

with demo as (select id from public.profiles where email like '%@demo-taskin.invalid'),
  d1 as (delete from public.time_entries where agent_id in (select id from demo) returning 1),
  d2 as (delete from public.complex_cases where agent_id in (select id from demo) or owner_id in (select id from demo) returning 1),
  d3 as (delete from public.coaching_reviews where agent_id in (select id from demo) or reviewer_id in (select id from demo) returning 1),
  d4 as (delete from public.coaching_sheets where agent_id in (select id from demo) or supervisor_id in (select id from demo) returning 1),
  d5 as (delete from public.coaching_notes where agent_id in (select id from demo) or author_id in (select id from demo) returning 1),
  d6 as (delete from public.missed_calls where agent_id in (select id from demo) returning 1),
  d7 as (delete from public.agent_sessions where agent_id in (select id from demo) returning 1),
  d8 as (delete from public.agent_daily_stats where agent_id in (select id from demo) returning 1),
  d9 as (delete from public.agent_daily_goals where agent_id in (select id from demo) returning 1),
  d10 as (delete from public.agent_dispatch_log where agent_id in (select id from demo) returning 1),
  d11 as (delete from public.agent_stat_submissions where agent_id in (select id from demo) returning 1),
  shifts as (
    update public.settings set value = value - array(select id::text from demo), updated_at = now()
    where key = 'account_shifts' returning 1)
select (select count(*) from d1) traitements, (select count(*) from d2) tickets, (select count(*) from d3) ecoutes,
  (select count(*) from d4) fiches, (select count(*) from d5) notes, (select count(*) from d6) appels_manques,
  (select count(*) from d7) connexions, (select count(*) from d8) chiffres_osc, (select count(*) from d9) objectifs,
  (select count(*) from d10) dispatch, (select count(*) from d11) declarations, (select count(*) from shifts) reglage_shifts;

-- Puis les comptes eux-mêmes (profils, vues enregistrées, etc. supprimés en cascade).
with gone as (delete from auth.users where email like '%@demo-taskin.invalid' returning email)
select count(*) as comptes_supprimes from gone;

-- Vérification : doit renvoyer 0.
select count(*) as reste from public.profiles where email like '%@demo-taskin.invalid';
