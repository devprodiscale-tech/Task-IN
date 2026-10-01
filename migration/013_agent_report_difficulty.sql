-- Task’in — 013 : l’agent peut signaler lui-même une difficulté (cas complexe)
-- Uniquement pour lui, au statut « nouveau » et marqué reportedBy = lui : le superviseur
-- le qualifie ensuite (priorité, échéance, suivi). L’agent ne peut ni modifier ni supprimer.

drop policy if exists cases_insert_own_agent on public.complex_cases;
create policy cases_insert_own_agent on public.complex_cases for insert to authenticated
  with check (
    agent_id = auth.uid()
    and owner_id = auth.uid()
    and status = 'nouveau'
    and data->>'reportedBy' = auth.uid()::text
  );
