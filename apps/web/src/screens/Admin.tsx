import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { RegulationWatch } from './RegulationWatch';
import { SubstanceLibrary } from './SubstanceLibrary';

interface Ek6File {
  count: number;
  entries: {
    list_no: string;
    name_en: string;
    name_tr: string;
    ec: string | null;
    cas: string | null;
  }[];
}

interface Totals {
  created: number;
  updated: number;
}

const CHUNK = 500;

/** Platform admin only: loads the SEA Annex 6 library after a dry run and an explicit confirm. */
export function Admin() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [file, setFile] = useState<Ek6File | null>(null);
  const [dryRun, setDryRun] = useState<Totals | null>(null);
  const [written, setWritten] = useState<Totals | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.rpc('is_platform_admin').then(({ data }) => {
      if (active) setAllowed(data === true);
    });
    return () => {
      active = false;
    };
  }, []);

  async function loadFile(): Promise<Ek6File> {
    if (file) return file;
    const response = await fetch(`${import.meta.env.BASE_URL}ek6/sea-ek6-substances.json`);
    if (!response.ok) throw new Error('Ek-6 dosyası okunamadı.');
    const loaded = (await response.json()) as Ek6File;
    setFile(loaded);
    return loaded;
  }

  /** Sends the entries in chunks; with dryRun the server only counts. */
  async function send(dryRunMode: boolean): Promise<Totals> {
    const loaded = await loadFile();
    const totals: Totals = { created: 0, updated: 0 };
    for (let start = 0; start < loaded.entries.length; start += CHUNK) {
      const chunk = loaded.entries.slice(start, start + CHUNK);
      setProgress(`${Math.min(start + CHUNK, loaded.entries.length)} / ${loaded.entries.length}`);
      const { data, error: callError } = await supabase.functions.invoke('import-ek6', {
        body: { entries: chunk, dryRun: dryRunMode },
      });
      if (callError) {
        // The SDK hides the function's body behind a generic message; read it for the reason.
        const detail = await callError.context?.json().catch(() => null);
        throw new Error(detail?.error ?? callError.message);
      }
      const result = data as Totals & { error?: string };
      if (result.error) throw new Error(result.error);
      totals.created += result.created;
      totals.updated += result.updated;
    }
    return totals;
  }

  async function runDryRun() {
    setBusy(true);
    setError(null);
    setWritten(null);
    try {
      setDryRun(await send(true));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  async function runImport() {
    setBusy(true);
    setError(null);
    try {
      setWritten(await send(false));
      setDryRun(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  if (allowed === null) return null;
  if (!allowed)
    return (
      <p className="text-sm text-slate-500">Bu sayfa yalnızca platform yöneticisine açıktır.</p>
    );

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Yönetim: SEA Ek-6 kütüphanesi</h1>
        <p className="mt-1 text-sm text-slate-500">
          Resmî Ek-6 tablosundaki maddeleri ortak kütüphaneye yükler. Önce kuru çalıştırma yap:
          hiçbir şey yazılmaz, yalnızca kaç kayıt ekleneceği ve kaçının güncelleneceği gösterilir.
          Sınıflandırmalar bu adımda yazılmaz; KDU incelemesinden sonra ayrıca girilir.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void runDryRun()}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:border-sky-300 disabled:opacity-50"
        >
          Kuru çalıştır
        </button>
        {dryRun && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void runImport()}
            className="rounded-md bg-sky-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Onayla ve yaz
          </button>
        )}
        {busy && <span className="text-sm text-slate-500">Çalışıyor… {progress}</span>}
      </div>

      {dryRun && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Kuru çalıştırma: {dryRun.created} yeni kayıt eklenecek, {dryRun.updated} mevcut kayıt
          güncellenecek. Yazmak için "Onayla ve yaz"a bas.
        </p>
      )}
      {written && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Yazıldı: {written.created} yeni, {written.updated} güncellenen kayıt.
        </p>
      )}

      <RegulationWatch />

      <SubstanceLibrary />
    </div>
  );
}
