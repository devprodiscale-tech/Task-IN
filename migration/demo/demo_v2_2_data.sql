-- Task’in — jeu de démonstration v2 · 2/3 : activité fictive des comptes @demo-taskin.invalid
-- 3 semaines + aujourd’hui (jusqu’à l’heure actuelle) : traitements, connexions, chiffres OSC,
-- objectifs, dispatch, appels manqués, tickets agents, écoutes, fiches 1:1 et notes de coaching.
-- Marqueurs : time_entries.id « demo2-… » + metadata.demo ; data.demo = true ailleurs.
-- Rejouable : à relancer le matin d’un tournage pour avoir des chiffres « du jour ». L’étape 0 efface
-- l’activité des comptes de démo (les comptes restent). Prérequis : demo_v2_1_accounts.sql.
-- Effacement total : demo_v2_cleanup.sql.
-- Pas de table temporaire : sur ce projet, un DDL lancé depuis l’éditeur SQL peut rester bloqué.
-- Lancer les 4 étapes l’une après l’autre (une requête chacune).
-- Scénario : Hasina M. (shift 13 h – 22 h) n’est pas connectée aujourd’hui → statut « Pas connecté ».

-- ── Étape 0 : remise à zéro de l’activité de démo ─────────────────────────────────────────────
with a as (select id from public.profiles where email like '%@demo-taskin.invalid' and role = 'agent'),
  d1 as (delete from public.time_entries where agent_id in (select id from a) returning 1),
  d2 as (delete from public.agent_sessions where agent_id in (select id from a) returning 1),
  d3 as (delete from public.agent_daily_stats where agent_id in (select id from a) returning 1),
  d4 as (delete from public.agent_daily_goals where agent_id in (select id from a) returning 1),
  d5 as (delete from public.agent_dispatch_log where agent_id in (select id from a) returning 1),
  d6 as (delete from public.missed_calls where agent_id in (select id from a) returning 1),
  d7 as (delete from public.complex_cases where agent_id in (select id from a) returning 1),
  d8 as (delete from public.coaching_reviews where agent_id in (select id from a) returning 1),
  d9 as (delete from public.coaching_sheets where agent_id in (select id from a) returning 1),
  d10 as (delete from public.coaching_notes where agent_id in (select id from a) returning 1),
  d11 as (delete from public.agent_stat_submissions where agent_id in (select id from a) returning 1)
select (select count(*) from d1) + (select count(*) from d2) + (select count(*) from d3) + (select count(*) from d4)
     + (select count(*) from d5) + (select count(*) from d6) + (select count(*) from d7) + (select count(*) from d8)
     + (select count(*) from d9) + (select count(*) from d10) + (select count(*) from d11) as lignes_effacees;

-- ── Étape 1 : traitements (pics de flux matin / après-midi pour la heatmap, part hors SLA) ────
with a0 as (
  select p.id, p.name, p.pole,
    array_position(array['Mialy R.','Toky A.','Fanja H.','Hasina M.','Lova T.','Nirina S.','Tiana V.','Rado F.','Voahirana K.','Sitraka B.','Ony L.'], p.name) as n,
    coalesce((select s.value->>p.id::text from public.settings s where s.key = 'account_shifts'), '08:00-17:00') as shift
  from public.profiles p where p.email like '%@demo-taskin.invalid' and p.role = 'agent'
), a as (
  -- Rythme propre à chaque agent : volume et vitesse différents (classement lisible).
  select a0.*, (array[1.15, 0.95, 1.05, 0.85, 1.25, 1.0, 0.9, 1.1, 1.05, 0.8, 1.2])[n] vol,
    (array[0.85, 1.1, 0.95, 1.2, 0.9, 1.0, 1.15, 0.9, 0.95, 1.25, 0.88])[n] speed,
    split_part(split_part(shift, '-', 1), ':', 1)::int * 60 s_start from a0
), d as (
  select dd::date as day from generate_series((now() at time zone 'Indian/Antananarivo')::date - 21, (now() at time zone 'Indian/Antananarivo')::date, interval '1 day') dd
  where extract(isodow from dd) < 7
)
insert into public.time_entries (id, raw_id, source, description, treatment, agent_id, inbound_time, started_at, duration_seconds, metadata)
select
  'demo2-' || to_char(local_ts, 'YYYYMMDDHH24MISS') || '-' || left(agent_id::text, 8) || '-' || k,
  '', source,
  regexp_replace(treatment, '^\S+\s+', '') || ' · réf. #' || (60000 + floor(r1 * 9999))::int,
  treatment, agent_id,
  to_char(local_ts - (r3 * 4) * interval '1 minute', 'HH24:MI'),
  local_ts at time zone 'Indian/Antananarivo',
  duration, '{"demo": true}'::jsonb
