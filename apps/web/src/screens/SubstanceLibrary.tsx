import { useEffect, useState } from 'react';
import { isValidCas } from '../lib/cas';
import { fetchOutside } from '../lib/outside';
import { supabase } from '../lib/supabase';

interface Substance {
  list_no: string | null;
  name: string;
  synonyms: string[];
  ec_number: string | null;
  cas_number: string | null;
}

const PAGE = 50;

/** Read-only view of the global substance library, searchable by name, CAS, EC or list number. */
export function SubstanceLibrary() {
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [rows, setRows] = useState<Substance[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A CAS number that is not in the library yet is looked up at PubChem and added.
  const [fetching, setFetching] = useState<string | null>(null);
  const [fetched, setFetched] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    void supabase
      .from('substances')
      .select('*', { count: 'exact', head: true })
      .then(({ count }) => {
        if (active) setTotal(count);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    // The search runs in the database so it also matches the Turkish name (in synonyms)
    // and ignores Turkish case and diacritics.
    const request = supabase
      .rpc('search_substances', { q: query.trim(), max_rows: shown })
      .select('list_no, name, synonyms, ec_number, cas_number');
    void request.then(({ data, error: loadError }) => {
      if (!active) return;
      if (loadError) {
        setError(loadError.message);
        setRows([]);
      } else {
        setError(null);
        const found = (data ?? []) as Substance[];
        setRows(found);
        const cas = query.trim();
        if (found.length === 0 && isValidCas(cas) && !fetched.includes(cas)) {
          setFetching(cas);
          void fetchOutside(cas).then((r) => {
            if (!active) return;
            setFetching(null);
            setFetched((f) => [...f, cas]);
            if (r.error) setError(`PubChem'e ulaşılamadı: ${r.error}`);
          });
        }
      }
    });
    return () => {
      active = false;
    };
  }, [query, shown, total, fetched]);

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Kütüphane</h2>
        <span className="text-sm text-slate-500">
          {total === null ? '' : `Toplam ${total} madde`}
        </span>
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => {
          // A new search starts again from the first page.
          setQuery(e.target.value);
          setShown(PAGE);
        }}
        placeholder="Ad, CAS, EC veya liste no ile ara (yeni CAS otomatik eklenir)"
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
      />
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Liste no</th>
              <th className="px-3 py-2 font-semibold">Ad (EN)</th>
              <th className="px-3 py-2 font-semibold">Ad (TR)</th>
              <th className="px-3 py-2 font-semibold">EC</th>
              <th className="px-3 py-2 font-semibold">CAS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.list_no ?? r.name} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 font-mono text-xs">{r.list_no ?? '—'}</td>
                <td className="px-3 py-2">
                  {r.cas_number ? (
                    <a href={`#/kutuphane/${r.cas_number}`} className="text-sky-800 underline">
                      {r.name}
                    </a>
                  ) : (
                    r.name
                  )}
                </td>
                <td className="px-3 py-2">{r.synonyms[0] ?? '—'}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.ec_number ?? '—'}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.cas_number ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !error && (
          <p className="px-3 py-4 text-sm text-slate-500">
            {fetching
              ? `${fetching} kütüphanede yok; PubChem'de aranıyor ve kaydediliyor…`
              : 'Eşleşen madde yok. CAS numarası yazarsan PubChem’de aranır ve kütüphaneye eklenir.'}
          </p>
        )}
      </div>
      {rows.length === shown && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="justify-self-start rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:border-sky-300"
        >
          Daha fazla göster
        </button>
      )}
    </section>
  );
}
