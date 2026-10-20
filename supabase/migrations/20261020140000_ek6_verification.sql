-- Bulk verification of the Annex 6 profiles whose classification lines were split from the
-- table (import-ek6, mode "lines"). Both functions run as the caller (security invoker), so
-- row level security and the verification trigger still decide who may verify: only a
-- platform admin may verify global data, and the verifier is always the signed-in person.
--
-- "Simple" means nothing in the row needs a person to interpret it: no specific concentration
-- limit / M-factor text and no note letter. Rows with either stay pending for individual review
-- (TODO(KDU): which note letters change the classification; CLAUDE.md open items).

create function public.ek6_verification_counts()
returns jsonb
language sql stable set search_path = ''
as $$
  with p as (
    select
      pr.verification_status,
      exists (select 1 from public.substance_classifications l where l.profile_id = pr.id) as has_lines,
      (pr.source_snapshot ->> 'scl_m_text') is null and (pr.source_snapshot ->> 'note') is null as plain
    from public.classification_profiles pr
    where pr.source_type = 'harmonised' and pr.effective_to is null
  )
  select jsonb_build_object(
    'pending_simple', count(*) filter (where verification_status = 'pending' and has_lines and plain),
    'pending_needs_review', count(*) filter (where verification_status = 'pending' and has_lines and not plain),
    'pending_without_lines', count(*) filter (where verification_status = 'pending' and not has_lines),
    'verified', count(*) filter (where verification_status = 'verified')
  )
  from p;
$$;

create function public.verify_simple_ek6_profiles()
returns integer
language plpgsql set search_path = ''
as $$
declare
  changed integer;
begin
  update public.classification_profiles pr
     set verification_status = 'verified',
         verified_by = auth.uid(),
         verified_at = now()
   where pr.source_type = 'harmonised'
     and pr.effective_to is null
     and pr.verification_status = 'pending'
     and (pr.source_snapshot ->> 'scl_m_text') is null
     and (pr.source_snapshot ->> 'note') is null
     and exists (select 1 from public.substance_classifications l where l.profile_id = pr.id);
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.verify_simple_ek6_profiles() from public, anon;
grant execute on function public.verify_simple_ek6_profiles() to authenticated;
revoke all on function public.ek6_verification_counts() from public, anon;
grant execute on function public.ek6_verification_counts() to authenticated;
