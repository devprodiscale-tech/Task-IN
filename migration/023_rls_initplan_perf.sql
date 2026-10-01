-- Task’in — 023 : performance des règles d’accès (RLS) avant la montée en volume
-- Constat (données de démo, 5 800 traitements) : chaque ligne lue réévaluait auth.uid() et
-- is_taskin_manager() → ~90 ms par page de 1 000 lignes, et la charge croît avec l’historique.
-- Correctif recommandé par Supabase : envelopper ces fonctions dans « (select …) » ; Postgres les
-- calcule UNE fois par requête (InitPlan). Les règles elles-mêmes sont strictement identiques.
-- Index complémentaires pour les lectures par période et par auteur.

alter policy timers_read_own_or_manager on public.active_timers
  using (((agent_id = (select auth.uid())) OR (select public.is_taskin_manager())));
alter policy timers_write_own_or_admin on public.active_timers
  using (((agent_id = (select auth.uid())) OR (select public.is_taskin_admin())))
  with check (((agent_id = (select auth.uid())) OR (select public.is_taskin_admin())));
alter policy daily_goals_read on public.agent_daily_goals
  using (((agent_id = (select auth.uid())) OR (select public.is_taskin_manager())));
alter policy daily_goals_write on public.agent_daily_goals
  using ((select public.is_taskin_ops_manager()))
  with check ((select public.is_taskin_ops_manager()));
alter policy daily_stats_read on public.agent_daily_stats
  using (((agent_id = (select auth.uid())) OR (select public.is_taskin_manager())));
alter policy daily_stats_write on public.agent_daily_stats
  using ((select public.is_taskin_ops_manager()))
  with check ((select public.is_taskin_ops_manager()));
alter policy dispatch_delete on public.agent_dispatch_log
  using ((select public.is_taskin_ops_manager()));
alter policy dispatch_insert on public.agent_dispatch_log
  with check (((agent_id = (select auth.uid())) OR (select public.is_taskin_ops_manager())));
alter policy agent_sessions_insert_own on public.agent_sessions
  with check ((agent_id = (select auth.uid())));
alter policy agent_sessions_read_own_or_manager on public.agent_sessions
  using (((agent_id = (select auth.uid())) OR (select public.is_taskin_manager())));
alter policy submissions_insert_own on public.agent_stat_submissions
  with check (((agent_id = (select auth.uid())) AND ((select public.current_taskin_role()) = 'agent'::taskin_role) AND ((day >= (CURRENT_DATE - 1)) AND (day <= (CURRENT_DATE + 1)))));
alter policy submissions_manage on public.agent_stat_submissions
  using ((select public.is_taskin_ops_manager()))
  with check ((select public.is_taskin_ops_manager()));
alter policy submissions_read on public.agent_stat_submissions
  using (((agent_id = (select auth.uid())) OR (select public.is_taskin_manager())));
alter policy submissions_update_own on public.agent_stat_submissions
  using (((agent_id = (select auth.uid())) AND (status = ANY (ARRAY['pending'::text, 'rejected'::text]))))
  with check (((agent_id = (select auth.uid())) AND ((day >= (CURRENT_DATE - 1)) AND (day <= (CURRENT_DATE + 1)))));
alter policy archives_read_admin on public.archive_runs
  using ((select public.is_taskin_admin()));
alter policy archives_write_admin on public.archive_runs
  using ((select public.is_taskin_admin()))
  with check ((select public.is_taskin_admin()));
alter policy coaching_notes_manager on public.coaching_notes
  using ((select public.is_taskin_manager()))
  with check ((select public.is_taskin_manager()));
alter policy reviews_read_agent_shared on public.coaching_reviews
  using (((agent_id = (select auth.uid())) AND COALESCE(((data ->> 'sharedWithAgent'::text))::boolean, false)));
alter policy reviews_read_manager on public.coaching_reviews
  using ((select public.is_taskin_manager()));
alter policy reviews_write_manager on public.coaching_reviews
  using ((select public.is_taskin_manager()))
  with check ((select public.is_taskin_manager()));
alter policy sheets_read_manager_or_agent on public.coaching_sheets
  using (((agent_id = (select auth.uid())) OR (select public.is_taskin_manager())));
alter policy sheets_write_manager on public.coaching_sheets
  using ((select public.is_taskin_manager()))
  with check ((select public.is_taskin_manager()));
alter policy cases_insert_own_agent on public.complex_cases
  with check (((agent_id = (select auth.uid())) AND (owner_id = (select auth.uid())) AND (status = 'nouveau'::text) AND ((data ->> 'reportedBy'::text) = ((select auth.uid()))::text)));
