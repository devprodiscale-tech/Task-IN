-- Efface toutes les données de démonstration (bloc C4) avant la mise en production.
-- Ne touche qu'aux lignes marquées : id « demo-… » pour les tâches, data.demo = true pour la supervision.
begin;
delete from public.time_entries where id like 'demo-%';
delete from public.complex_cases where data->>'demo' = 'true';
delete from public.coaching_reviews where data->>'demo' = 'true';
delete from public.coaching_sheets where data->>'demo' = 'true';
commit;

-- Vérification : doit renvoyer 0 partout.
select
  (select count(*) from public.time_entries where id like 'demo-%') as taches_demo,
  (select count(*) from public.complex_cases where data->>'demo' = 'true') as cas_demo,
  (select count(*) from public.coaching_reviews where data->>'demo' = 'true') as grilles_demo,
  (select count(*) from public.coaching_sheets where data->>'demo' = 'true') as fiches_demo;
