-- Task’in — 015 : un agent ne modifie que SES appels manqués
-- Lignes : modifiables par leur auteur ou l’agent concerné ; admin / superviseur : toutes.
-- Exception contrôlée pour le travail d’équipe : réserver le rappel d’un collègue (« Je rappelle »)
-- et le marquer rappelé passent par deux fonctions qui ne touchent QUE les champs de rappel.

drop policy if exists missed_calls_update on public.missed_calls;
create policy missed_calls_update on public.missed_calls for update to authenticated
  using (created_by = auth.uid() or agent_id = auth.uid() or public.is_taskin_ops_manager())
  with check (created_by = auth.uid() or agent_id = auth.uid() or public.is_taskin_ops_manager());

-- Réserver / libérer un rappel encore en attente. Refusé si un collègue l’a déjà réservé.
create or replace function public.taskin_missed_claim(p_id uuid, p_take boolean)
returns setof public.missed_calls
language plpgsql security definer set search_path = public
as $$
begin
  if public.current_taskin_role() is null or public.current_taskin_role() = 'formateur' then
    raise exception 'Accès refusé';
  end if;
  return query
  update public.missed_calls
     set claimed_by = case when p_take then auth.uid() else null end,
         claimed_at = case when p_take then now() else null end
   where id = p_id
     and callback = 'pending'
     and (case when p_take then (claimed_by is null or claimed_by = auth.uid()) else claimed_by = auth.uid() end)
  returning *;
end $$;

-- Marquer rappelé (par soi-même) un appel en attente, réservé par soi ou par personne.
create or replace function public.taskin_missed_callback(p_id uuid, p_callback text, p_time time, p_note text)
returns setof public.missed_calls
language plpgsql security definer set search_path = public
as $$
begin
  if public.current_taskin_role() is null or public.current_taskin_role() = 'formateur' then
    raise exception 'Accès refusé';
  end if;
  if p_callback not in ('5','10','10+','none') then
    raise exception 'Valeur de rappel invalide';
  end if;
  return query
  update public.missed_calls
     set callback = p_callback,
         callback_by = case when p_callback = 'none' then callback_by else auth.uid() end,
         callback_time = p_time,
         notes = case when coalesce(trim(p_note), '') = '' then notes
                      when coalesce(notes, '') = '' then left(trim(p_note), 1000)
                      else left(notes || ' · ' || trim(p_note), 1000) end,
         claimed_by = null, claimed_at = null
   where id = p_id
     and callback = 'pending'
     and (claimed_by is null or claimed_by = auth.uid())
  returning *;
end $$;

revoke all on function public.taskin_missed_claim(uuid, boolean) from public, anon;
revoke all on function public.taskin_missed_callback(uuid, text, time, text) from public, anon;
grant execute on function public.taskin_missed_claim(uuid, boolean) to authenticated;
grant execute on function public.taskin_missed_callback(uuid, text, time, text) to authenticated;
