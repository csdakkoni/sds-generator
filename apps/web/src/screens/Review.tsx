import { hCodeOptions, isHazardCategory } from '@sds/classification-engine';
import { useCallback, useEffect, useState } from 'react';
import { canEdit, FLAG_KIND, hasRole, openFlags } from '../lib/review';
import { supabase } from '../lib/supabase';
import type { ClassificationLine, Flag, Membership, SdsDocument } from '../lib/types';

const PROPS: [string, string][] = [
  ['physical_state', 'Fiziksel hâl'],
  ['ph', 'pH'],
  ['flash_point', 'Parlama noktası'],
  ['density', 'Yoğunluk'],
];

const TONE = {
  bad: 'bg-red-50 text-red-700',
  warn: 'bg-amber-50 text-amber-800',
  info: 'bg-sky-50 text-sky-800',
};

function PageLink({
  page,
  onShow,
}: {
  page: number | null | undefined;
  onShow: (p: number) => void;
}) {
  if (!page) return null;
  return (
    <button type="button" onClick={() => onShow(page)} className="text-xs text-sky-800 underline">
      s. {page}
    </button>
  );
}

/** Statements the KDU can pick when the SDS lists a category without its H code. */
function pickableCodes(line: ClassificationLine): string[] {
  const category = line.category?.trim();
  if (line.hCode || !category || !isHazardCategory(category)) return [];
  const options = hCodeOptions(category);
  return options.length > 1 ? options : [];
}

function HCodePicker({
  line,
  onPick,
}: {
  line: ClassificationLine;
  onPick: ((code: string) => void) | null;
}) {
  const options = pickableCodes(line);
  if (!onPick || options.length === 0) return null;
  return (
    <select
      aria-label={`${line.category} için H kodu`}
      defaultValue=""
      onChange={(e) => e.target.value && onPick(e.target.value)}
      className="rounded-md border border-amber-400 bg-amber-50 px-1.5 py-0.5 text-xs"
    >
      <option value="">H kodu seç…</option>
      {options.map((code) => (
        <option key={code} value={code}>
          {code}
        </option>
      ))}
    </select>
  );
}

function HazardChip({
  line,
  onShow,
  onPick,
}: {
  line: ClassificationLine;
  onShow: (p: number) => void;
  onPick: ((code: string) => void) | null;
}) {
  return (
    <li className="flex items-center gap-2 rounded-md border border-slate-200 py-1.5 pr-3 pl-1.5">
      {line.hCode ? (
        <span className="rounded border-2 border-red-700 bg-red-50 px-1.5 py-0.5 font-mono text-xs font-bold text-red-700">
          {line.hCode}
        </span>
      ) : (
        <span
          title="Belgede H kodu bu sınıfın yanında yazmıyor; uzman eşleştirecek"
          className="rounded border-2 border-dashed border-slate-300 px-1.5 py-0.5 font-mono text-xs font-bold text-slate-500"
        >
          H ?
        </span>
      )}
      <span className="grid leading-tight">
        <b className="text-sm">{line.category ?? line.hazardClassAsWritten}</b>
        <PageLink page={line.source.page} onShow={onShow} />
      </span>
      <HCodePicker line={line} onPick={onPick} />
    </li>
  );
}

