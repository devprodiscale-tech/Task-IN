-- Task’in — 018 : notes de coaching et grilles d’écoute partagées avec l’agent
-- 1. coaching_notes : notes PRIVÉES de l’encadrement (jamais visibles par l’agent), prises sur une écoute,
--    la fiche 360° ou le reporting, à aborder au prochain 1:1. Une note « traitée » est rattachée à la fiche 1:1.
-- 2. coaching_reviews : l’agent lit SES grilles quand l’évaluateur les a partagées (data.sharedWithAgent),
--    avec le retour qui lui est destiné (data.agentFeedback). Il confirme la lecture via une fonction serveur.

create table if not exists public.coaching_notes (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete set null,
  source text not null default 'other' check (source in ('review', 'pilotage', 'reporting', 'other')),
  ref_id uuid,
  body text not null check (char_length(body) between 1 and 4000),
  status text not null default 'open' check (status in ('open', 'done')),
  sheet_id uuid references public.coaching_sheets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists coaching_notes_agent_idx on public.coaching_notes (agent_id, status);

alter table public.coaching_notes enable row level security;
drop policy if exists coaching_notes_manager on public.coaching_notes;
create policy coaching_notes_manager on public.coaching_notes for all to authenticated
  using (public.is_taskin_manager()) with check (public.is_taskin_manager());
grant select, insert, update, delete on public.coaching_notes to authenticated;

drop policy if exists reviews_read_agent_shared on public.coaching_reviews;
create policy reviews_read_agent_shared on public.coaching_reviews for select to authenticated
  using (agent_id = auth.uid() and coalesce((data->>'sharedWithAgent')::boolean, false));

create or replace function public.taskin_review_ack(p_id uuid)
returns setof public.coaching_reviews
language plpgsql security definer set search_path = public
as $$
begin
  return query
  update public.coaching_reviews
     set data = data || jsonb_build_object('agentAckAt', (extract(epoch from now()) * 1000)::bigint),
         updated_at = now()
   where id = p_id
     and agent_id = auth.uid()
     and coalesce((data->>'sharedWithAgent')::boolean, false)
     and data->>'agentAckAt' is null
  returning *;
end $$;
revoke all on function public.taskin_review_ack(uuid) from public;
grant execute on function public.taskin_review_ack(uuid) to authenticated;
