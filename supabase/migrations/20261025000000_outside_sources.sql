-- Outside data sources (PubChem's per-source GHS records, later others) as a registry, so a
-- licence is decided once per source instead of per substance. Additive only.
--
-- substance_source_records.lines now holds the hazard statements exactly as the source lists
-- them ([{"hCode": "H225", "text": "..."}]); turning them into CLP categories is the engine's
-- job (resolveStatements), never the database's or the fetcher's.

create table public.outside_sources (
  source_id text primary key,
  name text not null,
  family text not null,
  license_note text,
  license_url text,
  data_license public.data_license not null default 'unverified',
  updated_at timestamptz not null default now()
);

alter table public.substance_source_records
  add column name text,
  add column category_texts text[] not null default '{}',
  add column not_classified boolean not null default false,
  add column snapshot jsonb;

alter table public.outside_sources enable row level security;

create policy outside_sources_select on public.outside_sources
  for select to authenticated using (true);
create policy outside_sources_update on public.outside_sources
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- A licence decision applies to every record of that source (records' own select policy reads
-- their data_license column).
create function public.sync_outside_source_license()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.data_license is distinct from old.data_license then
    update public.substance_source_records
       set data_license = new.data_license
     where source_id = new.source_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger outside_sources_license before update on public.outside_sources
  for each row execute function public.sync_outside_source_license();

-- When outside sources were last asked about this substance, so a lookup that found nothing is
-- not repeated on every keystroke.
alter table public.substances add column outside_checked_at timestamptz;
