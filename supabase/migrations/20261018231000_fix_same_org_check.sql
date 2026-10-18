-- check_same_org read new.sds_document_id inside an `and` that PL/pgSQL does not
-- short-circuit, so every insert into raw_material_sds_documents (which has no such
-- column) failed with 'record "new" has no field "sds_document_id"'. Nest the check.
create or replace function public.check_same_org()
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
    if tg_table_name = 'raw_material_components' then
      if new.sds_document_id is not null then
        select organization_id into parent_org from public.raw_material_sds_documents where id = new.sds_document_id;
        if parent_org is distinct from new.organization_id then
          raise exception 'SDS document belongs to another organization';
        end if;
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
