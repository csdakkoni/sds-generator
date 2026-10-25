-- PubChem's "Regulation (EC) No 1272/2008" record is a copy of the EU CLP Annex VI table;
-- CLAUDE.md keeps third-party copies of regulation tables out of the product database (the SEA
-- Ek-6 import is the harmonised source). Records the first release of the fetcher stored are
-- removed; the fetcher no longer stores them.
delete from public.substance_source_records
 where source_id = 'pubchem:regulation-ec-no-1272-2008-of-the-european-parliament-and-of';
delete from public.outside_sources
 where source_id = 'pubchem:regulation-ec-no-1272-2008-of-the-european-parliament-and-of';

-- The fetcher now uses only the newest report of a source (NITE-CMC publishes the original and
-- the revised classification); substances read before that are read again on their next lookup.
update public.substances set outside_checked_at = null where outside_checked_at is not null;
