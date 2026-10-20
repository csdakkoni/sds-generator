-- Approved SDS PDFs are stored once, when the KDU approves a revision, and never replaced.
-- Object path: <organization_id>/<sds_document_id>/rev<N>.pdf

insert into storage.buckets (id, name, public)
values ('sds-pdf', 'sds-pdf', false)
on conflict (id) do nothing;

create policy sds_pdf_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'sds-pdf'
    and public.is_org_member(public.storage_object_org(name))
  );
-- Only the firm's KDU writes approved PDFs. There is no update or delete policy: stored
-- files are evidence of what was approved.
create policy sds_pdf_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'sds-pdf'
    and public.has_org_role(public.storage_object_org(name), array['kdu']::public.member_role[])
  );

-- pdf_path may be set only on an approved revision, and only once.
create function public.check_revision_pdf_path()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.pdf_path is distinct from old.pdf_path then
    if old.pdf_path is not null then
      raise exception 'the stored PDF of a revision cannot be replaced';
    end if;
    if new.approved_by is null then
      raise exception 'only an approved revision has a stored PDF';
    end if;
  end if;
  return new;
end;
$$;

create trigger sds_revisions_pdf_path before update on public.sds_revisions
  for each row execute function public.check_revision_pdf_path();