export function Review({
  membership,
  userId,
  rawMaterialId,
  onBack,
}: {
  membership: Membership;
  userId: string;
  rawMaterialId: string;
  onBack: () => void;
}) {
  const [name, setName] = useState('');
  const [doc, setDoc] = useState<SdsDocument | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const editable = canEdit(membership);
  const isKdu = hasRole(membership, 'kdu');

  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let active = true;
    void supabase
      .from('raw_materials')
      .select('trade_name')
      .eq('id', rawMaterialId)
      .single()
      .then(({ data }) => {
        if (active && data) setName(data.trade_name);
      });
    void supabase
      .from('raw_material_sds_documents')
      .select('*')
      .eq('raw_material_id', rawMaterialId)
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error: docError }) => {
        if (!active) return;
        if (docError) setError(docError.message);
        setDoc(data as SdsDocument | null);
      });
    return () => {
      active = false;
    };
  }, [rawMaterialId, version]);

  useEffect(() => {
    if (!doc?.storage_path) return;
    void supabase.storage
      .from('supplier-sds')
      .createSignedUrl(doc.storage_path, 3600)
      .then(({ data }) => setPdfUrl(data?.signedUrl ?? null));
  }, [doc?.storage_path]);

  const running = doc && doc.extraction_status !== 'done' && doc.extraction_status !== 'failed';
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(reload, 5000);
    return () => clearInterval(timer);
  }, [running, reload]);

  async function saveFlags(flags: Flag[]) {
    if (!doc) return;
    const { error: saveError } = await supabase
      .from('raw_material_sds_documents')
      .update({ flags })
      .eq('id', doc.id);
    if (saveError) setError(saveError.message);
    else setDoc({ ...doc, flags });
  }

  /** Records the KDU's choice of H code for a line the SDS listed without one. */
  async function setHCode(component: number | null, index: number, code: string) {
    if (!doc?.extraction) return;
    const x = structuredClone(doc.extraction);
    const lines =
      component === null ? x.productClassification.lines : x.components[component]?.classifications;
    const target = lines?.[index];
    if (!target) return;
    target.hCode = code;
    target.hCodeChosenBy = { by: userId, at: new Date().toISOString() };
    const { error: saveError } = await supabase
      .from('raw_material_sds_documents')
      .update({ extraction: x })
      .eq('id', doc.id);
    if (saveError) setError(saveError.message);
    else setDoc({ ...doc, extraction: x });
  }

  function resolve(index: number, status: 'accepted' | 'needs_fix' | null) {
    if (!doc) return;
    const flags = doc.flags.map((f, i) => {
      if (i !== index) return f;
      if (status === null) {
        const rest = { ...f };
        delete rest.resolution;
        return rest;
      }
      return {
        ...f,
        resolution: {
          status,
          note: notes[index]?.trim() || null,
          by: userId,
          at: new Date().toISOString(),
        },
      };
    });
    void saveFlags(flags);
  }

  async function approve() {
    if (!doc) return;
    const { error: approveError } = await supabase
      .from('raw_material_sds_documents')
      .update({ status: 'approved', approved_by: userId, approved_at: new Date().toISOString() })
      .eq('id', doc.id);
    if (approveError) setError(`Onaylanamadı: ${approveError.message}`);
    else reload();
  }

  async function retry() {
    if (!doc) return;
    setError(null);
    const { error: fnError } = await supabase.functions.invoke('extract-supplier-sds', {
      body: { documentId: doc.id },
    });
    if (fnError) setError(`Okuma başlatılamadı: ${fnError.message}`);
    reload();
  }

  const x = doc?.extraction;
  const open = doc ? openFlags(doc.flags) : 0;
  const needsFix = doc?.flags.filter((f) => f.resolution?.status === 'needs_fix').length ?? 0;

  return (
    <div className="grid gap-4">
      <button type="button" onClick={onBack} className="justify-self-start text-sm text-sky-800">
        ← Hammaddeler
      </button>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">{name}</h1>
        {doc?.status === 'approved' && (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
            Onaylandı
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {!doc && <p className="text-sm text-slate-500">Bu hammadde için SDS yok.</p>}
      {doc && running && (
        <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-800">
          SDS okunuyor. Bu genellikle bir iki dakika sürer; sayfa kendiliğinden yenilenir.
        </p>
      )}
      {doc?.extraction_status === 'failed' && (
        <div className="grid gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <p>SDS okunamadı: {doc.extraction_error}</p>
          {editable && (
            <button
              type="button"
              onClick={() => void retry()}
              className="justify-self-start underline"
            >
              Yeniden oku
            </button>
          )}
        </div>
      )}
      {doc && (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className="order-2 min-w-0 rounded-lg border border-slate-200 bg-white lg:sticky lg:top-4 lg:order-1">
            <h2 className="border-b border-slate-200 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              Kaynak belge · sayfa {page}
            </h2>
            {pdfUrl ? (
              <iframe
                key={page}
                title="Tedarikçi SDS"
                src={`${pdfUrl}#page=${page}`}
                className="h-[75vh] w-full"
              />
            ) : (
              <p className="px-4 py-6 text-sm text-slate-500">PDF yükleniyor…</p>
            )}
          </section>

          <div className="order-1 grid min-w-0 gap-4 lg:order-2">
            {x && (
              <>
                <section className="grid gap-2 rounded-lg border border-slate-200 bg-white p-4">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Belge
                  </h2>
                  <p className="text-sm">
                    {x.identity.supplier.value ?? 'Tedarikçi belirtilmemiş'} · sürüm{' '}
                    {x.identity.revisionNumber.value ?? '?'} ·{' '}
                    {x.identity.revisionDate.value ?? '?'}
                  </p>
                </section>
                <section className="grid gap-2 rounded-lg border border-slate-200 bg-white p-4">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Tedarikçinin verdiği sınıflandırma
                  </h2>
                  <ul className="flex flex-wrap gap-2">
                    {x.productClassification.lines.length === 0 && (
                      <li className="text-sm text-slate-500">Sınıflandırma satırı yok</li>
                    )}
                    {x.productClassification.lines.map((l, i) => (
                      <HazardChip
                        key={i}
                        line={l}
                        onShow={setPage}
                        onPick={isKdu ? (code) => void setHCode(null, i, code) : null}
                      />
                    ))}
                  </ul>
                </section>
                <section className="grid gap-2 rounded-lg border border-slate-200 bg-white p-4">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    İçindeki maddeler
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                          <th className="py-1.5 pr-3">Madde</th>
                          <th className="py-1.5 pr-3">Oran</th>
                          <th className="py-1.5">Sınıflar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {x.components.map((c, i) => (
                          <tr key={i} className="border-b border-slate-100 align-top">
                            <td className="py-2 pr-3">
                              <b>{c.name.value ?? '?'}</b>
                              <small className="block font-mono text-slate-500">
                                CAS {c.cas.value ?? 'yok'}
                              </small>
                            </td>
                            <td className="py-2 pr-3 font-mono whitespace-nowrap">
                              {c.concentration?.raw ?? 'verilmemiş'}{' '}
                              <PageLink page={c.concentration?.source.page} onShow={setPage} />
                            </td>
                            <td className="py-2 text-slate-600">
                              {c.classifications.length === 0 && '—'}
                              <ul className="grid gap-1">
                                {c.classifications.map((l, j) => (
                                  <li key={j} className="flex flex-wrap items-center gap-1.5">
                                    <span>
                                      {l.category ?? l.hazardClassAsWritten}
                                      {l.hCode && (
                                        <span className="ml-1 font-mono text-xs text-slate-500">
                                          {l.hCode}
                                          {l.hCodeChosenBy && ' (KDU seçti)'}
                                        </span>
                                      )}
                                    </span>
                                    <HCodePicker
                                      line={l}
                                      onPick={isKdu ? (code) => void setHCode(i, j, code) : null}
                                    />
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
                <section className="grid gap-2 rounded-lg border border-slate-200 bg-white p-4">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Temel özellikler
                  </h2>
                  <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {PROPS.map(([key, label]) => {
                      const p = x.physicalProperties.find((pp) => pp.property === key && pp.value);
                      return (
                        <div
                          key={key}
                          className="min-w-0 rounded-md border border-slate-200 px-3 py-2"
                        >
                          <dt className="text-xs text-slate-500">{label}</dt>
                          <dd className="font-semibold break-words">
                            {p ? (
                              <>
                                {p.value} <PageLink page={p.source.page} onShow={setPage} />
                              </>
                            ) : (
                              <span className="font-normal text-amber-700 italic">belgede yok</span>
                            )}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </section>
              </>
            )}

            {doc.extraction_status === 'done' && (
              <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Sorular ({open} açık)
                </h2>
                {doc.flags.length === 0 && <p className="text-sm text-slate-500">Soru yok.</p>}
                <ul className="grid gap-2">
                  {doc.flags.map((f, i) => {
                    const kind = FLAG_KIND[f.kind] ?? FLAG_KIND.other;
                    return (
                      <li
                        key={i}
                        className={`grid gap-2 rounded-md border border-slate-200 p-3 ${f.resolution ? 'opacity-70' : ''}`}
                      >
                        <div className="flex items-start gap-2 text-sm">
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${TONE[kind.tone]}`}
                          >
                            {kind.label}
                          </span>
                          <span>
                            {f.message.replace(/^\[kontrol\] /, '')}{' '}
                            <PageLink page={f.page} onShow={setPage} />
                          </span>
                        </div>
                        {f.resolution ? (
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span
                              className={`rounded-full px-2 py-0.5 font-bold ${f.resolution.status === 'accepted' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}
                            >
                              {f.resolution.status === 'accepted' ? 'Onaylandı' : 'Düzeltilmeli'}
                            </span>
                            {f.resolution.note && (
                              <span className="text-slate-600">“{f.resolution.note}”</span>
                            )}
                            {editable && doc.status !== 'approved' && (
                              <button
                                type="button"
                                className="text-sky-800 underline"
                                onClick={() => resolve(i, null)}
                              >
                                Geri al
                              </button>
                            )}
                          </div>
                        ) : (
                          editable && (
                            <div className="grid gap-2">
                              <input
                                id={`note-${i}`}
                                placeholder="Not (isteğe bağlı)"
                                value={notes[i] ?? ''}
                                onChange={(e) => setNotes({ ...notes, [i]: e.target.value })}
                                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                              />
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => resolve(i, 'accepted')}
                                  className="rounded-md bg-sky-900 px-3 py-1.5 text-sm font-semibold text-white"
                                >
                                  Gördüm, doğru
                                </button>
                                <button
                                  type="button"
                                  onClick={() => resolve(i, 'needs_fix')}
                                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold"
                                >
                                  Düzeltilmeli
                                </button>
                              </div>
                            </div>
                          )
                        )}
                      </li>
                    );
                  })}
                </ul>
                {doc.status !== 'approved' && (
                  <div className="grid gap-2 border-t border-slate-200 pt-3">
                    {!isKdu && (
                      <p className="text-sm text-slate-500">Onayı firmanın KDU'su verir.</p>
                    )}
                    {isKdu && open > 0 && (
                      <p className="text-sm text-slate-500">
                        Onay için önce açık soruları yanıtla.
                      </p>
                    )}
                    {isKdu && open === 0 && needsFix > 0 && (
                      <p className="text-sm text-amber-800">
                        {needsFix} nokta "düzeltilmeli" işaretli. Değer düzeltme ekranı sonraki
                        adımda gelecek; o zamana kadar bu hammadde onaylanamaz.
                      </p>
                    )}
                    {isKdu && (
                      <button
                        type="button"
                        disabled={open > 0 || needsFix > 0}
                        onClick={() => void approve()}
                        className="justify-self-start rounded-md bg-emerald-800 px-4 py-2 font-semibold text-white disabled:opacity-40"
                      >
                        KDU olarak onayla
                      </button>
                    )}
                  </div>
                )}
                {doc.status === 'approved' && doc.approved_at && (
                  <p className="text-sm text-emerald-800">
                    {new Date(doc.approved_at).toLocaleString('tr-TR')} tarihinde onaylandı.
                  </p>
                )}
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