from (
  select x.*,
    (x.day + (x.s_start + x.off_h * 60 + floor(x.r1 * 60)) * interval '1 minute') as local_ts,
    case x.pole
      when 'fo' then case when x.r2 < .45 then 'inbound' when x.r2 < .80 then 'chat' else 'email' end
      when 'bo' then case when x.r2 < .55 then 'ticket' else 'email' end
      else case when x.r2 < .85 then 'outbound' else 'email' end
    end as source,
    case x.pole
      when 'fo' then (array['✅ Confirmation','🎫 Reservations','💡 Conseils/suggestions','✈️ Flights','🏨 Accommodation','🧳 Luggage','🚗 Car rental'])[1 + floor(x.r4 * 7)::int]
      when 'bo' then (array['🔄 Follow-up','🔍 Lost and found','🗺️ DMC','📋 Itinerary','🚌 Transferts','➕ Additionnels services'])[1 + floor(x.r4 * 6)::int]
      else (array['📞 Welcome call','✅ Confirmation','👋 Goodbye call','🚆 Train','🎉 Activities'])[1 + floor(x.r4 * 5)::int]
    end as treatment,
    -- DMT : la plupart dans la cible du canal, une part hors SLA (agents plus lents = plus de hors SLA).
    (x.speed * case x.pole when 'fo' then 170 + x.r3 * 330 + case when x.r5 < .12 then 420 else 0 end
                         when 'bo' then 420 + x.r3 * 600 + case when x.r5 < .12 then 900 else 0 end
                         else 110 + x.r3 * 200 + case when x.r5 < .10 then 300 else 0 end end)::int as duration
  from (
    select a.id as agent_id, a.n, a.pole, a.speed, a.s_start, d.day, g as k,
      (array[0,1,1,1,2,2,2,2,3,3,4,5,5,6,6,6,6,7,7,8])[1 + floor(random() * 20)::int] as off_h,
      random() as r1, random() as r2, random() as r3, random() as r4, random() as r5
    from a cross join d
    cross join lateral generate_series(1, greatest(4, round(a.vol * case a.pole when 'fo' then 22 + random() * 8 when 'bo' then 12 + random() * 5 else 28 + random() * 10 end
      * case extract(isodow from d.day) when 1 then 1.15 when 6 then 0.6 else 1 end)::int)) g
    -- Un samedi de repos pour un agent sur trois.
    where not (extract(isodow from d.day) = 6 and a.n % 3 = 0)
  ) x
) y
where (local_ts at time zone 'Indian/Antananarivo') < now()
  -- Hasina : rien aujourd’hui.
  and not (n = 4 and local_ts::date = (now() at time zone 'Indian/Antananarivo')::date);

