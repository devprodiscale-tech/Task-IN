-- Task’in — 022 : un agent ne lit que SES chiffres OSC et SES objectifs
-- « Mes résultats » de l’agent ne montre plus l’équipe ; la base l’applique aussi.
-- Encadrement (admin, superviseur, formateur) : lecture de toute l’équipe, inchangée.

drop policy if exists daily_stats_read on public.agent_daily_stats;
create policy daily_stats_read on public.agent_daily_stats for select to authenticated
  using (agent_id = (select auth.uid()) or public.is_taskin_manager());

drop policy if exists daily_goals_read on public.agent_daily_goals;
create policy daily_goals_read on public.agent_daily_goals for select to authenticated
  using (agent_id = (select auth.uid()) or public.is_taskin_manager());
