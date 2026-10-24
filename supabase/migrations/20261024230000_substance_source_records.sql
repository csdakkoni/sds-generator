-- Classifications of a substance as reported by outside data sources (PubChem and others).
-- Global, pure substance data: nothing here says which firm uses what. Records never feed a
-- calculation by themselves; the app compares them (compareSources in the engine) and a
-- person confirms. `family` groups sources that share an origin, so they count as one vote.

create table public.substance_source_records (
  id uuid primary key default gen_random_uuid(),
  cas_number text not null,
  source_id text not null,
  family text not null,
  reference text not null,
  lines jsonb not null default '[]',
  data_license public.data_license not null default 'unverified',
  fetched_at timestamptz not null default now(),
  constraint substance_source_records_lines_is_array check (jsonb_typeof(lines) = 'array'),
  unique (cas_number, source_id)
);
create index substance_source_records_cas_idx on public.substance_source_records (cas_number);

alter table public.substance_source_records enable row level security;

-- Same licence rule as global profiles: sources whose licence is unverified stay visible to
-- the platform admin only until the licence is clarified.
create policy substance_source_records_select on public.substance_source_records
  for select to authenticated
  using (data_license <> 'unverified' or public.is_platform_admin());
create policy substance_source_records_write on public.substance_source_records
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
