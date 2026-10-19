-- Step 1 of the substance-library redesign (see CLAUDE.md, "Madde kütüphanesi ve kaynak katmanları").
-- Additive only: nothing is dropped or rewritten. A substance keeps one identity row; its
-- classifications now hang off one or more PROFILES (1:N), each with a source, a licence, a
-- verification state and the conditions under which it applies.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.profile_source_type as enum (
  'harmonised', 'industry_guidance', 'expert_rule', 'shared_pool', 'supplier_sds', 'research_note'
);
create type public.classification_system as enum ('clp', 'un_ghs');
create type public.verification_status as enum ('pending', 'verified', 'rejected', 'superseded');
create type public.data_license as enum ('official_public', 'unverified', 'firm_owned', 'kdu_authored');
create type public.regulation_status as enum ('draft', 'active', 'superseded');
create type public.change_event_status as enum ('new', 'reviewing', 'dismissed', 'applied');
create type public.review_item_type as enum (
  'profile_conflict', 'supplier_sds_match', 'profile_draft', 'regulation_change', 'draft_revision', 'data_gap'
);
create type public.review_item_status as enum ('open', 'resolved', 'dismissed');

-- ---------------------------------------------------------------------------
-- Regulation versions (rule 10 and "Mevzuat güncelleme süreci"): old rows are closed with
-- effective_to, never deleted.
-- ---------------------------------------------------------------------------

create table public.regulation_versions (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null default 'TR',
  regulation text not null,
  title text not null,
  source_document text not null,
  gazette_date date,
  gazette_number text,
  effective_from date,
  effective_to date,
  transition_until date,
  status public.regulation_status not null default 'draft',
  created_at timestamptz not null default now(),
  constraint regulation_versions_validity check (effective_to is null or effective_from is null or effective_to >= effective_from)
);

-- ---------------------------------------------------------------------------
-- Classification profiles
-- ---------------------------------------------------------------------------

create table public.classification_profiles (
  id uuid primary key default gen_random_uuid(),
  substance_id uuid not null references public.substances (id) on delete cascade,
  -- null = global/shared data; set = that firm's own profile.
  organization_id uuid references public.organizations (id) on delete cascade,
  source_type public.profile_source_type not null,
  classification_system public.classification_system not null default 'clp',
  jurisdiction text not null default 'TR',
  regulation text not null,
  regulation_version_id uuid references public.regulation_versions (id),
  source_reference text not null,
  source_page integer check (source_page > 0),
  -- Raw source values kept verbatim (e.g. the Annex 6 row text); never parsed by regex into codes.
  source_snapshot jsonb,
  data_license public.data_license not null default 'unverified',
  effective_from date,
  effective_to date,
  verification_status public.verification_status not null default 'pending',
  verified_by uuid references auth.users (id),
  verified_at timestamptz,
  -- Selection fields: which commercial grade of the substance this profile describes.
  chemical_name text,
  surfactant_family text,
  carbon_chain_min integer,
  carbon_chain_max integer,
  eo_po_min numeric,
  eo_po_max numeric,
  active_min numeric check (active_min between 0 and 100),
  active_max numeric check (active_max between 0 and 100),
  -- Free text for people and a structured form for the engine, e.g. impurity limits:
  -- [{"cas":"556-67-2","op":"<","value":0.1,"unit":"%"}]
  condition_text text,
  conditions jsonb not null default '[]',
  rationale text,
  warnings text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_validity check (effective_to is null or effective_from is null or effective_to >= effective_from),
  constraint profiles_ranges check (
    (carbon_chain_min is null or carbon_chain_max is null or carbon_chain_max >= carbon_chain_min)
    and (eo_po_min is null or eo_po_max is null or eo_po_max >= eo_po_min)
    and (active_min is null or active_max is null or active_max >= active_min)
  ),
  -- Who may own which kind of profile.
  constraint profiles_scope check (
    (source_type in ('harmonised', 'industry_guidance', 'shared_pool') and organization_id is null)
    or (source_type = 'supplier_sds' and organization_id is not null)
    or source_type in ('expert_rule', 'research_note')
  ),
  -- Annex 6 is bound to a regulation version.
  constraint profiles_harmonised_version check (source_type <> 'harmonised' or regulation_version_id is not null),
  -- An expert rule must say when it applies and why.
  constraint profiles_expert_rule_reason check (
    source_type <> 'expert_rule' or (length(trim(coalesce(condition_text, ''))) > 0 and length(trim(coalesce(rationale, ''))) > 0)
  ),
  -- Research notes never reach a calculation: they cannot be verified.
  constraint profiles_research_note_inert check (
    source_type <> 'research_note' or verification_status in ('pending', 'rejected')
  ),
  constraint profiles_verified_by_person check (
    verification_status <> 'verified' or (verified_by is not null and verified_at is not null)
  )
);
create index classification_profiles_substance_idx on public.classification_profiles (substance_id);
create index classification_profiles_org_idx on public.classification_profiles (organization_id);
-- One current harmonised profile per substance.
create unique index classification_profiles_one_harmonised
  on public.classification_profiles (substance_id)
  where source_type = 'harmonised' and effective_to is null;

