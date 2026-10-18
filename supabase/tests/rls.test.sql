-- RLS tests: two firms, two owners, plus a KDU, a viewer and a platform admin.
-- Each check raises an exception on failure, so the run stops at the first broken rule.

create schema tests;
grant usage on schema tests to authenticated, anon;

create function tests.login(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  set role authenticated;
end;
$$;

create function tests.logout() returns void
language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', false);
end;
$$;

create function tests.expect_count(label text, query text, expected int) returns void
language plpgsql as $$
declare
  n int;
begin
  execute format('select count(*) from (%s) q', query) into n;
  if n <> expected then
    raise exception 'FAIL %: expected % rows, got %', label, expected, n;
  end if;
  raise notice 'ok  %', label;
end;
$$;

create function tests.expect_error(label text, stmt text, pattern text) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlerrm ilike '%' || pattern || '%' then
      raise notice 'ok  %', label;
      return;
    end if;
    raise exception 'FAIL %: wrong error: %', label, sqlerrm;
  end;
  raise exception 'FAIL %: statement succeeded', label;
end;
$$;

create function tests.expect_rows_changed(label text, stmt text, expected int) returns void
language plpgsql as $$
declare
  n int;
begin
  execute stmt;
  get diagnostics n = row_count;
  if n <> expected then
    raise exception 'FAIL %: expected % rows changed, got %', label, expected, n;
  end if;
  raise notice 'ok  %', label;
end;
$$;

grant execute on all functions in schema tests to authenticated, anon;

-- Fixed ids keep the statements below readable.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'owner-a@example.test'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'owner-b@example.test'),
  ('aaaaaaaa-0000-0000-0000-00000000000c', 'kdu-a@example.test'),
  ('aaaaaaaa-0000-0000-0000-00000000000e', 'viewer-a@example.test'),
  ('dddddddd-0000-0000-0000-000000000001', 'admin@example.test');
insert into public.platform_admins (user_id) values ('dddddddd-0000-0000-0000-000000000001');

create table tests.ids (key text primary key, id uuid not null);
grant all on tests.ids to authenticated;

-- ---------------------------------------------------------------------------
-- Firm A: owner creates the firm and its data
-- ---------------------------------------------------------------------------
select tests.login('aaaaaaaa-0000-0000-0000-000000000001');
insert into tests.ids values ('org_a', public.create_organization('Firma A'));
insert into public.organization_members (organization_id, user_id, role)
  select id, 'aaaaaaaa-0000-0000-0000-00000000000c', 'kdu' from tests.ids where key = 'org_a';
insert into public.organization_members (organization_id, user_id, role)
  select id, 'aaaaaaaa-0000-0000-0000-00000000000e', 'viewer' from tests.ids where key = 'org_a';

with r as (
  insert into public.raw_materials (organization_id, trade_name)
  select id, 'Hammadde A' from tests.ids where key = 'org_a' returning id
) insert into tests.ids select 'rm_a', id from r;
with r as (
  insert into public.products (organization_id, name, code)
  select id, 'Ürün A', 'A-1' from tests.ids where key = 'org_a' returning id
) insert into tests.ids select 'prod_a', id from r;
insert into public.recipe_lines (organization_id, product_id, raw_material_id, percent_min, percent_max)
  select (select id from tests.ids where key = 'org_a'), (select id from tests.ids where key = 'prod_a'),
         (select id from tests.ids where key = 'rm_a'), 10, 20;
insert into public.product_measurements (organization_id, product_id, property, value_text)
  select (select id from tests.ids where key = 'org_a'), (select id from tests.ids where key = 'prod_a'), 'ph', '7,5';
with r as (
  insert into public.sds_documents (organization_id, product_id, document_number, language)
  select (select id from tests.ids where key = 'org_a'), (select id from tests.ids where key = 'prod_a'), 'GBF-0001', 'tr'
  returning id
) insert into tests.ids select 'sds_a', id from r;
with r as (
  insert into public.sds_revisions (organization_id, sds_document_id, revision_number, content, engine_version)
  select (select id from tests.ids where key = 'org_a'), (select id from tests.ids where key = 'sds_a'), 1, '{}', '0.1.0'
  returning id
) insert into tests.ids select 'rev_a', id from r;
select tests.logout();

