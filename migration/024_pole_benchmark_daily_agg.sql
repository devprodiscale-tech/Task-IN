-- Task’in — 024 : moyenne du pôle pour l’agent + agrégats journaliers (volumétrie)
-- 1. taskin_pole_benchmark : l’agent est objectivé par la MOYENNE de son pôle (FO / BO / Reconf),
--    la veille (dernier jour sur 7 avec au moins 2 agents saisis) et le jour demandé. Seules des
--    moyennes sortent (jamais une ligne individuelle) ; au moins 2 agents par moyenne.
--    L’agent ne peut lire que son propre pôle ; l’encadrement peut passer p_pole.
-- 2. taskin_entries_daily : traitements agrégés par agent et par jour (fuseau Madagascar). Les courbes
--    longues (12 mois, tout l’historique) lisent ces agrégats au lieu de télécharger chaque traitement.
--    security invoker : les règles d’accès de time_entries s’appliquent (un agent ne voit que lui).

create or replace function public.taskin_pole_benchmark(p_day date, p_pole text default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_role text := public.current_taskin_role();
  v_pole text;
  v_ref date;
  v_out jsonb;
begin
  if v_role is null then raise exception 'Accès refusé'; end if;
  if v_role = 'agent' then
    select pole into v_pole from public.profiles where id = auth.uid();
  else
    v_pole := lower(p_pole);
  end if;
  if v_pole is null or v_pole not in ('fo', 'bo', 'reconf') then return null; end if;
  select s.day into v_ref
  from public.agent_daily_stats s join public.profiles p on p.id = s.agent_id and p.role = 'agent' and p.pole = v_pole
  where s.day < p_day and s.day >= p_day - 7
  group by s.day having count(*) >= 2
  order by s.day desc limit 1;
  select jsonb_build_object('pole', v_pole, 'refDay', v_ref, 'days', coalesce(jsonb_object_agg(x.day, x.avgs), '{}'::jsonb))
  into v_out
  from (
    select s.day, jsonb_build_object(
      'agents', count(*),
      'actions', case when count(s.actions) >= 2 then round(avg(s.actions), 1) end,
      'calls', case when count(s.calls_in) + count(s.calls_out) >= 2 then round(avg(coalesce(s.calls_in, 0) + coalesce(s.calls_out, 0)) filter (where s.calls_in is not null or s.calls_out is not null), 1) end,
      'resolved', case when count(s.resolved) >= 2 then round(avg(s.resolved), 1) end,
      'crisp', case when count(s.crisp_conversations) >= 2 then round(avg(s.crisp_conversations), 1) end,
      'worked', case when count(s.worked_minutes) >= 2 then round(avg(s.worked_minutes)) end) as avgs
    from public.agent_daily_stats s join public.profiles p on p.id = s.agent_id and p.role = 'agent' and p.pole = v_pole
    where s.day in (p_day, v_ref)
    group by s.day having count(*) >= 2
  ) x;
  return v_out;
end $$;
revoke all on function public.taskin_pole_benchmark(date, text) from public, anon;
grant execute on function public.taskin_pole_benchmark(date, text) to authenticated;

create or replace function public.taskin_entries_daily(p_from date default null)
returns table (agent_id uuid, day date, n integer, seconds bigint)
language sql stable security invoker set search_path = public
as $$
  select e.agent_id, (e.started_at at time zone 'Indian/Antananarivo')::date as day, count(*)::int, coalesce(sum(e.duration_seconds), 0)::bigint
  from public.time_entries e
  where p_from is null or e.started_at >= (p_from::timestamp at time zone 'Indian/Antananarivo')
  group by 1, 2
$$;
revoke all on function public.taskin_entries_daily(date) from public, anon;
grant execute on function public.taskin_entries_daily(date) to authenticated;
