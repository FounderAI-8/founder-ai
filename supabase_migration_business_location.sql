alter table founder_profiles
  add column if not exists business_description text,
  add column if not exists city text;