-- ── Étape 2 : connexions, chiffres OSC, objectifs, dispatch, appels manqués ──────────────────
with a as (
  select p.id, p.name, p.pole,
    array_position(array['Mialy R.','Toky A.','Fanja H.','Hasina M.','Lova T.','Nirina S.','Tiana V.','Rado F.','Voahirana K.','Sitraka B.','Ony L.'], p.name) as n,
    split_part(coalesce((select s.value->>p.id::text from public.settings s where s.key = 'account_shifts'), '08:00-17:00'), ':', 1)::int * 60 as s_start, 540 as s_len
  from public.profiles p where p.email like '%@demo-taskin.invalid' and p.role = 'agent'
), d as (
  select dd::date as day, dd::date = (now() at time zone 'Indian/Antananarivo')::date as is_today
  from generate_series((now() at time zone 'Indian/Antananarivo')::date - 21, (now() at time zone 'Indian/Antananarivo')::date, interval '1 day') dd
  where extract(isodow from dd) < 7
), logins as (
  -- Arrivée au début du shift, quelques retards.
  insert into public.agent_sessions (agent_id, event, created_at)
  select a.id, 'login', ((d.day + (a.s_start - 6 + floor(random() * (case when random() < .15 then 35 else 12 end))) * interval '1 minute') at time zone 'Indian/Antananarivo')
  from a cross join d
  where not (extract(isodow from d.day) = 6 and a.n % 3 = 0)
    and ((d.day + a.s_start * interval '1 minute') at time zone 'Indian/Antananarivo') < now()
    and not (d.is_today and a.n = 4)
  returning 1
), logouts as (
  insert into public.agent_sessions (agent_id, event, created_at)
  select a.id, 'logout', ((d.day + (a.s_start + a.s_len + floor(random() * 10)) * interval '1 minute') at time zone 'Indian/Antananarivo')
  from a cross join d
  where not (extract(isodow from d.day) = 6 and a.n % 3 = 0)
    and ((d.day + (a.s_start + a.s_len + 10) * interval '1 minute') at time zone 'Indian/Antananarivo') < now()
    and not (d.is_today and a.n = 4)
  returning 1
), stats as (
  -- Chiffres OSC officiels des jours passés, cohérents avec les traitements.
  insert into public.agent_daily_stats (agent_id, day, worked_minutes, calls_in, calls_out, call_minutes, tasks_open, tickets_assigned,
    actions, created, resolved, crisp_conversations, crisp_messages, source, entered_by, agent_submitted_at, agent_stats_time)
  select t.agent_id, t.day,
    480 + floor(random() * 50)::int,
    case when a.pole = 'fo' then t.inbound else floor(random() * 3)::int end,
    case when a.pole = 'reconf' then t.outbound else floor(random() * 4)::int end,
    ((t.inbound + t.outbound) * (4 + random() * 3))::int,
    floor(random() * 4)::int, 12 + floor(random() * 10)::int,
    t.total + floor(random() * 8)::int,
    floor(t.total * (0.2 + random() * 0.15))::int,
    floor(t.total * (0.55 + random() * 0.3))::int,
    case when a.pole = 'fo' then t.chat else 0 end,
    case when a.pole = 'fo' then (t.chat * (4 + random() * 4))::int else 0 end,
    'manual', (select id from public.profiles where email = 'sarah.sup@demo-taskin.invalid'),
    ((t.day + (a.s_start + a.s_len - 8) * interval '1 minute') at time zone 'Indian/Antananarivo'),
    make_time(((a.s_start + a.s_len - 10) / 60), ((a.s_start + a.s_len - 10) % 60), 0)
  from (
    select agent_id, (started_at at time zone 'Indian/Antananarivo')::date as day, count(*)::int as total,
      count(*) filter (where source = 'inbound')::int as inbound, count(*) filter (where source = 'outbound')::int as outbound,
      count(*) filter (where source = 'chat')::int as chat
    from public.time_entries where id like 'demo2-%' group by 1, 2
  ) t join a on a.id = t.agent_id
  where t.day < (now() at time zone 'Indian/Antananarivo')::date
  returning 1
), goals as (
  insert into public.agent_daily_goals (agent_id, day, goals, focus, set_by)
  select a.id, (now() at time zone 'Indian/Antananarivo')::date, g.goals, g.focus, (select id from public.profiles where email = 'sarah.sup@demo-taskin.invalid')
  from a join (values
    (1, '{"actions": 34, "calls": 14}'::jsonb, 'Priorité aux appels entrants ce matin : pic de vols annulés.'),
    (4, '{"actions": 26}'::jsonb, 'Retour de coaching : garder la DMT chat sous 6 min.'),
    (6, '{"resolved": 14}'::jsonb, 'Clôturer les relances fournisseurs en attente depuis 48 h.'),
    (10, '{"calls": 30}'::jsonb, 'Reconfirmations du week-end à finir avant 15 h.')
  ) as g(n, goals, focus) on g.n = a.n
  returning 1
), disp as (
  insert into public.agent_dispatch_log (agent_id, channels, note, started_at, created_by)
  select a.id,
    case a.pole when 'fo' then (case when a.n % 2 = 0 then array['Ringover','Wati'] else array['Ringover','Email'] end)
                when 'bo' then (case when a.n % 2 = 0 then array['Supplier emails'] else array['Supplier emails','Pre-reconfirmation'] end)
                else array['Ringover','Pre-reconfirmation'] end,
    null, ((d.day + (a.s_start + 3) * interval '1 minute') at time zone 'Indian/Antananarivo'), a.id
  from a cross join d
  where d.day >= (now() at time zone 'Indian/Antananarivo')::date - 2
    and ((d.day + (a.s_start + 3) * interval '1 minute') at time zone 'Indian/Antananarivo') < now()
    and not (d.is_today and a.n = 4)
  union all
  -- Renfort pause déjeuner aujourd’hui pour 2 agents FO.
  select a.id, array['Ringover','Break coverage'], 'Couverture pause déjeuner',
    (((now() at time zone 'Indian/Antananarivo')::date + interval '12 hour') at time zone 'Indian/Antananarivo'), a.id
  from a where a.pole = 'fo' and a.n in (1, 3)
    and ((((now() at time zone 'Indian/Antananarivo')::date + interval '12 hour') at time zone 'Indian/Antananarivo')) < now()
  returning 1
), missed as (
  -- Appels manqués FO sur 2 semaines.
  insert into public.missed_calls (call_date, call_time, agent_id, agent_name, cause, callback, callback_by, callback_time, call_ref, notes, created_by, source)
  select d.day, make_time(9 + floor(random() * 7)::int, floor(random() * 60)::int, 0), a.id, a.name,
    (array['En communication','Surcharge CRISP','Pause déjeuner','Problème technique','Snooze non activé','Appel trop court','Réunion'])[1 + floor(random() * 7)::int],
    c.cb, case when c.cb in ('5','10','10+') then a.id end,
    case when c.cb in ('5','10','10+') then make_time(16, floor(random() * 50)::int, 0) end,
    '+33 6 ' || lpad(floor(random() * 99)::int::text, 2, '0') || ' ' || lpad(floor(random() * 99)::int::text, 2, '0') || ' ' || lpad(floor(random() * 99)::int::text, 2, '0'),
    null, a.id, 'app'
  from a cross join d
  cross join lateral (select (array['5','5','10','10+','none','pending'])[1 + floor(random() * 6)::int] as cb, d.day as _d) c
  where a.pole = 'fo' and d.day >= (now() at time zone 'Indian/Antananarivo')::date - 13 and not d.is_today and random() < 0.35
  returning 1
)
select (select count(*) from logins) logins, (select count(*) from logouts) logouts, (select count(*) from stats) stats,
  (select count(*) from goals) goals, (select count(*) from disp) disp, (select count(*) from missed) missed;

