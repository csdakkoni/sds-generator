-- Core schema and row level security (step 3).
--
-- Tenancy: every firm-owned row carries organization_id; access is decided by RLS from
-- organization_members, never by client-side filters (CLAUDE.md, "Çok firmalı yapı").
-- Global tables (substances, global substance_classifications) hold pure substance data
-- only: which firm uses which raw material never lands there.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.member_role as enum ('owner', 'editor', 'kdu', 'viewer');
create type public.classification_source as enum ('sea_annex6', 'supplier_sds', 'expert');
create type public.review_status as enum ('pending_review', 'approved', 'rejected');
create type public.sds_language as enum ('tr', 'en');
create type public.sds_status as enum ('draft', 'in_review', 'published', 'withdrawn');

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

-- Platform operators who may write the global substance pool (e.g. SEA Annex 6 import).
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Helpers used by the policies. SECURITY DEFINER so they can read the membership tables
-- without recursing into those tables' own policies.
create function public.is_org_member(org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid()
  );
$$;

create function public.has_org_role(org uuid, roles public.member_role[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid() and m.role = any (roles)
  );
$$;

create function public.can_edit_org(org uuid)
returns boolean
language sql stable set search_path = ''
as $$
  select public.has_org_role(org, array['owner', 'editor', 'kdu']::public.member_role[]);
$$;

create function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.platform_admins a where a.user_id = auth.uid());
$$;

-- Creating a firm makes the caller its owner in one step.
create function public.create_organization(org_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.organizations (name) values (org_name) returning id into new_id;
  insert into public.organization_members (organization_id, user_id, role)
  values (new_id, auth.uid(), 'owner');
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Global substance pool
-- ---------------------------------------------------------------------------

create table public.substances (
  id uuid primary key default gen_random_uuid(),
  cas_number text unique,
  ec_number text,
  name text not null,
  synonyms text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One classification line per row, with its source. SEA Annex 6 rows are global; rows
-- read from a supplier SDS or set by a firm's expert belong to that firm.
create table public.substance_classifications (
  id uuid primary key default gen_random_uuid(),
  substance_id uuid not null references public.substances (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  hazard_class text not null,
  category text not null,
  h_code text,
  specific_concentration_limits jsonb not null default '[]',
  m_factor_acute numeric check (m_factor_acute > 0),
  m_factor_chronic numeric check (m_factor_chronic > 0),
  ate jsonb,
  source_type public.classification_source not null,
  source_reference text not null,
  valid_from date,
  valid_to date,
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint substance_classifications_scope check (
    (source_type = 'sea_annex6' and organization_id is null)
    or (source_type = 'supplier_sds' and organization_id is not null)
    or source_type = 'expert'
  ),
  constraint substance_classifications_validity check (valid_to is null or valid_from is null or valid_to >= valid_from)
);
create index substance_classifications_substance_idx on public.substance_classifications (substance_id);
create index substance_classifications_org_idx on public.substance_classifications (organization_id);

-- ---------------------------------------------------------------------------
-- Firm data: raw materials
-- ---------------------------------------------------------------------------

create table public.raw_materials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  trade_name text not null,
  supplier_name text,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index raw_materials_org_idx on public.raw_materials (organization_id);

create table public.raw_material_sds_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  raw_material_id uuid not null references public.raw_materials (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  revision_number text,
  revision_date text,
  extraction jsonb,
  flags jsonb not null default '[]',
  extractor jsonb,
  status public.review_status not null default 'pending_review',
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  uploaded_by uuid references auth.users (id) default auth.uid(),
  uploaded_at timestamptz not null default now(),
  constraint raw_material_sds_documents_approval check (
    status <> 'approved' or (approved_by is not null and approved_at is not null)
  )
);
create index raw_material_sds_documents_org_idx on public.raw_material_sds_documents (organization_id);
create index raw_material_sds_documents_rm_idx on public.raw_material_sds_documents (raw_material_id);

-- Concentrations stay ranges (rule 4): both bounds kept; a single value has min = max.
create table public.raw_material_components (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  raw_material_id uuid not null references public.raw_materials (id) on delete cascade,
  sds_document_id uuid references public.raw_material_sds_documents (id) on delete set null,
  substance_id uuid references public.substances (id),
  name_as_written text not null,
  cas_number text,
  concentration_min numeric check (concentration_min between 0 and 100),
  concentration_max numeric check (concentration_max between 0 and 100),
  concentration_raw text,
  created_at timestamptz not null default now(),
  constraint raw_material_components_range check (
    concentration_min is null or concentration_max is null or concentration_min <= concentration_max
  )
);
create index raw_material_components_org_idx on public.raw_material_components (organization_id);
create index raw_material_components_rm_idx on public.raw_material_components (raw_material_id);

-- ---------------------------------------------------------------------------
-- Firm data: products
-- ---------------------------------------------------------------------------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  code text,
  product_type text,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);
create index products_org_idx on public.products (organization_id);

create table public.recipe_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  raw_material_id uuid not null references public.raw_materials (id),
  percent_min numeric not null check (percent_min between 0 and 100),
  percent_max numeric not null check (percent_max between 0 and 100),
  position int not null default 0,
  created_at timestamptz not null default now(),
  constraint recipe_lines_range check (percent_min <= percent_max)
);
create index recipe_lines_org_idx on public.recipe_lines (organization_id);
create index recipe_lines_product_idx on public.recipe_lines (product_id);
create index recipe_lines_rm_idx on public.recipe_lines (raw_material_id);

-- Measured mixture data (flash point, pH, density ...), entered as lab results.
create table public.product_measurements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  property text not null,
  value_text text not null,
  numeric_min numeric,
  numeric_max numeric,
  unit text,
  method text,
  conditions text,
  lab_reference text,
  measured_on date,
  entered_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  constraint product_measurements_range check (
    numeric_min is null or numeric_max is null or numeric_min <= numeric_max
  )
);
create index product_measurements_org_idx on public.product_measurements (organization_id);
create index product_measurements_product_idx on public.product_measurements (product_id);

