-- Migrazione: aggiungi colonna track a founder_profiles
-- Esegui nel Supabase SQL Editor: https://supabase.com/dashboard/project/nkzgisgrbipbnaogeryw/sql
-- I profili esistenti restano NULL (retrocompatibile: match_sloan_kb con filter_track=null non filtra)

alter table founder_profiles
  add column if not exists track text check (track in ('startup', 'smb'));