-- Classification lines (existing table) now belong to a profile.
alter table public.substance_classifications
  add column profile_id uuid references public.classification_profiles (id) on delete cascade;
create index substance_classifications_profile_idx on public.substance_classifications (profile_id);

-- ---------------------------------------------------------------------------
-- Regulatory monitoring (used in step 5)
-- ---------------------------------------------------------------------------

create table public.regulatory_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'gazette_daily_index',
  url_template text not null,
  keywords text[] not null default '{}',
  enabled boolean not null default true,
  last_checked_at timestamptz,
  last_status text,
  created_at timestamptz not null default now()
);

create table public.regulatory_change_events (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.regulatory_sources (id) on delete cascade,
  regulation_version_id uuid references public.regulation_versions (id),
  gazette_date date not null,
  title text not null,
  url text not null,
  matched_keywords text[] not null default '{}',
  excerpt text,
  status public.change_event_status not null default 'new',
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  unique (source_id, url)
);
create index regulatory_change_events_status_idx on public.regulatory_change_events (status, gazette_date desc);

-- ---------------------------------------------------------------------------
-- KDU review queue: everything waiting for a KDU decision in one list.
-- ---------------------------------------------------------------------------

create table public.kdu_review_queue (
  id uuid primary key default gen_random_uuid(),
  -- null = platform level (shared data, regulation changes).
  organization_id uuid references public.organizations (id) on delete cascade,
  item_type public.review_item_type not null,
  status public.review_item_status not null default 'open',
  title text not null,
  detail jsonb not null default '{}',
  substance_id uuid references public.substances (id) on delete cascade,
  profile_id uuid references public.classification_profiles (id) on delete cascade,
  raw_material_id uuid references public.raw_materials (id) on delete cascade,
  product_id uuid references public.products (id) on delete cascade,
  change_event_id uuid references public.regulatory_change_events (id) on delete cascade,
  created_at timestamptz not null default now(),
  resolved_by uuid references auth.users (id),
  resolved_at timestamptz,
  resolution_note text,
  constraint review_queue_resolved check (status = 'open' or (resolved_by is not null and resolved_at is not null))
);
create index kdu_review_queue_open_idx on public.kdu_review_queue (organization_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------

create trigger classification_profiles_touch before update on public.classification_profiles
  for each row execute function public.touch_updated_at();

-- Verification is recorded by the signed-in person and needs the right role (like check_approval).
create function public.check_profile_verification()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.verified_by is null or auth.uid() is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.verified_by is not distinct from new.verified_by then
    return new;
  end if;
  if new.verified_by <> auth.uid() then
    raise exception 'verification must be recorded as the signed-in user';
  end if;
  if new.organization_id is null then
    if not public.is_platform_admin() then
      raise exception 'only a platform admin may verify global data';
    end if;
  elsif not public.has_org_role(new.organization_id, array['kdu']::public.member_role[]) then
    raise exception 'only a KDU may verify';
  end if;
  return new;
end;
$$;
create trigger classification_profiles_verification before insert or update on public.classification_profiles
  for each row execute function public.check_profile_verification();

-- A line must live in the same scope as its profile.
create function public.check_line_profile_scope()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  p public.classification_profiles;
  expected text;
begin
  if new.profile_id is null then
    return new;
  end if;
  select * into p from public.classification_profiles where id = new.profile_id;
  if p.id is null or p.substance_id <> new.substance_id
     or p.organization_id is distinct from new.organization_id then
    raise exception 'classification line does not match its profile (substance or firm)';
  end if;
  -- Research notes are reading material only; they never carry calculable lines.
  if p.source_type = 'research_note' then
    raise exception 'a research note cannot carry classification lines';
  end if;
  -- The profile is the source of truth. The older per-line column stays: sea_annex6 and
  -- supplier_sds map one to one, every other layer is stored as 'expert' (its scope rule is open).
  expected := case p.source_type
    when 'harmonised' then 'sea_annex6'
    when 'supplier_sds' then 'supplier_sds'
    else 'expert' end;
  if new.source_type::text <> expected then
    raise exception 'line source_type % does not match profile source_type %', new.source_type, p.source_type;
  end if;
  return new;
end;
$$;
create trigger substance_classifications_profile_scope before insert or update on public.substance_classifications
  for each row execute function public.check_line_profile_scope();

create trigger classification_profiles_audit after insert or update or delete on public.classification_profiles
  for each row execute function public.write_audit_log();
create trigger kdu_review_queue_audit after insert or update or delete on public.kdu_review_queue
  for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.regulation_versions enable row level security;
alter table public.classification_profiles enable row level security;
alter table public.regulatory_sources enable row level security;
alter table public.regulatory_change_events enable row level security;
alter table public.kdu_review_queue enable row level security;

create policy regulation_versions_select on public.regulation_versions
  for select to authenticated using (true);
create policy regulation_versions_write on public.regulation_versions
  for insert to authenticated with check (public.is_platform_admin());
create policy regulation_versions_update on public.regulation_versions
  for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
-- No delete policy: versions are closed with effective_to, never removed.

-- Global profiles are readable by everyone, except sources whose licence is unverified:
-- those stay visible to the platform admin only until the licence is clarified.
create policy classification_profiles_select on public.classification_profiles
  for select to authenticated
  using (
    (organization_id is null and (data_license <> 'unverified' or public.is_platform_admin()))
    or (organization_id is not null and public.is_org_member(organization_id))
  );
create policy classification_profiles_insert on public.classification_profiles
  for insert to authenticated
  with check (
    (organization_id is null and public.is_platform_admin())
    or (organization_id is not null and public.can_edit_org(organization_id))
  );
create policy classification_profiles_update on public.classification_profiles
  for update to authenticated
  using (
    (organization_id is null and public.is_platform_admin())
    or (organization_id is not null and public.can_edit_org(organization_id))
  )
  with check (
    (organization_id is null and public.is_platform_admin())
    or (organization_id is not null and public.can_edit_org(organization_id))
  );
create policy classification_profiles_delete on public.classification_profiles
  for delete to authenticated
  using (
    (organization_id is null and public.is_platform_admin())
    or (organization_id is not null and public.has_org_role(organization_id, array['owner', 'editor']::public.member_role[]))
  );

-- Lines inherit their profile's visibility (the subquery runs under the profile policy above).
create policy substance_classifications_profile_visible on public.substance_classifications
  as restrictive for select to authenticated
  using (
    profile_id is null
    or exists (select 1 from public.classification_profiles p where p.id = profile_id)
  );

create policy regulatory_sources_admin on public.regulatory_sources
  for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy regulatory_change_events_admin on public.regulatory_change_events
  for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Only KDU members see their firm's queue (UX principle 2); platform items go to the platform admin.
create policy kdu_review_queue_select on public.kdu_review_queue
  for select to authenticated
  using (
    (organization_id is null and public.is_platform_admin())
    or (organization_id is not null and public.has_org_role(organization_id, array['kdu']::public.member_role[]))
  );
create policy kdu_review_queue_insert on public.kdu_review_queue
  for insert to authenticated
  with check (
    (organization_id is null and public.is_platform_admin())
    or (organization_id is not null and public.can_edit_org(organization_id))
  );
create policy kdu_review_queue_update on public.kdu_review_queue
  for update to authenticated
  using (
    (organization_id is null and public.is_platform_admin())
    or (organization_id is not null and public.has_org_role(organization_id, array['kdu']::public.member_role[]))
  )
  with check (
    (organization_id is null and public.is_platform_admin())
    or (organization_id is not null and public.has_org_role(organization_id, array['kdu']::public.member_role[]))
  );
