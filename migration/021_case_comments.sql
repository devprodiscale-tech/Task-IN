-- Task’in — 021 : tickets de retour agents — commentaires et doublons
-- Un agent ne modifie jamais un cas (règles 001 / 013). Pour commenter un ticket déjà signalé
-- (au lieu de créer un doublon) ou répondre au superviseur, il passe par cette fonction, qui
-- n’ajoute qu’un commentaire horodaté dans data.updates et l’inscrit parmi les agents concernés.
-- Clé de référence normalisée (data.refKey) indexée pour la détection des doublons.

create or replace function public.taskin_case_comment(p_id uuid, p_note text)
returns setof public.complex_cases
language plpgsql security definer set search_path = public
as $$
declare
  v_role text := public.current_taskin_role();
  v_note text := btrim(coalesce(p_note, ''));
begin
  if v_role is null or v_role = 'formateur' then raise exception 'Accès refusé'; end if;
  if char_length(v_note) < 2 or char_length(v_note) > 1500 then raise exception 'Commentaire vide ou trop long'; end if;
  return query
  update public.complex_cases
     set data = jsonb_set(
                  jsonb_set(data, '{updates}', coalesce(data->'updates', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                    'by', auth.uid(), 'at', (extract(epoch from now()) * 1000)::bigint, 'note', v_note,
                    'kind', case when v_role = 'agent' then 'agent' else 'manager' end))),
                  '{followers}',
                  case when v_role = 'agent' and auth.uid() is distinct from agent_id
                            and not coalesce(data->'followers', '[]'::jsonb) ? auth.uid()::text
                       then coalesce(data->'followers', '[]'::jsonb) || to_jsonb(auth.uid()::text)
                       else coalesce(data->'followers', '[]'::jsonb) end),
         updated_at = now()
   where id = p_id
     and status <> 'resolu'
  returning *;
end $$;
revoke all on function public.taskin_case_comment(uuid, text) from anon, public;
grant execute on function public.taskin_case_comment(uuid, text) to authenticated;

create index if not exists complex_cases_refkey_idx on public.complex_cases ((data->>'refKey')) where data ? 'refKey';
