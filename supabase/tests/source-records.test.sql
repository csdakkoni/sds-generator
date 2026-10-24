-- Outside-source records: only the platform admin writes; rows with an unverified licence are
-- visible to the platform admin only. Runs after rls.test.sql (reuses its users).

select tests.login('dddddddd-0000-0000-0000-000000000001');
insert into public.substance_source_records (cas_number, source_id, family, reference, lines, data_license)
values ('67-64-1', 'pubchem', 'echa_notifications', 'PubChem', '[{"category":"Flam. Liq. 2","hCode":"H225"}]', 'unverified'),
       ('67-64-1', 'nite', 'nite', 'NITE-CHRIP', '[]', 'official_public');
select tests.expect_count('admin sees both rows', $$select * from public.substance_source_records$$, 2);
select tests.logout();

select tests.login('aaaaaaaa-0000-0000-0000-000000000001');
select tests.expect_count('a firm user sees only the row with a clarified licence',
  $$select * from public.substance_source_records$$, 1);
select tests.expect_error('a firm user cannot write source records',
  $$insert into public.substance_source_records (cas_number, source_id, family, reference) values ('64-17-5', 'x', 'x', 'x')$$,
  'row-level security');
select tests.logout();

-- A licence decided once on the source applies to all its records. The registry row is written
-- by the server (service role), here by the test owner.
update public.substance_source_records set data_license = 'unverified';
insert into public.outside_sources (source_id, name, family) values ('pubchem', 'PubChem test', 'echa_notifications');
select tests.login('aaaaaaaa-0000-0000-0000-000000000001');
select tests.expect_rows_changed('a firm user cannot change a source licence',
  $$update public.outside_sources set data_license = 'official_public' where source_id = 'pubchem'$$, 0);
select tests.logout();
select tests.login('dddddddd-0000-0000-0000-000000000001');
update public.outside_sources set data_license = 'official_public' where source_id = 'pubchem';
select tests.logout();
select tests.login('aaaaaaaa-0000-0000-0000-000000000001');
select tests.expect_count('after the licence decision the firm user sees that source''s record only',
  $$select * from public.substance_source_records where source_id = 'pubchem'$$, 1);
select tests.expect_count('the other source stays hidden', $$select * from public.substance_source_records where source_id = 'nite'$$, 0);
select tests.logout();
