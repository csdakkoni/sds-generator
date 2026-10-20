import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Counts {
  pending_simple: number;
  pending_needs_review: number;
  pending_without_lines: number;
  verified: number;
}

/**
 * Platform admin (acting as KDU): verifies the Annex 6 profiles whose class lines were split
 * from the table. Only rows with no concentration-limit text and no note letter are verified
 * in bulk; the rest stay pending for individual review. The database records who verified.
 */
export function Ek6Verification() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.rpc('ek6_verification_counts');
    if (loadError) setError(loadError.message);
    else setCounts(data as Counts);
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void load();
    });
    return () => {
      active = false;
    };
  }, [load]);

  async function verify() {
    setBusy(true);
    setError(null);
    const { data, error: verifyError } = await supabase.rpc('verify_simple_ek6_profiles');
    if (verifyError) setError(verifyError.message);
    else setDone(data as number);
    await load();
    setBusy(false);
  }

  if (!counts) return error ? <p className="text-sm text-red-700">{error}</p> : null;

  return (
    <section className="grid gap-3 rounded-md border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-semibold text-slate-900">Ek-6 profillerini doğrula</h2>
      <p className="text-sm text-slate-600">
        Doğrulanan profil hesaplamada kullanılabilir; doğrulayan kişi ve zaman kaydedilir. Toplu
        doğrulama yalnızca özel konsantrasyon sınırı ve dipnot harfi olmayan, sınıf satırları
        yazılmış profilleri kapsar. Diğerleri tek tek KDU kontrolüne kalır.
      </p>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <ul className="text-sm text-slate-700">
        <li>Toplu doğrulanabilir: {counts.pending_simple}</li>
        <li>
          Dipnot veya özel konsantrasyon sınırı var, tek tek kontrol gerekir:{' '}
          {counts.pending_needs_review}
        </li>
        <li>Sınıf satırı yazılamadı, KDU'ya kalır: {counts.pending_without_lines}</li>
        <li>Doğrulanmış: {counts.verified}</li>
      </ul>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy || counts.pending_simple === 0}
          onClick={() => void verify()}
          className="rounded-md bg-sky-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {counts.pending_simple} profili doğrula
        </button>
        {done !== null && (
          <span className="text-sm text-emerald-800">{done} profil doğrulandı.</span>
        )}
      </div>
    </section>
  );
}
