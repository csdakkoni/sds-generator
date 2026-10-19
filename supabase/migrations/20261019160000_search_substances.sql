-- Library search that also matches the Turkish name (stored in synonyms) and ignores
-- Turkish case and diacritics, so "siloksan", "SİLOKSAN" and "oktametilsiklotetrasiloksan"
-- all find their rows. Additive only: two new functions, no table changes.

-- Lower-cases and maps Turkish letters to plain ASCII (İ/I/ı -> i, ş -> s, ç -> c, ğ -> g, ö -> o, ü -> u).
create function public.search_fold(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(translate(coalesce(value, ''), 'İIıŞşÇçĞğÖöÜü', 'iiissccggoouu'));
$$;

-- Runs with the caller's rights, so the substances RLS policy still applies.
create function public.search_substances(q text, max_rows integer default 50)
returns setof public.substances
language sql
stable
set search_path = ''
as $$
  select s.*
  from public.substances s
  where coalesce(trim(q), '') = ''
     or strpos(
          public.search_fold(
            concat_ws(' ', s.name, array_to_string(s.synonyms, ' '), s.cas_number, s.ec_number, s.list_no)
          ),
          public.search_fold(trim(q))
        ) > 0
  order by s.list_no nulls last
  limit greatest(max_rows, 0);
$$;
