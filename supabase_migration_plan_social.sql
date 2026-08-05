-- Migrazione: piano utente + tabella social_connections
-- Esegui nel Supabase SQL Editor: https://supabase.com/dashboard/project/nkzgisgrbipbnaogeryw/sql

alter table founder_profiles
  add column if not exists plan text default 'free' check (plan in ('free', 'pro'));

create table if not exists social_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  account_handle text,
  aggregator_account_id text,
  status text default 'pending' check (status in ('pending', 'connected', 'error', 'disconnected')),
  connected_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists social_connections_user_id_idx on social_connections(user_id);
