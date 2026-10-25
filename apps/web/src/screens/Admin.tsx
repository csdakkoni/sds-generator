import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Ek6Verification } from './Ek6Verification';
import { RegulationWatch } from './RegulationWatch';

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
  kept?: number;
  /** Hazard class lines mode only. */
  rows?: number;
  lines?: number;
  alreadyHave?: number;
  withSclOrNote?: number;
  unparsed?: { list_no: string; reason: string }[];
  unparsedCount?: number;
}

type Mode = 'substances' | 'profiles' | 'lines';

const MODE_LABEL: Record<Mode, string> = {
  substances: 'maddeler',
  profiles: 'sınıflandırma profilleri',
  lines: 'sınıf satırları',
};

const CHUNK = 500;

/** Platform admin only: loads the SEA Annex 6 library after a dry run and an explicit confirm. */
export function Admin() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [file, setFile] = useState<Ek6File | null>(null);
  const [mode, setMode] = useState<Mode>('substances');
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
  async function send(dryRunMode: boolean, mode: Mode): Promise<Totals> {
    const loaded = await loadFile();
    const totals: Totals = { created: 0, updated: 0 };
    for (let start = 0; start < loaded.entries.length; start += CHUNK) {
      const chunk = loaded.entries.slice(start, start + CHUNK);
      setProgress(`${Math.min(start + CHUNK, loaded.entries.length)} / ${loaded.entries.length}`);
      const { data, error: callError } = await supabase.functions.invoke('import-ek6', {
        body: { entries: chunk, dryRun: dryRunMode, mode },
      });
      if (callError) {
        // The SDK hides the function's body behind a generic message; read it for the reason.
        const detail = await callError.context?.json().catch(() => null);
        throw new Error(detail?.error ?? callError.message);
      }
      const result = data as Totals & { error?: string };
      if (result.error) throw new Error(result.error);
      totals.created += result.created ?? 0;
      totals.updated += result.updated ?? 0;
      totals.kept = (totals.kept ?? 0) + (result.kept ?? 0);
      if (mode === 'lines') {
        totals.rows = (totals.rows ?? 0) + (result.rows ?? 0);
        totals.lines = (totals.lines ?? 0) + (result.lines ?? 0);
        totals.alreadyHave = (totals.alreadyHave ?? 0) + (result.alreadyHave ?? 0);
        totals.withSclOrNote = (totals.withSclOrNote ?? 0) + (result.withSclOrNote ?? 0);
        totals.unparsedCount = (totals.unparsedCount ?? 0) + (result.unparsedCount ?? 0);
        totals.unparsed = [...(totals.unparsed ?? []), ...(result.unparsed ?? [])];
      }
    }
    return totals;
  }

  async function runDryRun(nextMode: Mode) {
    setMode(nextMode);
    setBusy(true);
    setError(null);
    setWritten(null);
    try {
      setDryRun(await send(true, nextMode));
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
      setWritten(await send(false, mode));
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
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Yönetim: SEA Ek-6 kütüphanesi
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Resmî Ek-6 tablosundaki maddeleri ortak kütüphaneye yükler. Önce kuru çalıştırma yap:
          hiçbir şey yazılmaz, yalnızca kaç kayıt ekleneceği ve kaçının güncelleneceği gösterilir.
          "Sınıflandırma profilleri" her madde için bekleyen (onaylanmamış) bir Ek-6 profili açar ve
          tablodaki ham değerleri saklar; KDU onayına kadar hesaplamada kullanılmaz.
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
          onClick={() => void runDryRun('substances')}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:border-sky-300 disabled:opacity-50"
        >
          Kuru çalıştır: maddeler
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runDryRun('profiles')}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:border-sky-300 disabled:opacity-50"
        >
          Kuru çalıştır: sınıflandırma profilleri
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runDryRun('lines')}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:border-sky-300 disabled:opacity-50"
        >
          Kuru çalıştır: sınıf satırları
        </button>
        {dryRun && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void runImport()}
            className="rounded-lg bg-sky-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Onayla ve yaz
          </button>
        )}
        {busy && <span className="text-sm text-slate-500">Çalışıyor… {progress}</span>}
      </div>

      {dryRun && mode !== 'lines' && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Kuru çalıştırma ({MODE_LABEL[mode]}): {dryRun.created} yeni kayıt eklenecek,{' '}
          {dryRun.updated} mevcut kayıt güncellenecek
          {dryRun.kept ? `, ${dryRun.kept} onaylı profil olduğu gibi korunacak` : ''}. Yazmak için
          "Onayla ve yaz"a bas.
        </p>
      )}
      {written && mode !== 'lines' && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Yazıldı: {written.created} yeni, {written.updated} güncellenen
          {written.kept ? `, ${written.kept} korunan` : ''} kayıt.
        </p>
      )}
      {mode === 'lines' && (dryRun ?? written) && (
        <LinesReport totals={(dryRun ?? written) as Totals} done={written !== null} />
      )}

      <Ek6Verification />

      <RegulationWatch />
    </div>
  );
}

/** Result of the "sınıf satırları" step: what was split, what did not reconcile and why. */
function LinesReport({ totals, done }: { totals: Totals; done: boolean }) {
  const unparsed = totals.unparsed ?? [];
  return (
    <div className="grid gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <p>
        {done ? 'Yazıldı' : 'Kuru çalıştırma'}: {totals.rows ?? 0} maddenin sınıflandırması{' '}
        {totals.lines ?? 0} satıra ayrıldı
        {totals.alreadyHave ? `, ${totals.alreadyHave} maddede satırlar zaten vardı` : ''}.{' '}
        {totals.unparsedCount ?? 0} madde çözülemedi; bunlar için hiçbir şey yazılmaz, KDU'ya
        bırakılır.
        {totals.withSclOrNote
          ? ` ${totals.withSclOrNote} maddede özel konsantrasyon sınırı veya dipnot var; bunlar satırlara henüz işlenmedi (KDU kontrolü gerekir).`
          : ''}
        {!done && ' Yazmak için "Onayla ve yaz"a bas.'}
      </p>
      {unparsed.length > 0 && (
        <details>
          <summary className="cursor-pointer">Çözülemeyen maddeler (ilk {unparsed.length})</summary>
          <ul className="mt-1 list-disc pl-5">
            {unparsed.map((u) => (
              <li key={u.list_no}>
                {u.list_no}: {u.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
