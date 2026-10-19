-- Library profile tests. Runs after rls.test.sql and reuses its fixtures (firm A with owner,
-- KDU and viewer; firm B owner; platform admin; the global substance "water").

-- Fixtures written as the platform admin: a regulation version and profiles of each layer.
select tests.login('dddddddd-0000-0000-0000-000000000001');
with r as (
  insert into public.regulation_versions (regulation, title, source_document, status)
  values ('SEA', 'SEA Ek-6 test version', 'test fixture', 'active') returning id
) insert into tests.ids select 'regver', id from r;

with r as (
  insert into public.classification_profiles (substance_id, source_type, regulation, regulation_version_id, source_reference, data_license)
  select (select id from tests.ids where key = 'water'), 'harmonised', 'SEA', (select id from tests.ids where key = 'regver'),
         'Ek-6 test row', 'official_public'
  returning id
) insert into tests.ids select 'prof_harm', id from r;

with r as (
  insert into public.classification_profiles (substance_id, source_type, regulation, source_reference, data_license)
  select (select id from tests.ids where key = 'water'), 'industry_guidance', 'CESIO test', 'test p. 1', 'unverified'
  returning id
) insert into tests.ids select 'prof_cesio', id from r;

select tests.expect_error('only one current harmonised profile per substance',
  $$insert into public.classification_profiles (substance_id, source_type, regulation, regulation_version_id, source_reference, data_license)
    select substance_id, 'harmonised', 'SEA', regulation_version_id, 'dup', 'official_public'
    from public.classification_profiles where source_type = 'harmonised' limit 1$$,
  'classification_profiles_one_harmonised');
select tests.expect_error('harmonised profile needs a regulation version',
  $$insert into public.classification_profiles (substance_id, source_type, regulation, source_reference)
    select id, 'harmonised', 'SEA', 'x' from public.substances where cas_number = '7732-18-5'$$,
  'profiles_harmonised_version');
select tests.expect_error('expert rule needs condition and rationale',
  $$insert into public.classification_profiles (substance_id, organization_id, source_type, regulation, source_reference)
    select (select id from public.substances where cas_number = '7732-18-5'), null, 'expert_rule', 'TR', 'x'$$,
  'profiles_expert_rule_reason');
select tests.expect_error('research note cannot be verified',
  $$insert into public.classification_profiles (substance_id, source_type, regulation, source_reference, verification_status, verified_by, verified_at)
    select id, 'research_note', 'PubChem', 'x', 'verified', 'dddddddd-0000-0000-0000-000000000001', now()
    from public.substances where cas_number = '7732-18-5'$$,
  'profiles_research_note_inert');
select tests.expect_error('verified profile needs a verifier',
  $$update public.classification_profiles set verification_status = 'verified' where source_type = 'harmonised'$$,
  'profiles_verified_by_person');

-- A line must agree with its profile (source type and scope).
select tests.expect_error('line source must match the profile layer',
  $$insert into public.substance_classifications (substance_id, profile_id, hazard_class, category, source_type, source_reference)
    select substance_id, id, 'Skin Irrit.', '2', 'supplier_sds', 'x' from public.classification_profiles where source_type = 'harmonised'$$,
  'does not match profile source_type');
insert into public.substance_classifications (substance_id, profile_id, hazard_class, category, source_type, source_reference)
  select substance_id, id, 'Skin Irrit.', '2', 'sea_annex6', 'Ek-6 test row' from public.classification_profiles where source_type = 'harmonised';
insert into public.substance_classifications (substance_id, profile_id, hazard_class, category, source_type, source_reference)
  select substance_id, id, 'Eye Irrit.', '2', 'expert', 'CESIO test' from public.classification_profiles where source_type = 'industry_guidance';
select tests.logout();

-- Visibility: unverified-licence global profiles (CESIO) are for the platform admin only.
select tests.login('aaaaaaaa-0000-0000-0000-00000000000c');
select tests.expect_count('firm KDU sees the harmonised profile but not the unverified-licence one',
  'select * from public.classification_profiles', 1);
