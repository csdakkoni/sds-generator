-- SEA Annex 6 list number (Ek-6 "Indeks No", e.g. 001-001-00-9) as the unique library key.
-- Library-only identifier: it is never printed on an SDS. Additive only.
alter table public.substances
  add column list_no text unique;
