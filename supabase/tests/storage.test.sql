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

select tests.login('bbbbbbbb-0000-0000-0000-000000000001');
select tests.expect_rows_changed('B cannot give itself a role in firm A',
  $$update public.organization_members set extra_roles = '{kdu}'
    where organization_id = (select id from tests.ids where key = 'org_a')$$, 0);
select tests.logout();