select tests.expect_count('lines of the hidden profile are hidden too',
  $$select * from public.substance_classifications where source_reference = 'CESIO test'$$, 0);
select tests.expect_error('firm KDU cannot write global profiles',
  $$insert into public.classification_profiles (substance_id, source_type, regulation, source_reference)
    select id, 'shared_pool', 'x', 'x' from public.substances where cas_number = '7732-18-5'$$,
  'row-level security');
-- Firm KDU verifies their own supplier SDS profile; a viewer cannot.
insert into public.classification_profiles (substance_id, organization_id, source_type, regulation, source_reference)
  select (select id from public.substances where cas_number = '7732-18-5'), (select id from tests.ids where key = 'org_a'),
         'supplier_sds', 'TR', 'supplier SDS p. 3';
select tests.expect_count('KDU sees own firm profile too',
  'select * from public.classification_profiles', 2);
update public.classification_profiles set verification_status = 'verified',
  verified_by = 'aaaaaaaa-0000-0000-0000-00000000000c', verified_at = now() where source_type = 'supplier_sds';
select tests.expect_error('verification must be recorded as the signed-in user',
  $$update public.classification_profiles set verification_status = 'verified',
    verified_by = 'aaaaaaaa-0000-0000-0000-000000000001', verified_at = now() where source_type = 'supplier_sds'$$,
  'signed-in user');
select tests.logout();

select tests.login('bbbbbbbb-0000-0000-0000-000000000001');
select tests.expect_count('firm B does not see firm A profiles',
  $$select * from public.classification_profiles where organization_id is not null$$, 0);
select tests.logout();

select tests.login('aaaaaaaa-0000-0000-0000-00000000000e');
select tests.expect_error('viewer cannot create profiles',
  $$insert into public.classification_profiles (substance_id, organization_id, source_type, regulation, source_reference)
    select (select id from public.substances where cas_number = '7732-18-5'), (select id from tests.ids where key = 'org_a'),
           'supplier_sds', 'TR', 'x'$$,
  'row-level security');
select tests.logout();

-- KDU review queue: only the firm's KDU sees it; others do not.
select tests.login('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.kdu_review_queue (organization_id, item_type, title)
  select id, 'profile_conflict', 'conflict test' from tests.ids where key = 'org_a';
select tests.logout();
select tests.login('aaaaaaaa-0000-0000-0000-00000000000e');
select tests.expect_count('viewer cannot read the queue', 'select * from public.kdu_review_queue', 0);
select tests.logout();
select tests.login('aaaaaaaa-0000-0000-0000-00000000000c');
select tests.expect_count('KDU sees the queue', 'select * from public.kdu_review_queue', 1);
select tests.expect_error('resolving needs a resolver and a time',
  $$update public.kdu_review_queue set status = 'resolved'$$, 'review_queue_resolved');
update public.kdu_review_queue set status = 'resolved', resolved_by = 'aaaaaaaa-0000-0000-0000-00000000000c', resolved_at = now();
select tests.logout();
select tests.login('bbbbbbbb-0000-0000-0000-000000000001');
select tests.expect_count('firm B sees no queue items', 'select * from public.kdu_review_queue', 0);
select tests.logout();

-- Monitoring tables are platform-admin only; regulation versions are readable by all and never deleted.
select tests.login('aaaaaaaa-0000-0000-0000-000000000001');
select tests.expect_count('firm users read regulation versions', 'select * from public.regulation_versions', 1);
select tests.expect_error('firm users cannot create regulation versions',
  $$insert into public.regulation_versions (regulation, title, source_document) values ('SEA', 'x', 'x')$$, 'row-level security');
select tests.expect_count('firm users cannot see monitoring sources', 'select * from public.regulatory_sources', 0);
select tests.logout();
select tests.login('dddddddd-0000-0000-0000-000000000001');
select tests.expect_rows_changed('regulation versions cannot be deleted', 'delete from public.regulation_versions', 0);
select tests.logout();
