-- Task’in — jeu de démonstration v2 (vidéo de présentation) · 1/3 : comptes fictifs
-- 11 agents (5 FO, 3 BO, 3 Reconf) + 1 superviseur, e-mails en @demo-taskin.invalid (domaine
-- réservé : aucun e-mail n’est jamais envoyé). Mot de passe commun : TaskinDemo#2026
-- Tout s’efface avec migration/demo/demo_v2_cleanup.sql (comptes + toutes leurs données).
-- Données : migration/demo/demo_v2_2_data.sql (rejouable).
-- Les vrais comptes (admin, agents réels) ne sont jamais touchés.

create extension if not exists pgcrypto;

with demo(email, name, initials, role, pole, color) as (values
  ('mialy.r@demo-taskin.invalid',     'Mialy R.',     'MR', 'agent', 'fo',     '#2563EB'),
  ('toky.a@demo-taskin.invalid',      'Toky A.',      'TA', 'agent', 'fo',     '#0EA5E9'),
  ('fanja.h@demo-taskin.invalid',     'Fanja H.',     'FH', 'agent', 'fo',     '#7C3AED'),
  ('hasina.m@demo-taskin.invalid',    'Hasina M.',    'HM', 'agent', 'fo',     '#DB2777'),
  ('lova.t@demo-taskin.invalid',      'Lova T.',      'LT', 'agent', 'fo',     '#0891B2'),
  ('nirina.s@demo-taskin.invalid',    'Nirina S.',    'NS', 'agent', 'bo',     '#D97706'),
  ('tiana.v@demo-taskin.invalid',     'Tiana V.',     'TV', 'agent', 'bo',     '#16A34A'),
  ('rado.f@demo-taskin.invalid',      'Rado F.',      'RF', 'agent', 'bo',     '#9333EA'),
  ('voahirana.k@demo-taskin.invalid', 'Voahirana K.', 'VK', 'agent', 'reconf', '#EA580C'),
  ('sitraka.b@demo-taskin.invalid',   'Sitraka B.',   'SB', 'agent', 'reconf', '#0D9488'),
  ('ony.l@demo-taskin.invalid',       'Ony L.',       'OL', 'agent', 'reconf', '#4F46E5'),
  ('sarah.sup@demo-taskin.invalid',   'Sarah M. (démo)', 'SM', 'supervisor', null, '#0EA5E9')
), created as (
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', d.email,
    extensions.crypt('TaskinDemo#2026', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"],"demo":true}'::jsonb,
    jsonb_build_object('name', d.name, 'initials', d.initials, 'demo', true), now(), now(), '', '', '', ''
  from demo d
  where not exists (select 1 from auth.users u where u.email = d.email)
  returning id, email
)
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), c.id, c.id::text, 'email', jsonb_build_object('sub', c.id::text, 'email', c.email, 'email_verified', true), now(), now(), now()
from created c;

-- Rôle, pôle, couleur (le profil est créé par le déclencheur d’inscription).
update public.profiles p
set role = d.role::public.taskin_role, pole = d.pole, color = d.color, initials = d.initials, name = d.name
from (values
  ('mialy.r@demo-taskin.invalid','Mialy R.','MR','agent','fo','#2563EB'),('toky.a@demo-taskin.invalid','Toky A.','TA','agent','fo','#0EA5E9'),
  ('fanja.h@demo-taskin.invalid','Fanja H.','FH','agent','fo','#7C3AED'),('hasina.m@demo-taskin.invalid','Hasina M.','HM','agent','fo','#DB2777'),
  ('lova.t@demo-taskin.invalid','Lova T.','LT','agent','fo','#0891B2'),('nirina.s@demo-taskin.invalid','Nirina S.','NS','agent','bo','#D97706'),
  ('tiana.v@demo-taskin.invalid','Tiana V.','TV','agent','bo','#16A34A'),('rado.f@demo-taskin.invalid','Rado F.','RF','agent','bo','#9333EA'),
  ('voahirana.k@demo-taskin.invalid','Voahirana K.','VK','agent','reconf','#EA580C'),('sitraka.b@demo-taskin.invalid','Sitraka B.','SB','agent','reconf','#0D9488'),
  ('ony.l@demo-taskin.invalid','Ony L.','OL','agent','reconf','#4F46E5'),('sarah.sup@demo-taskin.invalid','Sarah M. (démo)','SM','supervisor',null,'#0EA5E9')
) as d(email, name, initials, role, pole, color)
where p.email = d.email;

-- Shifts des agents de démo (réglage account_shifts, fusionné avec l’existant).
insert into public.settings (key, value)
values ('account_shifts', '{}'::jsonb)
on conflict (key) do nothing;
update public.settings s
set value = coalesce(s.value, '{}'::jsonb) || (
  select jsonb_object_agg(p.id::text, case p.pole when 'fo' then (case when p.name in ('Lova T.','Hasina M.') then '13:00-22:00' else '07:00-16:00' end) when 'bo' then '08:00-17:00' else '09:00-18:00' end)
  from public.profiles p where p.email like '%@demo-taskin.invalid' and p.role = 'agent')
where s.key = 'account_shifts';

select p.role, p.pole, count(*) from public.profiles p where p.email like '%@demo-taskin.invalid' group by 1, 2 order by 1, 2;
