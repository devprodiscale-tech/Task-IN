-- Task’in / Supabase
-- Migration 003 : registre de provenance et gestion des comptes historiques
-- Cette migration ne supprime aucun compte et n’insère aucune donnée métier.

create table if not exists public.migration_accounts (
  id uuid primary key default gen_random_uuid(),
  legacy_provider text not null default 'firebase',
  legacy_account_id text not null,
  display_name text not null default '',
  email text not null default '',
  role public.taskin_role not null default 'agent',
  status text not null default 'pending_review' check (status in ('pending_review','mapped','archived','deletion_requested','deleted')),
  source_payload jsonb not null default '{}'::jsonb,
  linked_profile_id uuid references public.profiles(id) on delete set null,
  has_time_entries boolean not null default false,
  time_entries_count integer not null default 0 check (time_entries_count >= 0),
  deletion_requested_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (legacy_provider, legacy_account_id)
);

create index if not exists migration_accounts_status_idx
  on public.migration_accounts(status);
create index if not exists migration_accounts_email_idx
  on public.migration_accounts(email);

alter table public.migration_accounts enable row level security;

create policy migration_accounts_read_admin
  on public.migration_accounts for select to authenticated
  using (public.is_taskin_admin());
create policy migration_accounts_write_admin
  on public.migration_accounts for all to authenticated
  using (public.is_taskin_admin())
  with check (public.is_taskin_admin());

create trigger migration_accounts_set_updated_at
  before update on public.migration_accounts
  for each row execute function public.set_updated_at();

comment on table public.migration_accounts is
  'Registre de provenance des comptes historiques. La suppression est volontairement manuelle et non automatique.';
comment on column public.migration_accounts.status is
  'pending_review=à vérifier, mapped=rattaché, archived=conservé sans connexion, deletion_requested=demande Admin, deleted=suppression confirmée.';
