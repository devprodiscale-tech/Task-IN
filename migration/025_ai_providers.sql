-- Task’in — 025 : API IA multiples (Paramètres › API IA) et journal d’utilisation
-- Les clés ne quittent jamais le serveur : ces tables ont la sécurité RLS activée SANS aucune règle
-- d’accès, donc seuls les endpoints Vercel (clé service) les lisent et les écrivent.
-- taskin_ai_providers : une ligne par API branchée (fournisseur, modèle, clé, comportement, quota).
--   behavior = { tasks: [...], modules: [...], when: 'always' | 'business_hours' | 'off_hours' }, rank = ordre
--   d’essai (la suivante prend le relais si une API échoue).
-- taskin_ai_usage : un appel = une ligne (succès, durée, erreur) → donut d’état dans les Paramètres.

create table if not exists public.taskin_ai_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  provider text not null check (provider in ('gemini', 'anthropic', 'openai')),
  model text not null check (char_length(model) between 1 and 120),
  base_url text check (base_url is null or base_url ~ '^https://'),
  api_key text,
  key_hint text,
  enabled boolean not null default true,
  rank integer not null default 100,
  daily_quota integer check (daily_quota is null or daily_quota between 1 and 100000),
  behavior jsonb not null default '{}'::jsonb check (jsonb_typeof(behavior) = 'object'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.taskin_ai_providers enable row level security;
revoke all on public.taskin_ai_providers from anon, authenticated;

create table if not exists public.taskin_ai_usage (
  id bigint generated always as identity primary key,
  provider_id uuid references public.taskin_ai_providers(id) on delete set null,
  provider text not null,
  model text,
  task text,
  module text,
  ok boolean not null,
  latency_ms integer,
  error text check (char_length(error) <= 500),
  user_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists taskin_ai_usage_created_idx on public.taskin_ai_usage (created_at desc);
alter table public.taskin_ai_usage enable row level security;
revoke all on public.taskin_ai_usage from anon, authenticated;
