-- Supplier details printed in section 1.3/1.4 of every SDS the firm issues. Additive only.
alter table public.organizations
  add column address text,
  add column phone text,
  add column email text,
  add column emergency_phone text;