-- ── Étape 3 : tickets agents, écoutes, fiches 1:1, notes de coaching ─────────────────────────
with a as (
  select p.id, p.name, p.pole,
    array_position(array['Mialy R.','Toky A.','Fanja H.','Hasina M.','Lova T.','Nirina S.','Tiana V.','Rado F.','Voahirana K.','Sitraka B.','Ony L.'], p.name) as n,
    (array[88, 79, 84, 71, 91, 82, 76, 86, 90, 68, 85])[array_position(array['Mialy R.','Toky A.','Fanja H.','Hasina M.','Lova T.','Nirina S.','Tiana V.','Rado F.','Voahirana K.','Sitraka B.','Ony L.'], p.name)] as qual
  from public.profiles p where p.email like '%@demo-taskin.invalid' and p.role = 'agent'
), sup as (select id from public.profiles where email = 'sarah.sup@demo-taskin.invalid'),
-- Tickets : tous les statuts, un ticket suivi par un 2e agent, échanges horodatés.
t(n, follower, ref, title, what, need, difficulty, object, priority, status, days_ago, comment_mgr, comment_agent) as (values
  (1, 3, 'OSC-104890', 'Vol annulé, client bloqué à CDG', 'Vol AF934 annulé, la compagnie ne propose rien avant demain.', 'Validation d’une nuit d’hôtel à nos frais.', 'situational', 'call', 'high', 'en_cours', 0.1, 'Hôtel validé jusqu’à 120 €, envoie le voucher.', 'Même cas pour mon client du dossier 64512.'),
  (6, null, 'OSC-104512', 'Fournisseur transfert injoignable', 'Le DMC ne répond plus depuis 2 jours, transfert prévu demain.', 'Contact de secours du DMC.', 'situational', 'ticket', 'medium', 'nouveau', 0.3, null, null),
  (2, null, '', 'Procédure remboursement partiel floue', 'Deux procédures différentes dans la doc pour un remboursement partiel.', 'Savoir laquelle appliquer.', 'process', 'situation', 'low', 'attente_client', 2, 'Je vérifie avec le management, réponse demain.', null),
  (9, null, 'BK-77821', 'Hôtel ne retrouve pas la réservation', 'À la reconfirmation, l’hôtel ne trouve pas la résa.', 'Confirmation écrite du fournisseur.', 'situational', 'call', 'medium', 'resolu', 4, 'Résa retrouvée sous le nom du 2e voyageur.', null),
  (7, 8, 'OSC-103377', 'Escalade manager sans réponse', 'Escalade envoyée lundi pour un geste commercial, sans retour.', 'Décision sur le geste commercial.', 'unhandled_escalation', 'ticket', 'high', 'en_cours', 1, 'Pris en charge, décision cet après-midi.', 'Le client a rappelé deux fois.'),
  (3, null, 'CHAT-55210', 'Passation de dossier incomplète', 'Le dossier repris de l’équipe du soir n’a pas d’historique.', 'Règle de passation à rappeler.', 'collaboration', 'message', 'low', 'resolu', 7, 'Rappel fait au brief du matin.', null),
  (5, null, 'OSC-105002', 'Bagage perdu, compagnie ne répond pas', 'PIR fait, compagnie injoignable.', 'Escalade compagnie.', 'situational', 'message', 'medium', 'nouveau', 0.05, null, null)
), cases as (
  insert into public.complex_cases (agent_id, owner_id, status, priority, title, description, data, created_at)
  select a.id, a.id, t.status, t.priority,
    case when t.ref <> '' then t.ref || ' — ' || t.title else t.title end,
    'Ce qui se passe : ' || t.what || E'\nBesoin : ' || t.need,
    jsonb_strip_nulls(jsonb_build_object('demo', true,
      'title', case when t.ref <> '' then t.ref || ' — ' || t.title else t.title end,
      'description', 'Ce qui se passe : ' || t.what || E'\nBesoin : ' || t.need,
      'agentId', a.id, 'reportedBy', a.id, 'createdBy', a.id,
      'channel', case t.object when 'call' then 'inbound' when 'message' then 'chat' else 'ticket' end,
      'difficulty', t.difficulty, 'object', t.object, 'ref', nullif(t.ref, ''),
      'refKey', nullif(upper(regexp_replace(t.ref, '[^A-Za-z0-9-]', '', 'g')), ''),
      'refs', jsonb_build_object('ticket', t.ref, 'booking', '', 'link', ''),
      'report', jsonb_build_object('what', t.what, 'tried', '', 'need', t.need),
      'urgency', t.priority, 'priority', t.priority, 'status', t.status, 'screenshots', '[]'::jsonb,
      'createdAt', (extract(epoch from now() - t.days_ago * interval '1 day') * 1000)::bigint,
      'resolvedAt', case when t.status = 'resolu' then (extract(epoch from now() - (t.days_ago - 0.5) * interval '1 day') * 1000)::bigint end,
      'followers', case when t.follower is null then '[]'::jsonb else jsonb_build_array((select id::text from a where n = t.follower)) end,
      'updates', (
        select coalesce(jsonb_agg(u order by (u->>'at')::bigint), '[]'::jsonb) from (
          select jsonb_build_object('by', (select id from sup), 'at', (extract(epoch from now() - (t.days_ago * 0.6) * interval '1 day') * 1000)::bigint, 'note', t.comment_mgr, 'kind', 'manager') u where t.comment_mgr is not null
          union all
          select jsonb_build_object('by', coalesce((select id from a where n = t.follower), a.id), 'at', (extract(epoch from now() - (t.days_ago * 0.3) * interval '1 day') * 1000)::bigint, 'note', t.comment_agent, 'kind', 'agent') where t.comment_agent is not null
        ) s)
    )),
    now() - t.days_ago * interval '1 day'
  from t join a on a.n = t.n
  returning 1
), r as (
  -- Écoutes : 2 à 3 par agent ; la plus récente est partagée avec un retour, parfois déjà lue.
  select a.id, a.pole, k,
    (array[2, 9, 16])[k] + (a.n % 3) as days_ago,
    least(100, greatest(45, a.qual + (k - 2) * -3 + floor(random() * 9)::int - 4)) as score
  from a cross join generate_series(1, 3) k where k < 3 or a.n % 2 = 0
), reviews as (
  insert into public.coaching_reviews (agent_id, reviewer_id, channel, review_date, contact_date, communication_number, scores, data)
  select r.id, (select id from sup), ch.channel, now() - r.days_ago * interval '1 day', now() - (r.days_ago + 1) * interval '1 day',
    'COM-' || (880000 + floor(random() * 9999))::int, '{}'::jsonb,
    jsonb_strip_nulls(jsonb_build_object('demo', true, 'agentId', r.id, 'reviewerId', (select id from sup), 'channel', ch.channel,
      'date', (extract(epoch from now() - r.days_ago * interval '1 day') * 1000)::bigint,
      'contactReason', ch.reason, 'gridValues', '{}'::jsonb, 'totalScorePct', r.score, 'rawScorePct', r.score, 'siTriggered', r.score < 60,
      'sharedWithAgent', r.k = 1,
      'agentFeedback', case when r.k = 1 then case when r.score >= 85 then 'Très bon appel : reformulation claire et clôture propre. Continue comme ça.'
                                                when r.score >= 75 then 'Bon échange. Pense à annoncer les délais avant de mettre en attente.'
                                                else 'Accueil correct, mais la solution n’a pas été vérifiée avec le client. On en parle au 1:1.' end end,
      'agentAckAt', case when r.k = 1 and r.score >= 80 then (extract(epoch from now() - (r.days_ago - 0.5) * interval '1 day') * 1000)::bigint end,
      'createdAt', (extract(epoch from now() - r.days_ago * interval '1 day') * 1000)::bigint))
  from r cross join lateral (
    select case r.pole when 'fo' then (array['inbound','chat','inbound'])[r.k] when 'bo' then 'email' else 'outbound' end as channel,
           case r.pole when 'fo' then (array['Changement de vol','Question bagages','Annulation hôtel'])[r.k]
                       when 'bo' then (array['Remboursement','Suivi transfert','Réclamation fournisseur'])[r.k]
                       else (array['Reconfirmation hôtel','Reconfirmation vol','Welcome call'])[r.k] end as reason
  ) ch
  returning 1
), s(n, objs, notes, days_ago) as (values
  (4, '[{"text":"Ramener la DMT chat sous 6 min","status":"en cours"},{"text":"Annoncer les délais avant la mise en attente","status":"non atteint"}]'::jsonb, 'Bonne volonté, manque de méthode sur les dossiers longs.', 5),
  (10, '[{"text":"Vérifier la solution avec le client avant de raccrocher","status":"en cours"}]'::jsonb, 'Rythme rapide mais clôtures trop expéditives.', 3),
  (2, '[{"text":"Utiliser les modèles de réponse e-mail","status":"atteint"},{"text":"Historiser chaque échange","status":"en cours"}]'::jsonb, 'Progrès nets sur l’écrit.', 8),
  (7, '[{"text":"Relancer les fournisseurs sous 24 h","status":"en cours"}]'::jsonb, 'Dossiers solides, relances à systématiser.', 6)
), sheets as (
  insert into public.coaching_sheets (agent_id, supervisor_id, sheet_date, objectives, notes, next_review_date, data)
  select a.id, (select id from sup), now() - s.days_ago * interval '1 day', s.objs, s.notes, now() + (14 - s.days_ago) * interval '1 day',
    jsonb_build_object('demo', true, 'agentId', a.id, 'supervisorId', (select id from sup),
      'date', (extract(epoch from now() - s.days_ago * interval '1 day') * 1000)::bigint, 'objectifs', s.objs, 'notes', s.notes,
      'nextReviewDate', (extract(epoch from now() + (14 - s.days_ago) * interval '1 day') * 1000)::bigint,
      'createdAt', (extract(epoch from now() - s.days_ago * interval '1 day') * 1000)::bigint)
  from s join a on a.n = s.n
  returning 1
), notes as (
  insert into public.coaching_notes (agent_id, author_id, source, body, status, created_at)
  select a.id, (select id from sup), x.source, x.body, x.status, now() - x.days_ago * interval '1 day'
  from (values
    (4, 'review', 'Mise en attente sans annonce du délai : revoir le script au 1:1.', 'open', 2),
    (10, 'pilotage', 'Volume très élevé mais DMT outbound trop courte : vérifier la qualité des reconfirmations.', 'open', 1),
    (1, 'reporting', 'Meilleure semaine de l’équipe FO : la féliciter et proposer le rôle de référente.', 'open', 0.5),
    (6, 'pilotage', 'Beaucoup de tickets fournisseurs en attente > 48 h.', 'open', 3),
    (2, 'review', 'Bonne progression à l’écrit, objectif atteint.', 'done', 9)
  ) as x(n, source, body, status, days_ago)
  join a on a.n = x.n
  returning 1
)
select (select count(*) from cases) tickets, (select count(*) from reviews) ecoutes,
  (select count(*) from sheets) fiches, (select count(*) from notes) notes;