-- ---------------------------------------------------------------------------
-- Firm data: SDS documents and revisions
-- ---------------------------------------------------------------------------

-- Fixed document number per product and language (rule 10).
create table public.sds_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  document_number text not null,
  language public.sds_language not null,
  status public.sds_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, document_number, language),
  unique (product_id, language)
);
create index sds_documents_org_idx on public.sds_documents (organization_id);

create table public.sds_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sds_document_id uuid not null references public.sds_documents (id) on delete cascade,
  revision_number int not null check (revision_number >= 1),
  content jsonb not null,
  content_summary text,
  change_log jsonb not null default '[]',
  engine_version text not null,
  data_sources jsonb not null default '[]',
  classification_trace jsonb not null default '[]',
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  pdf_path text,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (sds_document_id, revision_number),
  constraint sds_revisions_approval check ((approved_by is null) = (approved_at is null))
);
create index sds_revisions_org_idx on public.sds_revisions (organization_id);

-- ---------------------------------------------------------------------------
-- Audit log (written by triggers only)
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations (id) on delete cascade,
  actor uuid,
  action text not null,
  table_name text not null,
  record_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_org_idx on public.audit_log (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------

create function public.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger organizations_touch before update on public.organizations
  for each row execute function public.touch_updated_at();
create trigger substances_touch before update on public.substances
  for each row execute function public.touch_updated_at();
create trigger raw_materials_touch before update on public.raw_materials
  for each row execute function public.touch_updated_at();
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();
create trigger sds_documents_touch before update on public.sds_documents
  for each row execute function public.touch_updated_at();

-- A child row must belong to the same firm as the rows it points to; otherwise a member
-- of firm A could attach firm B's raw material to their own recipe.
create function public.check_same_org()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  parent_org uuid;
begin
  if tg_table_name = 'raw_material_sds_documents' or tg_table_name = 'raw_material_components' then
    select organization_id into parent_org from public.raw_materials where id = new.raw_material_id;
    if parent_org is distinct from new.organization_id then
      raise exception 'raw material belongs to another organization';
    end if;
    if tg_table_name = 'raw_material_components' and new.sds_document_id is not null then
      select organization_id into parent_org from public.raw_material_sds_documents where id = new.sds_document_id;
      if parent_org is distinct from new.organization_id then
        raise exception 'SDS document belongs to another organization';
      end if;
    end if;
  elsif tg_table_name = 'recipe_lines' then
    select organization_id into parent_org from public.products where id = new.product_id;
    if parent_org is distinct from new.organization_id then
      raise exception 'product belongs to another organization';
    end if;
    select organization_id into parent_org from public.raw_materials where id = new.raw_material_id;
    if parent_org is distinct from new.organization_id then
      raise exception 'raw material belongs to another organization';
    end if;
  elsif tg_table_name = 'product_measurements' or tg_table_name = 'sds_documents' then
    select organization_id into parent_org from public.products where id = new.product_id;
    if parent_org is distinct from new.organization_id then
      raise exception 'product belongs to another organization';
    end if;
  elsif tg_table_name = 'sds_revisions' then
    select organization_id into parent_org from public.sds_documents where id = new.sds_document_id;
    if parent_org is distinct from new.organization_id then
      raise exception 'SDS document belongs to another organization';
    end if;
  end if;
  return new;
end;
$$;

create trigger raw_material_sds_documents_same_org before insert or update on public.raw_material_sds_documents
  for each row execute function public.check_same_org();
create trigger raw_material_components_same_org before insert or update on public.raw_material_components
  for each row execute function public.check_same_org();
create trigger recipe_lines_same_org before insert or update on public.recipe_lines
  for each row execute function public.check_same_org();
create trigger product_measurements_same_org before insert or update on public.product_measurements
  for each row execute function public.check_same_org();
create trigger sds_documents_same_org before insert or update on public.sds_documents
  for each row execute function public.check_same_org();
create trigger sds_revisions_same_org before insert or update on public.sds_revisions
  for each row execute function public.check_same_org();

-- Approvals are recorded as the signed-in user, and only a member with the kdu role may
-- approve (rule 11). The service role (no auth.uid()) is exempt for imports.
create function public.check_approval()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  org uuid;
begin
  if new.approved_by is null or auth.uid() is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.approved_by is not distinct from new.approved_by then
    return new;
  end if;
  if new.approved_by <> auth.uid() then
    raise exception 'approval must be recorded as the signed-in user';
  end if;
  org := new.organization_id;
  if org is null then
    if not public.is_platform_admin() then
      raise exception 'only a platform admin may approve global data';
    end if;
  elsif not public.has_org_role(org, array['kdu']::public.member_role[]) then
    raise exception 'only a KDU may approve';
  end if;
  return new;
end;
$$;

create trigger substance_classifications_approval before insert or update on public.substance_classifications
  for each row execute function public.check_approval();
create trigger raw_material_sds_documents_approval before insert or update on public.raw_material_sds_documents
  for each row execute function public.check_approval();
create trigger sds_revisions_approval before insert or update on public.sds_revisions
  for each row execute function public.check_approval();

-- An approved revision is frozen; a content change means a new revision (rule 10).
create function public.freeze_approved_revision()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.approved_by is not null and (
    new.content is distinct from old.content
    or new.revision_number is distinct from old.revision_number
    or new.engine_version is distinct from old.engine_version
    or new.data_sources is distinct from old.data_sources
    or new.classification_trace is distinct from old.classification_trace
    or new.approved_by is distinct from old.approved_by
    or new.approved_at is distinct from old.approved_at
  ) then
    raise exception 'an approved revision cannot be changed; create a new revision';
  end if;
  return new;
end;
$$;

create trigger sds_revisions_freeze before update on public.sds_revisions
  for each row execute function public.freeze_approved_revision();

-- An SDS can only be published with a KDU-approved revision (rule 11).
create function public.check_sds_publish()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    if not exists (
      select 1 from public.sds_revisions r
      where r.sds_document_id = new.id and r.approved_by is not null
    ) then
      raise exception 'an SDS cannot be published without a KDU-approved revision';
    end if;
  end if;
  return new;
end;
$$;

create trigger sds_documents_publish before insert or update on public.sds_documents
  for each row execute function public.check_sds_publish();

create function public.write_audit_log()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  row_data jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log (organization_id, actor, action, table_name, record_id, details)
  values (
    (row_data ->> 'organization_id')::uuid,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    -- organization_members has no id column; its user_id identifies the row.
    coalesce(row_data ->> 'id', row_data ->> 'user_id')::uuid,
    case when tg_op = 'UPDATE' then jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new))
         else row_data end
  );
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'raw_materials', 'raw_material_sds_documents', 'raw_material_components', 'products',
    'recipe_lines', 'product_measurements', 'sds_documents', 'sds_revisions',
    'substance_classifications', 'organization_members'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.write_audit_log()',
      t || '_audit', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.platform_admins enable row level security;
