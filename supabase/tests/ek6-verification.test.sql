-- Bulk verification of Annex 6 profiles. Runs after library.test.sql; builds its own fixtures
-- as the platform admin: one plain row, one row with a note letter, one row without lines.

create function tests.expect_equal(label text, query text, expected text) returns void
language plpgsql as $$
declare
  got text;
begin
  execute query into got;
  if got is distinct from expected then
    raise exception 'FAIL %: expected %, got %', label, expected, got;
  end if;
  raise notice 'ok  %', label;
end;
$$;

select tests.login('dddddddd-0000-0000-0000-000000000001');
with s as (
  insert into public.substances (name, cas_number) values
    ('bulk plain', '64-17-5'), ('bulk noted', '67-56-1'), ('bulk empty', '67-63-0')
  returning id, cas_number
), v as (
  insert into public.regulation_versions (regulation, title, source_document, status)
  values ('SEA', 'bulk test version', 'test fixture', 'draft') returning id
), p as (
  insert into public.classification_profiles
    (substance_id, source_type, regulation, regulation_version_id, source_reference, data_license, source_snapshot)
  select s.id, 'harmonised', 'SEA', (select id from v), 'bulk ' || s.cas_number, 'official_public',
         case s.cas_number
           when '67-56-1' then '{"note": "K"}'::jsonb
           else '{"note": null, "scl_m_text": null}'::jsonb end
  from s returning id, substance_id, source_reference
)
insert into public.substance_classifications (substance_id, profile_id, hazard_class, category, h_code, source_type, source_reference)
select substance_id, id, 'skin_corrosion_irritation', 'Skin Irrit. 2', 'H315', 'sea_annex6', source_reference
from p where source_reference not like '%67-63-0';

select tests.expect_equal('counts: two simple (incl. the library fixture), one needing review, one without lines',
  $$select (public.ek6_verification_counts() ->> 'pending_simple')::int * 100
          + (public.ek6_verification_counts() ->> 'pending_needs_review')::int * 10
          + (public.ek6_verification_counts() ->> 'pending_without_lines')::int$$, '211');
select tests.logout();

select tests.login('aaaaaaaa-0000-0000-0000-00000000000c');
select tests.expect_equal('a firm KDU verifies nothing global',
  $$select public.verify_simple_ek6_profiles()$$, '0');
select tests.logout();

select tests.login('dddddddd-0000-0000-0000-000000000001');
select tests.expect_equal('the platform admin verifies only the plain rows that have lines',
  $$select public.verify_simple_ek6_profiles()$$, '2');
select tests.expect_equal('the verifier is the signed-in person',
  $$select count(*) from public.classification_profiles where source_reference = 'bulk 64-17-5'
      and verification_status = 'verified' and verified_by = auth.uid() and verified_at is not null$$, '1');
select tests.expect_equal('the noted row and the row without lines stay pending',
  $$select count(*) from public.classification_profiles
      where source_reference in ('bulk 67-56-1', 'bulk 67-63-0') and verification_status = 'pending'$$, '2');
select tests.expect_equal('running it again changes nothing',
  $$select public.verify_simple_ek6_profiles()$$, '0');
select tests.logout();
