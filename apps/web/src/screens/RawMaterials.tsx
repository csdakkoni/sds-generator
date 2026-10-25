import { useCallback, useEffect, useState } from 'react';
import { canEdit, hasRole, materialState, nameFromFile, type MaterialState } from '../lib/review';
import { isValidCas } from '../lib/cas';
import { kduState, lookupCas, type CasInfo } from '../lib/cas-lookup';
import { confirmOutside, ensureReviewItem } from '../lib/outside';
import { supabase } from '../lib/supabase';
import type { Membership, RawMaterial } from '../lib/types';

const SELECT =
  'id, trade_name, supplier_name, raw_material_components (id, name_as_written, cas_number, concentration_min, concentration_max, sds_document_id), raw_material_sds_documents (id, status, extraction_status, flags, uploaded_at, revision_number, revision_date)';

function StatePill({ state }: { state: MaterialState }) {
  const map: Record<MaterialState['kind'], [string, string]> = {
    no_document: ['SDS yok', 'bg-slate-100 text-slate-600'],
    by_cas: ['CAS ile girildi', 'bg-violet-50 text-violet-800'],
    reading: ['Okunuyor…', 'bg-sky-50 text-sky-800'],
    failed: ['Okunamadı', 'bg-red-50 text-red-700'],
    questions: ['', 'bg-amber-50 text-amber-800'],
    ready: ['KDU onayı bekliyor', 'bg-amber-50 text-amber-800'],
    approved: ['Onaylandı', 'bg-emerald-50 text-emerald-800'],
  };
  const [label, cls] = map[state.kind];
  return (
    <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>
      {state.kind === 'questions' ? `${state.open} soru bekliyor` : label}
    </span>
  );
}

