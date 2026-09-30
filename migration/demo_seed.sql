-- Données de démonstration (bloc C4) — rattachées aux agents de test existants.
-- Marqueurs : time_entries.id commence par « demo- » et metadata.demo = true ;
-- cas complexes, grilles d'écoute et fiches de coaching ont data.demo = true (titres des cas préfixés « [Démo] »).
-- À effacer avant la mise en production avec migration/demo_cleanup.sql.
-- Rejouable : nettoie d'abord les données de démo existantes.

begin;

delete from public.time_entries where id like 'demo-%';
delete from public.complex_cases where data->>'demo' = 'true';
delete from public.coaching_reviews where data->>'demo' = 'true';
delete from public.coaching_sheets where data->>'demo' = 'true';

select setseed(0.42);

-- 14 derniers jours (hors dimanche), horaires de bureau 8 h – 17 h heure de Madagascar.
with agents as (
  select id, pole from public.profiles where role = 'agent' and pole in ('fo', 'bo', 'reconf')
), days as (
  select d::date as day from generate_series(current_date - 13, current_date, interval '1 day') d
  where extract(isodow from d) < 7
), plan as (
  select a.id, a.pole, days.day,
    (case a.pole when 'fo' then 18 + floor(random() * 9) when 'bo' then 10 + floor(random() * 6) else 25 + floor(random() * 11) end)::int as n
  from agents a cross join days
), draws as (
  select p.id as agent_id, p.pole, p.day, p.n, g as k, random() as r1, random() as r2, random() as r3, random() as r4
  from plan p cross join lateral generate_series(1, p.n) g
), shaped as (
  select *,
    (day + interval '8 hour' + (((k - 1) * (540.0 / n)) + r1 * 8) * interval '1 minute') as local_ts,
    case pole
      when 'fo' then case when r2 < .45 then 'inbound' when r2 < .80 then 'chat' else 'email' end
      when 'bo' then case when r2 < .55 then 'ticket' else 'email' end
      else case when r2 < .90 then 'outbound' else 'email' end
    end as source,
    case pole
      when 'fo' then (array['✅ Confirmation','🎫 Reservations','💡 Conseils/suggestions','✈️ Flights','🏨 Accommodation','🧳 Luggage','🚗 Car rental'])[1 + floor(r4 * 7)::int]
      when 'bo' then (array['🔄 Follow-up','🔍 Lost and found','🗺️ DMC','📋 Itinerary','🚌 Transferts','➕ Additionnels services'])[1 + floor(r4 * 6)::int]
      else (array['📞 Welcome call','✅ Confirmation','👋 Goodbye call','🚆 Train','🎉 Activities'])[1 + floor(r4 * 5)::int]
    end as treatment,
    (case pole when 'fo' then 180 + r3 * 360 when 'bo' then 480 + r3 * 720 else 120 + r3 * 240 end)::int as duration
  from draws
)
insert into public.time_entries (id, raw_id, source, description, treatment, agent_id, inbound_time, started_at, duration_seconds, metadata)
select
  'demo-' || to_char(local_ts, 'YYYYMMDDHH24MISS') || '-' || left(agent_id::text, 8) || '-' || k,
  '',
  source,
  regexp_replace(treatment, '^\S+\s+', '') || ' · réf. #' || (60000 + floor(r1 * 9999))::int,
  treatment,
  agent_id,
  to_char(local_ts - (r3 * 4) * interval '1 minute', 'HH24:MI'),
  local_ts at time zone 'Indian/Antananarivo',
  duration,
  '{"demo": true}'::jsonb
from shaped
where (local_ts at time zone 'Indian/Antananarivo') < now();

-- Supervision : cas complexes, grilles d'écoute, fiches de coaching.
with sup as (select id from public.profiles where role = 'supervisor' order by created_at limit 1),
     fo as (select id from public.profiles where role = 'agent' and pole = 'fo' order by created_at limit 1),
     bo as (select id from public.profiles where role = 'agent' and pole = 'bo' order by created_at limit 1),
     rc as (select id from public.profiles where role = 'agent' and pole = 'reconf' order by created_at limit 1),
     cases(agent, title, descr, priority, status, channel, created_days, deadline_days, resolved_days) as (values
       ('fo', '[Démo] Client bloqué à l''aéroport – vol annulé', 'Vol AF934 annulé, besoin d''un rebooking et d''une nuit d''hôtel.', 'urgent', 'en_cours', 'inbound', 1, -0.2, null),
       ('bo', '[Démo] Remboursement transfert non effectué', 'Le transfert du 24/09 n''a pas eu lieu, le client demande un remboursement.', 'high', 'nouveau', 'email', 2, 2, null),
       ('rc', '[Démo] Réservation hôtel introuvable à la reconfirmation', 'L''hôtel ne retrouve pas la réservation du dossier #64512.', 'medium', 'attente_client', 'outbound', 3, 4, null),
       ('fo', '[Démo] Bagage perdu – suivi compagnie', 'Bagage retrouvé et livré à l''hôtel.', 'low', 'resolu', 'chat', 6, 3, 1)
     )
