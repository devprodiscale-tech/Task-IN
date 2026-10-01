-- Task’in — 016 : import de l’historique du Google Sheet des appels manqués
-- agent_name garde le prénom saisi dans le Sheet tant que l’agent n’a pas de compte Task’in
-- (Crystella, Gaëlle, Patrick, Yannis, Tina) ; source distingue les lignes importées.
-- Quand un compte est créé, relier ses lignes avec :
--   update public.missed_calls set agent_id = '<uuid>' where agent_id is null and agent_name = '<Prénom>';
--   update public.missed_calls set callback_by = '<uuid>', callback_by_other = null where callback_by is null and callback_by_other = '<Prénom>';

alter table public.missed_calls add column if not exists agent_name text check (char_length(agent_name) <= 60);
alter table public.missed_calls add column if not exists source text not null default 'app' check (source in ('app', 'sheet'));
create index if not exists missed_calls_source_idx on public.missed_calls (source);
