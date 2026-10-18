-- Supplier SDS upload and review (step 5a).
--
-- Additive only: no drops, so it applies without a destructive-change confirmation.

-- A member can hold more than one role: in a small firm the owner is often also the KDU.
alter table public.organization_members
  add column extra_roles public.member_role[] not null default '{}';

create or replace function public.has_org_role(org uuid, roles public.member_role[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid()
      and (m.role = any (roles) or m.extra_roles && roles)
  );
$$;

-- Extraction runs server-side after upload; the review screen follows its progress.
alter table public.raw_material_sds_documents
  add column extraction_status text not null default 'queued'
    check (extraction_status in ('queued', 'running', 'done', 'failed')),
  add column extraction_error text,
  add column page_count int;

-- Private bucket for supplier SDS PDFs. Object paths start with the organization id:
-- <organization_id>/<document_id>.pdf
insert into storage.buckets (id, name, public)
values ('supplier-sds', 'supplier-sds', false)
on conflict (id) do nothing;

-- Organization id from the first path segment; null for any other layout, so a malformed
-- path is denied instead of raising.
create function public.storage_object_org(object_name text)
returns uuid
language plpgsql immutable set search_path = ''
as $$
begin
  return split_part(object_name, '/', 1)::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create policy supplier_sds_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'supplier-sds'
    and public.is_org_member(public.storage_object_org(name))
  );
create policy supplier_sds_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'supplier-sds'
    and public.can_edit_org(public.storage_object_org(name))
  );
create policy supplier_sds_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'supplier-sds'
    and public.has_org_role(public.storage_object_org(name), array['owner', 'editor']::public.member_role[])
  );
