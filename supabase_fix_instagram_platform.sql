-- Fix: corregge la riga social_connections scritta con platform='unknown'
-- durante il primo test OAuth Instagram (il param reale si chiama 'connected', non 'platform').
-- Esegui nel Supabase SQL Editor: https://supabase.com/dashboard/project/nkzgisgrbipbnaogeryw/sql

update social_connections
set platform = 'instagram'
where user_id = '40b68e62-b4ac-45c4-802d-9180bab0a2ea'
  and platform = 'unknown';
