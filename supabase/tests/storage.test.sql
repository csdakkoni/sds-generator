-- Supplier SDS bucket and extra roles. Runs after rls.test.sql in the same database, so
-- it reuses the users, firms and helper functions created there.

select tests.login('aaaaaaaa-0000-0000-0000-000000000001');
select tests.expect_rows_changed('A uploads into its own folder',
  $$insert into storage.objects (bucket_id, name)
    select 'supplier-sds', id || '/doc.pdf' from tests.ids where key = 'org_a'$$, 1);
select tests.expect_error('A cannot upload into firm B''s folder',
  $$insert into storage.objects (bucket_id, name)
    select 'supplier-sds', id || '/doc.pdf' from tests.ids where key = 'org_b'$$,
  'row-level security');
select tests.expect_error('a path without a firm folder is rejected',
  $$insert into storage.objects (bucket_id, name) values ('supplier-sds', 'loose.pdf')$$,
  'row-level security');
select tests.expect_count('A sees its own file', $$select * from storage.objects$$, 1);
select tests.logout();

select tests.login('bbbbbbbb-0000-0000-0000-000000000001');
select tests.expect_count('B does not see A''s file', $$select * from storage.objects$$, 0);
select tests.logout();

select tests.login('aaaaaaaa-0000-0000-0000-00000000000e');
select tests.expect_error('viewer cannot upload',
  $$insert into storage.objects (bucket_id, name)
    select 'supplier-sds', id || '/v.pdf' from tests.ids where key = 'org_a'$$,
  'row-level security');
select tests.logout();

-- Owner who is also the firm's KDU.
select tests.login('aaaaaaaa-0000-0000-0000-000000000001');
with r as (
  insert into public.sds_revisions (organization_id, sds_document_id, revision_number, content, engine_version)
  select (select id from tests.ids where key = 'org_a'), (select id from tests.ids where key = 'sds_a'), 2, '{}', '0.1.0'
  returning id
) insert into tests.ids select 'rev_a2', id from r;
select tests.expect_error('owner without KDU role still cannot approve',
  $$update public.sds_revisions set approved_by = auth.uid(), approved_at = now()
    where id = (select id from tests.ids where key = 'rev_a2')$$,
  'only a KDU');
select tests.expect_rows_changed('owner gives themselves the KDU role',
  $$update public.organization_members set extra_roles = '{kdu}'
    where user_id = auth.uid() and organization_id = (select id from tests.ids where key = 'org_a')$$, 1);
select tests.expect_rows_changed('owner with KDU role approves',
  $$update public.sds_revisions set approved_by = auth.uid(), approved_at = now()
    where id = (select id from tests.ids where key = 'rev_a2')$$, 1);
select tests.logout();

-- Approved SDS PDFs: written once by the firm's KDU.
select tests.login('aaaaaaaa-0000-0000-0000-000000000001');
select tests.expect_rows_changed('KDU stores the approved PDF',
  $$insert into storage.objects (bucket_id, name)
    select 'sds-pdf', id || '/rev2.pdf' from tests.ids where key = 'org_a'$$, 1);
select tests.expect_rows_changed('the PDF path is recorded on the approved revision',
  $$update public.sds_revisions
      set pdf_path = (select id from tests.ids where key = 'org_a') || '/rev2.pdf'
    where id = (select id from tests.ids where key = 'rev_a2')$$, 1);
select tests.expect_error('a recorded PDF cannot be replaced',
  $$update public.sds_revisions set pdf_path = 'other.pdf'
    where id = (select id from tests.ids where key = 'rev_a2')$$,
  'cannot be replaced');
select tests.expect_rows_changed('a stored PDF cannot be overwritten',
  $$update storage.objects set name = name where bucket_id = 'sds-pdf'$$, 0);
select tests.logout();

select tests.login('aaaaaaaa-0000-0000-0000-00000000000e');
select tests.expect_error('viewer cannot store an approved PDF',
  $$insert into storage.objects (bucket_id, name)
    select 'sds-pdf', id || '/rev9.pdf' from tests.ids where key = 'org_a'$$,
  'row-level security');
select tests.logout();

select tests.login('bbbbbbbb-0000-0000-0000-000000000001');
select tests.expect_rows_changed('B cannot give itself a role in firm A',
  $$update public.organization_members set extra_roles = '{kdu}'
    where organization_id = (select id from tests.ids where key = 'org_a')$$, 0);
select tests.logout();

-- The upload flow: document row, components read from it, KDU approval.
select tests.login('aaaaaaaa-0000-0000-0000-000000000001');
with d as (
  insert into public.raw_material_sds_documents (organization_id, raw_material_id, storage_path, file_name)
  select (select id from tests.ids where key = 'org_a'), (select id from tests.ids where key = 'rm_a'),
    'x/doc.pdf', 'doc.pdf'
  returning id
) insert into tests.ids select 'doc_a', id from d;
select tests.expect_count('A records an uploaded SDS',
  $$select * from public.raw_material_sds_documents where extraction_status = 'queued'$$, 1);
select tests.expect_rows_changed('components are stored against the document',
  $$insert into public.raw_material_components
      (organization_id, raw_material_id, sds_document_id, name_as_written, concentration_min, concentration_max)
    select (select id from tests.ids where key = 'org_a'), (select id from tests.ids where key = 'rm_a'),
      (select id from tests.ids where key = 'doc_a'), 'bileşen', 10, 20$$, 1);
select tests.expect_rows_changed('owner with KDU role approves the document',
  $$update public.raw_material_sds_documents
      set status = 'approved', approved_by = auth.uid(), approved_at = now()
    where id = (select id from tests.ids where key = 'doc_a')$$, 1);
select tests.logout();

select tests.login('bbbbbbbb-0000-0000-0000-000000000001');
select tests.expect_error('B cannot attach an SDS to A''s raw material',
  $$insert into public.raw_material_sds_documents (organization_id, raw_material_id, storage_path, file_name)
    select (select id from tests.ids where key = 'org_b'), (select id from tests.ids where key = 'rm_a'),
      'x/doc.pdf', 'doc.pdf'$$,
  'another organization');
select tests.logout();