export function RawMaterials({
  membership,
  userId,
  onOpen,
}: {
  membership: Membership;
  userId: string;
  onOpen: (rawMaterialId: string) => void;
}) {
  const [items, setItems] = useState<RawMaterial[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string[]>([]);
  const editable = canEdit(membership);
  const canDelete = hasRole(membership, 'owner') || hasRole(membership, 'editor');

  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let active = true;
    void supabase
      .from('raw_materials')
      .select(SELECT)
      .eq('organization_id', membership.organization_id)
      .order('created_at', { ascending: false })
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError(loadError.message);
        else setItems(data as RawMaterial[]);
      });
    return () => {
      active = false;
    };
  }, [membership.organization_id, version]);

  // Follow server-side reading until every SDS is done.
  const reading = items?.some((m) => materialState(m).kind === 'reading') ?? false;
  useEffect(() => {
    if (!reading) return;
    const timer = setInterval(reload, 5000);
    return () => clearInterval(timer);
  }, [reading, reload]);

  async function remove(m: RawMaterial) {
    if (!window.confirm(`"${m.trade_name}" silinsin mi?`)) return;
    setError(null);
    const { data, error: deleteError } = await supabase
      .from('raw_materials')
      .delete()
      .eq('id', m.id)
      .select('id');
    if (deleteError) {
      setError(
        deleteError.code === '23503'
          ? `${m.trade_name}: bir ürün reçetesinde kullanıldığı için silinemez.`
          : `${m.trade_name} silinemedi: ${deleteError.message}`,
      );
    } else if (!data?.length) {
      setError(`${m.trade_name} silinemedi: bu işlem için yetkin yok.`);
    }
    reload();
  }

  async function upload(files: FileList | null) {
    if (!files) return;
    const pdfs = [...files].filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    setError(null);
    setUploading(pdfs.map((f) => f.name));
    for (const file of pdfs) {
      const result = await uploadOne(membership.organization_id, file);
      if (result) setError(result);
      setUploading((u) => u.filter((n) => n !== file.name));
      reload();
    }
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Hammaddeler</h1>
        <p className="mt-1 text-sm text-slate-500">
          Tedarikçi SDS'lerini yükle. Sistem okur ve yalnızca emin olmadığı noktaları sorar.
        </p>
      </div>
      {editable && (
        <label
          htmlFor="sds-files"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void upload(e.dataTransfer.files);
          }}
          className="cursor-pointer rounded-lg border-2 border-dashed border-slate-300 bg-white p-6 text-center text-slate-500 hover:border-sky-800 hover:text-slate-800"
        >
          PDF dosyalarını buraya sürükle ya da <b>seçmek için tıkla</b>
          <input
            id="sds-files"
            type="file"
            accept="application/pdf"
            multiple
            hidden
            onChange={(e) => void upload(e.target.files)}
          />
        </label>
      )}
      {editable && (
        <CasForm
          organizationId={membership.organization_id}
          userId={userId}
          isKdu={hasRole(membership, 'kdu')}
          onDone={reload}
          onError={setError}
        />
      )}
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <section className="rounded-lg border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
          Kütüphanen {items ? `(${items.length})` : ''}
        </h2>
        {uploading.map((name) => (
          <div
            key={name}
            className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3"
          >
            <span className="truncate">{name}</span>
            <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
              Yükleniyor…
            </span>
          </div>
        ))}
        {items === null && <p className="px-4 py-6 text-sm text-slate-500">Yükleniyor…</p>}
        {items?.length === 0 && uploading.length === 0 && (
          <p className="px-4 py-6 text-sm text-slate-500">
            Henüz hammadde yok. İlk tedarikçi SDS'ini yukarıdan yükle.
          </p>
        )}
        {items?.map((m) => {
          const doc = m.raw_material_sds_documents[0];
          const state = materialState(m);
          return (
            <div
              key={m.id}
              className="flex items-center border-b border-slate-100 last:border-0 hover:bg-slate-50"
            >
              <button
                type="button"
                onClick={() => onOpen(m.id)}
                className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="min-w-0">
                  <b className="block truncate">{m.trade_name}</b>
                  <small className="text-slate-500">
                    {[
                      m.supplier_name,
                      doc?.revision_number && `sürüm ${doc.revision_number}`,
                      doc?.revision_date,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Tedarikçi SDS'}
                  </small>
                </span>
                <StatePill state={state} />
              </button>
              {canDelete && (state.kind === 'no_document' || state.kind === 'by_cas') && (
                <button
                  type="button"
                  onClick={() => void remove(m)}
                  className="mr-4 text-xs text-red-700 underline"
                >
                  Sil
                </button>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

/** Uploads one PDF and starts server-side reading; returns an error message or null. */
async function uploadOne(organizationId: string, file: File): Promise<string | null> {
  const { data: material, error: rmError } = await supabase
    .from('raw_materials')
    .insert({ organization_id: organizationId, trade_name: nameFromFile(file.name) })
    .select('id')
    .single();
  if (rmError || !material)
    return `${file.name}: hammadde kaydı oluşturulamadı (${rmError?.message}).`;

  const documentId = crypto.randomUUID();
  const path = `${organizationId}/${documentId}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from('supplier-sds')
    .upload(path, file, { contentType: 'application/pdf' });
  // A failed step removes what was already created, so no empty "SDS yok" entry is left.
  const undo = async (withFile: boolean) => {
    if (withFile) await supabase.storage.from('supplier-sds').remove([path]);
    await supabase.from('raw_materials').delete().eq('id', material.id);
  };
  if (uploadError) {
    await undo(false);
    return `${file.name}: dosya yüklenemedi (${uploadError.message}).`;
  }

  const { error: docError } = await supabase.from('raw_material_sds_documents').insert({
    id: documentId,
    organization_id: organizationId,
    raw_material_id: material.id,
    storage_path: path,
    file_name: file.name,
  });
  if (docError) {
    await undo(true);
    return `${file.name}: kayıt oluşturulamadı (${docError.message}).`;
  }

  const { error: fnError } = await supabase.functions.invoke('extract-supplier-sds', {
    body: { documentId },
  });
  if (fnError) return `${file.name}: okuma başlatılamadı (${fnError.message}).`;
  return null;
}

interface CasRow {
  info?: CasInfo | 'searching' | undefined;
  name: string;
  cas: string;
  min: string;
  max: string;
}

const emptyRow = (): CasRow => ({ name: '', cas: '', min: '', max: '' });
const toNumber = (s: string) => Number(s.replace(',', '.').trim());

/** Adds a raw material from known CAS numbers, for when no supplier SDS is at hand. */
function CasForm({
  organizationId,
  userId,
  isKdu,
  onDone,
  onError,
}: {
  organizationId: string;
  userId: string;
  isKdu: boolean;
  onDone: () => void;
  onError: (message: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tradeName, setTradeName] = useState('');
  const [rows, setRows] = useState<CasRow[]>([emptyRow()]);
  const [problems, setProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const setRow = (i: number, patch: Partial<CasRow>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  /** Fills the name from the library or PubChem as soon as a valid CAS number is typed. */
  async function lookUp(i: number, cas: string) {
    const number = cas.trim();
    if (!isValidCas(number)) return;
    setRow(i, { info: 'searching' });
    const info = await lookupCas(number, organizationId);
    setRows((rs) =>
      rs.map((r, j) =>
        j === i && r.cas.trim() === number
          ? { ...r, info, name: r.name.trim() === '' && info.name ? info.name : r.name }
          : r,
      ),
    );
  }

  /** One click for a KDU when independent sources agree (UX principle 5). */
  async function confirm(i: number, info: CasInfo) {
    if (!info.summary || !info.substanceId) return;
    onError(null);
    const failed = await confirmOutside({
      organizationId,
      userId,
      substanceId: info.substanceId,
      summary: info.summary,
      lines: info.summary.draftLines.map((l) => ({ category: l.category, hCode: l.hCode })),
      choice: 'kaynaklar uyumlu, önerilen sınıflandırma kabul edildi',
    });
    if (failed) onError(failed);
    else await lookUp(i, rows[i]?.cas ?? '');
  }

  async function save() {
    const found: string[] = [];
    if (!tradeName.trim()) found.push('Hammadde adı boş.');
    rows.forEach((r, i) => {
      const n = i + 1;
      if (!r.name.trim()) found.push(`${n}. satır: bileşen adı boş.`);
      if (!isValidCas(r.cas))
        found.push(`${n}. satır: CAS numarası geçersiz (kontrol hanesi tutmuyor).`);
      const min = r.min.trim() === '' ? null : toNumber(r.min);
      const max = r.max.trim() === '' ? null : toNumber(r.max);
      if ((min !== null && !Number.isFinite(min)) || (max !== null && !Number.isFinite(max)))
        found.push(`${n}. satır: oran okunamadı.`);
      else if ((min !== null && (min < 0 || min > 100)) || (max !== null && (max < 0 || max > 100)))
        found.push(`${n}. satır: oran 0 ile 100 arasında olmalı.`);
      else if (min !== null && max !== null && min > max)
        found.push(`${n}. satır: alt oran üst orandan büyük.`);
    });
    setProblems(found);
    if (found.length > 0) return;

    setSaving(true);
    onError(null);
    const { data: material, error: rmError } = await supabase
      .from('raw_materials')
      .insert({ organization_id: organizationId, trade_name: tradeName.trim() })
      .select('id')
      .single();
    if (rmError || !material) {
      setSaving(false);
      onError(`Hammadde kaydı oluşturulamadı (${rmError?.message}).`);
      return;
    }
    // Every component is looked up, so the library has it and the KDU list knows what waits.
    const infos = await Promise.all(
      rows.map((r) =>
        r.info && r.info !== 'searching' ? r.info : lookupCas(r.cas.trim(), organizationId),
      ),
    );
    const { error: compError } = await supabase.from('raw_material_components').insert(
      rows.map((r, i) => ({
        organization_id: organizationId,
        raw_material_id: material.id,
        substance_id: infos[i]?.substanceId ?? null,
        name_as_written: r.name.trim(),
        cas_number: r.cas.trim(),
        concentration_min: r.min.trim() === '' ? null : toNumber(r.min),
        concentration_max: r.max.trim() === '' ? null : toNumber(r.max),
        concentration_raw: `${r.min.trim()}–${r.max.trim()}`,
      })),
    );
    if (compError) {
      // No half-made raw material is left behind.
      await supabase.from('raw_materials').delete().eq('id', material.id);
      setSaving(false);
      onError(`Bileşenler kaydedilemedi (${compError.message}).`);
      return;
    }
    await Promise.all(
      infos.map((info, i) =>
        info.substanceId && kduState(info) === 'list'
          ? ensureReviewItem({
              organizationId,
              substanceId: info.substanceId,
              cas: rows[i]?.cas.trim() ?? '',
              name: info.name ?? rows[i]?.name.trim() ?? '',
              summary: info.summary ?? undefined,
            })
          : Promise.resolve(),
      ),
    );
    setSaving(false);
    setOpen(false);
    setTradeName('');
    setRows([emptyRow()]);
    onDone();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="justify-self-start text-sm font-semibold text-sky-800 underline"
      >
        SDS'im yok, CAS numarasıyla hammadde ekle
      </button>
    );
  }

  const input = 'rounded-md border border-slate-300 px-2 py-1 text-sm';
  return (
    <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
        CAS numarasıyla hammadde
      </h2>
      <p className="text-sm text-slate-500">
        CAS numarasını yaz: ad ve dış kaynak kayıtları otomatik bulunur. Sınıflandırma SEA Ek-6'dan
        gelir; Ek-6'da olmayan maddeler için dış kaynaklar taslakta kullanılır ve KDU onayına kadar
        SDS taslak kalır. Hiç veri yoksa "veri yok" uyarısı çıkar. Oranı bilmiyorsan boş bırak.
      </p>
      <label className="grid gap-1 text-sm">
        Hammadde adı
        <input className={input} value={tradeName} onChange={(e) => setTradeName(e.target.value)} />
      </label>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[2fr_1.2fr_0.7fr_0.7fr_auto] items-end gap-2">
          <label className="grid gap-1 text-xs">
            Bileşen adı
            <input
              className={input}
              value={r.name}
              onChange={(e) => setRow(i, { name: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-xs">
            CAS
            <input
              className={input}
              value={r.cas}
              placeholder="67-64-1"
              onChange={(e) => setRow(i, { cas: e.target.value, info: undefined })}
              onBlur={(e) => void lookUp(i, e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs">
            En az %
            <input
              className={input}
              value={r.min}
              onChange={(e) => setRow(i, { min: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-xs">
            En çok %
            <input
              className={input}
              value={r.max}
              onChange={(e) => setRow(i, { max: e.target.value })}
            />
          </label>
          {rows.length > 1 && (
            <button
              type="button"
              className="pb-1 text-xs text-red-700 underline"
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
            >
              Kaldır
            </button>
          )}
          {r.info && (
            <small className="col-span-full text-slate-500">
              {r.info === 'searching' ? (
                'Aranıyor (kütüphane ve PubChem)…'
              ) : (
                <>
                  {r.info.message}{' '}
                  <a href={`#/kutuphane/${r.cas.trim()}`} className="text-sky-800 underline">
                    Madde sayfası
                  </a>
                  {isKdu && kduState(r.info) === 'one_click' && (
                    <button
                      type="button"
                      onClick={() => r.info && r.info !== 'searching' && void confirm(i, r.info)}
                      className="ml-2 font-semibold text-emerald-800 underline"
                    >
                      Onayla
                    </button>
                  )}
                </>
              )}
            </small>
          )}
        </div>
      ))}
      <button
        type="button"
        className="justify-self-start text-xs font-semibold text-sky-800 underline"
        onClick={() => setRows((rs) => [...rs, emptyRow()])}
      >
        + Bileşen ekle
      </button>
      {problems.length > 0 && (
        <ul role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-md bg-sky-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-slate-600 underline"
        >
          Vazgeç
        </button>
      </div>
    </section>
  );
}