alter table public.substances enable row level security;
alter table public.substance_classifications enable row level security;
alter table public.raw_materials enable row level security;
alter table public.raw_material_sds_documents enable row level security;
alter table public.raw_material_components enable row level security;
alter table public.products enable row level security;
alter table public.recipe_lines enable row level security;
alter table public.product_measurements enable row level security;
alter table public.sds_documents enable row level security;
alter table public.sds_revisions enable row level security;
alter table public.audit_log enable row level security;

-- Organizations: members read; owners rename. Creation goes through create_organization().
create policy organizations_select on public.organizations
  for select to authenticated using (public.is_org_member(id));
create policy organizations_update on public.organizations
  for update to authenticated
  using (public.has_org_role(id, array['owner']::public.member_role[]))
  with check (public.has_org_role(id, array['owner']::public.member_role[]));

-- Members: members see their firm's member list; only owners manage it.
create policy organization_members_select on public.organization_members
  for select to authenticated using (public.is_org_member(organization_id));
create policy organization_members_insert on public.organization_members
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner']::public.member_role[]));
create policy organization_members_update on public.organization_members
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner']::public.member_role[]));
create policy organization_members_delete on public.organization_members
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner']::public.member_role[]));

-- Platform admins: a user may see whether they are one; no client writes.
create policy platform_admins_select on public.platform_admins
  for select to authenticated using (user_id = auth.uid());

