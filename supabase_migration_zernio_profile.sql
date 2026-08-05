-- Migrazione: campo zernio_profile_id su founder_profiles + vincolo univoco su social_connections
-- Esegui nel Supabase SQL Editor: https://supabase.com/dashboard/project/nkzgisgrbipbnaogeryw/sql

alter table founder_profiles
  add column if not exists zernio_profile_id text;

-- Necessario per l'upsert nel callback OAuth: un solo record connesso per (utente, piattaforma)
alter table social_connections
  drop constraint if exists social_connections_user_platform_unique;

alter table social_connections
  add constraint social_connections_user_platform_unique unique (user_id, platform);