-- Global substance written by the platform admin.
select tests.login('dddddddd-0000-0000-0000-000000000001');
with r as (
  insert into public.substances (cas_number, name) values ('7732-18-5', 'water') returning id
) insert into tests.ids select 'water', id from r;
insert into public.substance_classifications (substance_id, hazard_class, category, source_type, source_reference)
  select id, 'Skin Irrit.', '2', 'sea_annex6', 'test fixture' from tests.ids where key = 'water';
select tests.logout();

-- Firm A's private classification read from a supplier SDS.
select tests.login('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.substance_classifications (substance_id, organization_id, hazard_class, category, source_type, source_reference)
  select (select id from tests.ids where key = 'water'), (select id from tests.ids where key = 'org_a'),
         'Eye Dam.', '1', 'supplier_sds', 'supplier SDS p. 2';
select tests.logout();

-- ---------------------------------------------------------------------------
-- Firm B: a second owner who must not reach firm A
-- ---------------------------------------------------------------------------
select tests.login('bbbbbbbb-0000-0000-0000-000000000001');
insert into tests.ids values ('org_b', public.create_organization('Firma B'));
with r as (
  insert into public.products (organization_id, name)
  select id, 'Ürün B' from tests.ids where key = 'org_b' returning id
) insert into tests.ids select 'prod_b', id from r;

select tests.expect_count('B sees only its own organization', 'select * from public.organizations', 1);
select tests.expect_count('B does not see A''s members', 'select * from public.organization_members where user_id <> auth.uid()', 0);
select tests.expect_count('B does not see A''s raw materials', 'select * from public.raw_materials', 0);
select tests.expect_count('B sees only its own products', 'select * from public.products', 1);
select tests.expect_count('B does not see A''s recipe lines', 'select * from public.recipe_lines', 0);
select tests.expect_count('B does not see A''s measurements', 'select * from public.product_measurements', 0);
select tests.expect_count('B does not see A''s SDS documents', 'select * from public.sds_documents', 0);
select tests.expect_count('B does not see A''s SDS revisions', 'select * from public.sds_revisions', 0);
select tests.expect_count('B does not see A''s audit log', 'select * from public.audit_log where organization_id <> (select id from tests.ids where key = ''org_b'')', 0);
select tests.expect_count('B sees the global classification but not A''s private one',
  'select * from public.substance_classifications', 1);
select tests.expect_count('B reads the global substance pool', 'select * from public.substances', 1);

select tests.expect_error('B cannot insert into firm A',
  $$insert into public.raw_materials (organization_id, trade_name) select id, 'x' from tests.ids where key = 'org_a'$$,
  'row-level security');
select tests.expect_rows_changed('B cannot update A''s products',
  $$update public.products set name = 'hacked' where id = (select id from tests.ids where key = 'prod_a')$$, 0);
select tests.expect_rows_changed('B cannot delete A''s raw materials',
  $$delete from public.raw_materials where id = (select id from tests.ids where key = 'rm_a')$$, 0);
select tests.expect_error('B cannot join firm A',
  $$insert into public.organization_members (organization_id, user_id, role)
    select id, auth.uid(), 'owner' from tests.ids where key = 'org_a'$$,
  'row-level security');
select tests.expect_error('B cannot use A''s raw material in its own recipe',
  $$insert into public.recipe_lines (organization_id, product_id, raw_material_id, percent_min, percent_max)
    select (select id from tests.ids where key = 'org_b'), (select id from tests.ids where key = 'prod_b'),
           (select id from tests.ids where key = 'rm_a'), 1, 1$$,
  'another organization');
select tests.expect_error('B cannot write the global substance pool',
  $$insert into public.substances (name) values ('x')$$, 'row-level security');
select tests.expect_error('B cannot add a global classification',
  $$insert into public.substance_classifications (substance_id, hazard_class, category, source_type, source_reference)
    select id, 'Acute Tox.', '4', 'sea_annex6', 'x' from tests.ids where key = 'water'$$,
  'row-level security');
select tests.expect_error('B cannot write the audit log',
  $$insert into public.audit_log (action, table_name) values ('x', 'x')$$, 'row-level security');
select tests.logout();

-- ---------------------------------------------------------------------------
-- Firm A: sees its own data
-- ---------------------------------------------------------------------------
select tests.login('aaaaaaaa-0000-0000-0000-000000000001');
select tests.expect_count('A sees its raw material', 'select * from public.raw_materials', 1);
select tests.expect_count('A sees its product', 'select * from public.products', 1);
select tests.expect_count('A sees its own and the global classification', 'select * from public.substance_classifications', 2);
select tests.expect_count('A''s product name survived B''s update attempt',
  $$select * from public.products where name = 'Ürün A'$$, 1);
select tests.logout();

-- ---------------------------------------------------------------------------
-- Roles inside firm A
-- ---------------------------------------------------------------------------
select tests.login('aaaaaaaa-0000-0000-0000-00000000000e');
select tests.expect_count('viewer reads firm data', 'select * from public.products', 1);
select tests.expect_error('viewer cannot write',
  $$insert into public.products (organization_id, name) select id, 'x' from tests.ids where key = 'org_a'$$,
  'row-level security');
select tests.logout();

select tests.login('aaaaaaaa-0000-0000-0000-000000000001');
select tests.expect_error('SDS cannot be published without an approved revision',
  $$update public.sds_documents set status = 'published' where id = (select id from tests.ids where key = 'sds_a')$$,
  'KDU-approved revision');
select tests.expect_error('owner without kdu role cannot approve',
  $$update public.sds_revisions set approved_by = auth.uid(), approved_at = now()
    where id = (select id from tests.ids where key = 'rev_a')$$,
  'only a KDU');
select tests.logout();

select tests.login('aaaaaaaa-0000-0000-0000-00000000000c');
select tests.expect_error('KDU cannot approve in someone else''s name',
  $$update public.sds_revisions set approved_by = 'aaaaaaaa-0000-0000-0000-000000000001', approved_at = now()
    where id = (select id from tests.ids where key = 'rev_a')$$,
  'signed-in user');
select tests.expect_rows_changed('KDU approves the revision',
  $$update public.sds_revisions set approved_by = auth.uid(), approved_at = now()
    where id = (select id from tests.ids where key = 'rev_a')$$, 1);
select tests.expect_rows_changed('SDS is published after KDU approval',
  $$update public.sds_documents set status = 'published' where id = (select id from tests.ids where key = 'sds_a')$$, 1);
select tests.expect_error('approved revision content is frozen',
  $$update public.sds_revisions set content = '{"changed": true}' where id = (select id from tests.ids where key = 'rev_a')$$,
  'cannot be changed');
select tests.logout();

select tests.login('aaaaaaaa-0000-0000-0000-000000000001');
select tests.expect_rows_changed('approved revision cannot be deleted',
  $$delete from public.sds_revisions where id = (select id from tests.ids where key = 'rev_a')$$, 0);
select tests.logout();

-- ---------------------------------------------------------------------------
-- Data rules and anonymous access
-- ---------------------------------------------------------------------------
select tests.expect_error('SEA Annex 6 rows cannot belong to a firm',
  $$insert into public.substance_classifications (substance_id, organization_id, hazard_class, category, source_type, source_reference)
    select (select id from tests.ids where key = 'water'), (select id from tests.ids where key = 'org_a'), 'x', '1', 'sea_annex6', 'x'$$,
  'substance_classifications_scope');
select tests.expect_error('concentration ranges keep min <= max',
  $$insert into public.raw_material_components (organization_id, raw_material_id, name_as_written, concentration_min, concentration_max)
    select (select id from tests.ids where key = 'org_a'), (select id from tests.ids where key = 'rm_a'), 'x', 20, 10$$,
  'raw_material_components_range');

set role anon;
select tests.expect_count('anonymous users see no firm data', 'select * from public.products', 0);
select tests.expect_count('anonymous users see no organizations', 'select * from public.organizations', 0);
reset role;

do $$
declare
  missing text;
begin
  select string_agg(c.relname, ', ') into missing
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if missing is not null then
    raise exception 'FAIL tables without RLS: %', missing;
  end if;
  raise notice 'ok  every public table has RLS enabled';
end;
$$;