-- Global substance pool: everyone signed in reads; platform admins write.
create policy substances_select on public.substances
  for select to authenticated using (true);
create policy substances_write on public.substances
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Classifications: global rows readable by all, firm rows by that firm only.
create policy substance_classifications_select on public.substance_classifications
  for select to authenticated
  using (organization_id is null or public.is_org_member(organization_id));
create policy substance_classifications_insert on public.substance_classifications
  for insert to authenticated
  with check (
    (organization_id is null and public.is_platform_admin())
    or (organization_id is not null and public.can_edit_org(organization_id))
  );
create policy substance_classifications_update on public.substance_classifications
  for update to authenticated
  using (
    (organization_id is null and public.is_platform_admin())
    or (organization_id is not null and public.can_edit_org(organization_id))
  )
  with check (
    (organization_id is null and public.is_platform_admin())
    or (organization_id is not null and public.can_edit_org(organization_id))
  );
create policy substance_classifications_delete on public.substance_classifications
  for delete to authenticated
  using (
    (organization_id is null and public.is_platform_admin())
    or (organization_id is not null and public.has_org_role(organization_id, array['owner', 'editor']::public.member_role[]))
  );

-- Firm tables: members read; owner/editor/kdu write; owner/editor delete; viewers read only.
do $$
declare
  t text;
begin
  foreach t in array array[
    'raw_materials', 'raw_material_sds_documents', 'raw_material_components', 'products',
    'recipe_lines', 'product_measurements', 'sds_documents', 'sds_revisions'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_org_member(organization_id))',
      t || '_select', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.can_edit_org(organization_id))',
      t || '_insert', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.can_edit_org(organization_id)) with check (public.can_edit_org(organization_id))',
      t || '_update', t
    );
    -- Approved revisions are never deleted (policy below); withdraw the document instead.
    if t <> 'sds_revisions' then
      execute format(
        'create policy %I on public.%I for delete to authenticated using (public.has_org_role(organization_id, array[''owner'', ''editor'']::public.member_role[]))',
        t || '_delete', t
      );
    end if;
  end loop;
end;
$$;

create policy sds_revisions_delete on public.sds_revisions
  for delete to authenticated
  using (
    approved_by is null
    and public.has_org_role(organization_id, array['owner', 'editor']::public.member_role[])
  );

-- Audit log: members read their firm's entries; nobody writes directly.
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (organization_id is not null and public.is_org_member(organization_id));
