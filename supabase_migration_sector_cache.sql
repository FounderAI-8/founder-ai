create table if not exists sector_content_cache (
  id uuid primary key default gen_random_uuid(),
  sector text not null,
  kind text not null check (kind in ('dates', 'trends')),
  items jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  unique(sector, kind)
);

-- RLS: la tabella è cache condivisa per settore, non dati personali.
-- Lettura consentita a qualsiasi utente autenticato (via API route).
-- Scrittura solo da service role (bypassa RLS) — nessuna policy INSERT/UPDATE.
alter table sector_content_cache enable row level security;

create policy "Authenticated users can read sector cache"
  on sector_content_cache
  for select
  to authenticated
  using (true);