insert into public.complex_cases (agent_id, owner_id, status, priority, title, description, data)
select
  case c.agent when 'fo' then (select id from fo) when 'bo' then (select id from bo) else (select id from rc) end,
  (select id from sup), c.status, c.priority, c.title, c.descr,
  jsonb_build_object(
    'demo', true, 'title', c.title, 'description', c.descr, 'priority', c.priority, 'status', c.status, 'channel', c.channel,
    'agentId', case c.agent when 'fo' then (select id from fo) when 'bo' then (select id from bo) else (select id from rc) end,
    'createdBy', (select id from sup), 'updates', '[]'::jsonb,
    'createdAt', (extract(epoch from now() - c.created_days * interval '1 day') * 1000)::bigint,
    'deadlineAt', (extract(epoch from now() + c.deadline_days * interval '1 day') * 1000)::bigint,
    'resolvedAt', case when c.resolved_days is null then null else (extract(epoch from now() - c.resolved_days * interval '1 day') * 1000)::bigint end
  )
from cases c;

with sup as (select id from public.profiles where role = 'supervisor' order by created_at limit 1),
     agents as (select id, pole from public.profiles where role = 'agent' and pole in ('fo', 'bo', 'reconf')),
     reviews(pole, days_ago, score, channel, reason) as (values
       ('fo', 2, 86, 'inbound', 'Changement de vol'), ('fo', 9, 78, 'chat', 'Question bagages'),
       ('bo', 3, 72, 'email', 'Remboursement'), ('bo', 10, 64, 'email', 'Suivi transfert'),
       ('reconf', 1, 91, 'outbound', 'Reconfirmation hôtel'), ('reconf', 8, 83, 'outbound', 'Reconfirmation vol')
     )
insert into public.coaching_reviews (agent_id, reviewer_id, channel, review_date, scores, data)
select a.id, (select id from sup), r.channel, now() - r.days_ago * interval '1 day', '{}'::jsonb,
  jsonb_build_object('demo', true, 'agentId', a.id, 'reviewerId', (select id from sup), 'channel', r.channel,
    'date', (extract(epoch from now() - r.days_ago * interval '1 day') * 1000)::bigint,
    'contactReason', r.reason, 'gridValues', '{}'::jsonb, 'totalScorePct', r.score, 'rawScorePct', r.score, 'siTriggered', false,
    'createdAt', (extract(epoch from now() - r.days_ago * interval '1 day') * 1000)::bigint)
from reviews r join agents a on a.pole = r.pole;

with sup as (select id from public.profiles where role = 'supervisor' order by created_at limit 1),
     agents as (select id, pole from public.profiles where role = 'agent' and pole in ('fo', 'bo')),
     sheets(pole, objs, notes) as (values
       ('fo', '[{"text":"Réduire la DMT des appels entrants sous 7 min","status":"en cours"},{"text":"Reformuler systématiquement la demande","status":"atteint"}]'::jsonb, 'Bonne écoute, travailler la concision des explications.'),
       ('bo', '[{"text":"Clôturer les tickets sous 48 h","status":"en cours"},{"text":"Historiser chaque échange client","status":"non atteint"}]'::jsonb, 'Dossiers bien analysés, attention aux relances oubliées.')
     )
insert into public.coaching_sheets (agent_id, supervisor_id, sheet_date, objectives, notes, next_review_date, data)
select a.id, (select id from sup), now() - interval '4 days', s.objs, s.notes, now() + interval '10 days',
  jsonb_build_object('demo', true, 'agentId', a.id, 'supervisorId', (select id from sup),
    'date', (extract(epoch from now() - interval '4 days') * 1000)::bigint,
    'objectifs', s.objs, 'notes', s.notes,
    'nextReviewDate', (extract(epoch from now() + interval '10 days') * 1000)::bigint,
    'createdAt', (extract(epoch from now() - interval '4 days') * 1000)::bigint)
from sheets s join agents a on a.pole = s.pole;

commit;