alter policy cases_write_manager on public.complex_cases
  using ((select public.is_taskin_manager()))
  with check ((select public.is_taskin_manager()));
alter policy goals_write_manager on public.goals
  using ((select public.is_taskin_manager()))
  with check ((select public.is_taskin_manager()));
alter policy missed_calls_delete on public.missed_calls
  using (((created_by = (select auth.uid())) OR (select public.is_taskin_ops_manager())));
alter policy missed_calls_insert on public.missed_calls
  with check ((created_by = (select auth.uid())));
alter policy missed_calls_update on public.missed_calls
  using (((created_by = (select auth.uid())) OR (agent_id = (select auth.uid())) OR (select public.is_taskin_ops_manager())))
  with check (((created_by = (select auth.uid())) OR (agent_id = (select auth.uid())) OR (select public.is_taskin_ops_manager())));
alter policy procedures_write_manager on public.procedures
  using ((select public.is_taskin_manager()))
  with check ((select public.is_taskin_manager()));
alter policy profiles_delete_admin on public.profiles
  using (((select public.is_taskin_admin()) AND (id <> (select auth.uid()))));
alter policy profiles_insert_admin on public.profiles
  with check (((select public.is_taskin_admin()) OR (id = (select auth.uid()))));
alter policy profiles_update_self_or_admin on public.profiles
  using (((id = (select auth.uid())) OR (select public.is_taskin_admin())))
  with check (((id = (select auth.uid())) OR (select public.is_taskin_admin())));
alter policy settings_write_admin on public.settings
  using ((select public.is_taskin_admin()))
  with check ((select public.is_taskin_admin()));
alter policy saved_views_delete on public.taskin_saved_views
  using (((owner_id = (select auth.uid())) OR (select public.is_taskin_ops_manager())));
alter policy saved_views_insert on public.taskin_saved_views
  with check (((select public.is_taskin_manager()) AND (owner_id = (select auth.uid()))));
alter policy saved_views_select on public.taskin_saved_views
  using (((select public.is_taskin_manager()) AND ((owner_id = (select auth.uid())) OR shared)));
alter policy saved_views_update on public.taskin_saved_views
  using ((owner_id = (select auth.uid())))
  with check ((owner_id = (select auth.uid())));
alter policy entries_delete_own_or_admin on public.time_entries
  using (((agent_id = (select auth.uid())) OR (select public.is_taskin_admin())));
alter policy entries_insert_own on public.time_entries
  with check (((agent_id = (select auth.uid())) OR (select public.is_taskin_manager())));
alter policy entries_read_own_or_manager on public.time_entries
  using (((agent_id = (select auth.uid())) OR (select public.is_taskin_manager())));
alter policy entries_update_own_or_manager on public.time_entries
  using (((agent_id = (select auth.uid())) OR (select public.is_taskin_manager())))
  with check (((agent_id = (select auth.uid())) OR (select public.is_taskin_manager())));
alter policy acknowledgements_read_own_or_manager on public.training_acknowledgements
  using (((agent_id = (select auth.uid())) OR (select public.is_taskin_manager())));
alter policy acknowledgements_write_own_or_manager on public.training_acknowledgements
  using (((agent_id = (select auth.uid())) OR (select public.is_taskin_manager())))
  with check (((agent_id = (select auth.uid())) OR (select public.is_taskin_manager())));
alter policy training_modules_write_manager on public.training_modules
  using ((select public.is_taskin_manager()))
  with check ((select public.is_taskin_manager()));
alter policy training_progress_read_own_or_manager on public.training_progress
  using (((agent_id = (select auth.uid())) OR (select public.is_taskin_manager())));
alter policy training_progress_write_own_or_manager on public.training_progress
  using (((agent_id = (select auth.uid())) OR (select public.is_taskin_manager())))
  with check (((agent_id = (select auth.uid())) OR (select public.is_taskin_manager())));
alter policy training_quizzes_write_manager on public.training_quizzes
  using ((select public.is_taskin_manager()))
  with check ((select public.is_taskin_manager()));
alter policy training_skills_write_manager on public.training_skills
  using ((select public.is_taskin_manager()))
  with check ((select public.is_taskin_manager()));
alter policy training_updates_write_manager on public.training_updates
  using ((select public.is_taskin_manager()))
  with check ((select public.is_taskin_manager()));

-- Lectures « depuis une date » de l’app et de l’extension.
create index if not exists missed_calls_date_idx on public.missed_calls (call_date desc);
create index if not exists complex_cases_created_idx on public.complex_cases (created_at desc);
