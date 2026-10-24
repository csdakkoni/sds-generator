import type { ClassificationResult, EngineWarning, MixtureInput } from '@sds/classification-engine';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { hasRole } from '../lib/review';
import {
  changedSections,
  composeContent,
  emptyInputs,
  phrase,
  publishBlockers,
  sameContent,
  SECTION_TEXT_KEYS,
  sectionLabel,
  type CompanyInfo,
  type DataSource,
  type SdsContent,
  type SdsInputs,
  type SdsLanguage,
  type SectionTextKey,
} from '../lib/sds/content';
import { buildSections, defaultSectionText, type RevisionInfo } from '../lib/sds/text';
import { supabase } from '../lib/supabase';
import type { Membership } from '../lib/types';

interface RevisionRow {
  id: string;
  sds_document_id: string;
  revision_number: number;
  content: SdsContent;
  change_log: number[];
  approved_by: string | null;
  approved_at: string | null;
  pdf_path: string | null;
  created_at: string;
}

interface DocumentRow {
  id: string;
  language: SdsLanguage;
  document_number: string;
  status: 'draft' | 'in_review' | 'published' | 'withdrawn';
  sds_revisions: RevisionRow[];
}

const SECTION_TEXT_TITLES: Record<SectionTextKey, string> = {
  s2_3: '2.3 Diğer zararlar (PBT/vPvB, endokrin bozucu vb.)',
  s4: '4. İlk yardım önlemleri',
  s5: '5. Yangınla mücadele',
  s6: '6. Kaza sonucu yayılma',
  s7: '7. Elleçleme ve depolama',
  s8_1: '8.1 Kontrol parametreleri (mesleki maruz kalma sınırları)',
  s8_2: '8.2 Maruz kalma kontrolleri ve kişisel koruyucu donanım',
  s10: '10. Kararlılık ve tepkime',
  s13: '13. Bertaraf',
};

const today = () => new Date().toISOString().slice(0, 10);
const trDate = (iso: string) => new Date(iso).toLocaleDateString('tr-TR');

function Field({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1 text-xs text-slate-600">
      {label}
      <input
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 disabled:bg-slate-50"
      />
    </label>
  );
}

export function SdsPanel({
  membership,
  userId,
  productId,
  product,
  mixture,
  result,
  measurements,
  dataSources,
}: {
  membership: Membership;
  userId: string;
  productId: string;
  product: { name: string; code: string | null };
  mixture: {
    input: MixtureInput;
    notes: EngineWarning[];
    cas: Record<string, string | null>;
    ec: Record<string, string | null>;
    names?: Record<string, string>;
  };
  result: ClassificationResult;
  measurements: SdsContent['measurements'];
  dataSources: DataSource[];
}) {
  const org = membership.organization_id;
  const isKdu = hasRole(membership, 'kdu');
  const isOwner = hasRole(membership, 'owner');
  const editable = isKdu || hasRole(membership, 'editor') || isOwner;

  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [inputs, setInputs] = useState<SdsInputs | null>(null);
  const [lang, setLang] = useState<SdsLanguage>('tr');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      supabase
        .from('organizations')
        .select('name, address, phone, email, emergency_phone')
        .eq('id', org)
        .single(),
      supabase
        .from('sds_documents')
        .select(
          'id, language, document_number, status, sds_revisions (id, sds_document_id, revision_number, content, change_log, approved_by, approved_at, pdf_path, created_at)',
        )
        .eq('product_id', productId),
    ]).then(([o, d]) => {
      if (!active) return;
      if (o.error || d.error) {
        setMessage({ tone: 'error', text: (o.error ?? d.error)?.message ?? '' });
        return;
      }
      setCompany(
        (current) =>
          current ?? {
            name: o.data.name ?? '',
            address: o.data.address ?? '',
            phone: o.data.phone ?? '',
            email: o.data.email ?? '',
            emergencyPhone: o.data.emergency_phone ?? '',
          },
      );
      const rows = (d.data ?? []) as DocumentRow[];
      rows.forEach((r) => r.sds_revisions.sort((a, b) => b.revision_number - a.revision_number));
      setDocs(rows);
      const latest = rows.find((r) => r.language === 'tr')?.sds_revisions[0];
      setInputs(
        (current) =>
          current ??
          (latest
            ? latest.content.inputs
            : {
                ...emptyInputs(),
                pStatements: result.label.pStatementSuggestions.map((p) => p.code),
              }),
      );
    });
    return () => {
      active = false;
    };
  }, [org, productId, version, result]);

  const trDoc = docs?.find((d) => d.language === 'tr');
  const latest = trDoc?.sds_revisions[0] ?? null;

  const sectionText = useCallback(
    (content: SdsContent, l: SdsLanguage, key: SectionTextKey) =>
      inputs?.texts[l][key] ?? defaultSectionText(content, l, key),
    [inputs],
  );

  /** Content as it would be saved now: every section text resolved, so a saved revision never changes. */
  const content = useMemo(() => {
    if (!company || !inputs) return null;
    const draft = composeContent({
      product,
      company,
      inputs,
      measurements,
      mixture,
      result,
      dataSources,
    });
    const texts: SdsInputs['texts'] = { tr: {}, en: {} };
    for (const l of ['tr', 'en'] as const) {
      for (const key of SECTION_TEXT_KEYS) texts[l][key] = sectionText(draft, l, key);
    }
    return { ...draft, inputs: { ...inputs, texts } };
  }, [company, inputs, product, measurements, mixture, result, dataSources, sectionText]);

  if (!company || !inputs || !docs || !content) {
    return <p className="text-sm text-slate-500">Yükleniyor…</p>;
  }

  const savedSame = latest !== null && sameContent(latest.content, content);
  const blockers = publishBlockers(content, (l, key) => content.inputs.texts[l][key] ?? '');
  const documentNumber =
    trDoc?.document_number ?? `GBF-${(product.code ?? productId.slice(0, 8)).toUpperCase()}`;
  const set = (patch: Partial<SdsInputs>) => setInputs({ ...inputs, ...patch });

  async function saveCompany() {
    if (!company) return;
    const { error } = await supabase
      .from('organizations')
      .update({
        address: company.address || null,
        phone: company.phone || null,
        email: company.email || null,
        emergency_phone: company.emergencyPhone || null,
      })
      .eq('id', org);
    if (error) throw new Error(`Firma bilgileri kaydedilemedi: ${error.message}`);
  }

  async function ensureDocuments(): Promise<DocumentRow[]> {
    const existing = docs ?? [];
    const missing = (['tr', 'en'] as const).filter((l) => !existing.some((d) => d.language === l));
    if (missing.length === 0) return existing;
    const { error } = await supabase.from('sds_documents').insert(
      missing.map((language) => ({
        organization_id: org,
        product_id: productId,
        document_number: documentNumber,
        language,
      })),
    );
    if (error) throw new Error(`SDS kaydı oluşturulamadı: ${error.message}`);
    const { data, error: loadError } = await supabase
      .from('sds_documents')
      .select(
        'id, language, document_number, status, sds_revisions (id, sds_document_id, revision_number, content, change_log, approved_by, approved_at, pdf_path, created_at)',
      )
      .eq('product_id', productId);
    if (loadError) throw new Error(loadError.message);
    return data as DocumentRow[];
  }

  async function save() {
    if (!content) return;
    setBusy(true);
    setMessage(null);
    try {
      if (isOwner) await saveCompany();
      const rows = await ensureDocuments();
      const latestTr = rows
        .find((d) => d.language === 'tr')
        ?.sds_revisions.sort((a, b) => b.revision_number - a.revision_number)[0];
      if (latestTr && sameContent(latestTr.content, content)) {
        setMessage({ tone: 'ok', text: 'Değişiklik yok; revizyon numarası aynı kaldı.' });
        return;
      }
      const trace = result.classifications.map((c) => ({ category: c.category, trace: c.trace }));
      if (latestTr && !latestTr.approved_by) {
        // An unapproved draft is updated in place; the number only moves past approved revisions.
        for (const d of rows) {
          const { error } = await supabase
            .from('sds_revisions')
            .update({
              content,
              engine_version: result.engineVersion,
              data_sources: dataSources,
              classification_trace: trace,
              change_log: latestTr.change_log,
            })
            .eq('sds_document_id', d.id)
            .eq('revision_number', latestTr.revision_number);
          if (error) throw new Error(error.message);
        }
        setMessage({
          tone: 'ok',
          text: `Taslak (revizyon ${latestTr.revision_number}) güncellendi.`,
        });
      } else {
        const next = (latestTr?.revision_number ?? 0) + 1;
        const changes = latestTr ? changedSections(latestTr.content, content) : [];
        const { error } = await supabase.from('sds_revisions').insert(
          rows.map((d) => ({
            organization_id: org,
            sds_document_id: d.id,
            revision_number: next,
            content,
            change_log: changes,
            engine_version: result.engineVersion,
            data_sources: dataSources,
            classification_trace: trace,
          })),
        );
        if (error) throw new Error(error.message);
        setMessage({ tone: 'ok', text: `Revizyon ${next} taslağı kaydedildi.` });
      }
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
      reload();
    }
  }

  async function approve() {
    if (!latest || !docs) return;
    setBusy(true);
    setMessage(null);
    try {
      const at = new Date().toISOString();
      for (const d of docs) {
        const { error } = await supabase
          .from('sds_revisions')
          .update({ approved_by: userId, approved_at: at })
          .eq('sds_document_id', d.id)
          .eq('revision_number', latest.revision_number);
        if (error) throw new Error(`Onaylanamadı: ${error.message}`);
        const { error: publishError } = await supabase
          .from('sds_documents')
          .update({ status: 'published' })
          .eq('id', d.id);
        if (publishError) throw new Error(`Yayınlanamadı: ${publishError.message}`);
      }
      let stored = true;
      for (const d of docs) {
        const revision = d.sds_revisions.find((r) => r.revision_number === latest.revision_number);
        if (!revision) continue;
        try {
          await storeApprovedPdf(d, revision, { by: userId, at });
        } catch {
          stored = false;
        }
      }
      setMessage({
        tone: stored ? 'ok' : 'error',
        text: stored
          ? `Revizyon ${latest.revision_number} onaylandı, yayınlandı ve PDF'leri saklandı.`
          : `Revizyon ${latest.revision_number} onaylandı ve yayınlandı, ancak PDF saklanamadı. Revizyonlar listesinden "PDF'i sakla"ya bas.`,
      });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
      reload();
    }
  }

  /** Renders one language of a revision (or of the current draft) to a PDF file. */
  async function renderPdf(
    l: SdsLanguage,
    revision: RevisionRow | null,
    docNumber: string,
    approver?: { by: string; at: string },
  ): Promise<{ blob: Blob; revisionNumber: number }> {
    const source = revision?.content ?? content;
    if (!source) throw new Error('İçerik yok.');
    const [{ pdf }, { SdsPdf, registerFonts }] = await Promise.all([
      import('@react-pdf/renderer'),
      import('../lib/sds/SdsPdf'),
    ]);
    const base = new URL(import.meta.env.BASE_URL, window.location.origin).href;
    registerFonts(base);
    const approvedBy = approver?.by ?? revision?.approved_by ?? null;
    const info: RevisionInfo = {
      documentNumber: docNumber,
      revisionNumber:
        revision?.revision_number ??
        (latest && !latest.approved_by
          ? latest.revision_number
          : (latest?.revision_number ?? 0) + 1),
      date: trDate(approver?.at ?? revision?.approved_at ?? revision?.created_at ?? today()),
      approvedBy,
      changedSections:
        revision?.change_log ?? (latest ? changedSections(latest.content, source) : []),
    };
    const sections = buildSections(source, l, info, (key) => source.inputs.texts[l][key] ?? '');
    const blob = await pdf(
      <SdsPdf
        meta={{
          lang: l,
          productName: source.product.name,
          documentNumber: docNumber,
          revisionNumber: info.revisionNumber,
          date: info.date,
          draft: !approvedBy,
          assetBase: base,
        }}
        sections={sections}
      />,
    ).toBlob();
    return { blob, revisionNumber: info.revisionNumber };
  }

  function saveBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  /** Stores the approved PDF once; the database refuses to replace it later. */
  async function storeApprovedPdf(
    d: DocumentRow,
    revision: RevisionRow,
    approver?: { by: string; at: string },
  ) {
    const { blob } = await renderPdf(d.language, revision, d.document_number, approver);
    const path = `${org}/${d.id}/rev${revision.revision_number}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from('sds-pdf')
      .upload(path, blob, { contentType: 'application/pdf', upsert: false });
    if (uploadError) throw new Error(uploadError.message);
    const { error: pathError } = await supabase
      .from('sds_revisions')
      .update({ pdf_path: path })
      .eq('id', revision.id);
    if (pathError) throw new Error(pathError.message);
  }

  async function retryStore(revisionNumber: number) {
    setBusy(true);
    setMessage(null);
    try {
      for (const d of docs ?? []) {
        const revision = d.sds_revisions.find((r) => r.revision_number === revisionNumber);
        if (revision?.approved_by && !revision.pdf_path) await storeApprovedPdf(d, revision);
      }
      setMessage({ tone: 'ok', text: 'Onaylı PDF saklandı.' });
    } catch (e) {
      setMessage({
        tone: 'error',
        text: `PDF saklanamadı: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setBusy(false);
      reload();
    }
  }

  async function downloadPdf(l: SdsLanguage, revision: RevisionRow | null) {
    setBusy(true);
    try {
      const doc = docs?.find((d) => d.language === l);
      // An approved revision downloads the stored file, so what was approved is what is served.
      if (revision?.pdf_path) {
        const { data, error } = await supabase.storage.from('sds-pdf').download(revision.pdf_path);
        if (error) throw new Error(error.message);
        saveBlob(
          data,
          `${doc?.document_number ?? documentNumber}-${l.toUpperCase()}-rev${revision.revision_number}.pdf`,
        );
        return;
      }
      const { blob, revisionNumber } = await renderPdf(
        l,
        revision,
        doc?.document_number ?? documentNumber,
      );
      saveBlob(
        blob,
        `${documentNumber}-${l.toUpperCase()}-rev${revisionNumber}${revision?.approved_by ? '' : '-taslak'}.pdf`,
      );
    } catch (e) {
      setMessage({
        tone: 'error',
        text: `PDF oluşturulamadı: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setBusy(false);
    }
  }

  const approvedLatest =
    docs.find((d) => d.language === 'tr')?.sds_revisions.find((r) => r.approved_by) ?? null;
  const suggestions = result.label.pStatementSuggestions;
  const canApprove = isKdu && latest && !latest.approved_by && savedSame && blockers.length === 0;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-mono text-slate-600">{documentNumber}</span>
        {trDoc?.status === 'published' && approvedLatest && (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
            Yayında · revizyon {approvedLatest.revision_number}
          </span>
        )}
        {latest && !latest.approved_by && (
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
            Revizyon {latest.revision_number} taslak, KDU onayı bekliyor
          </span>
        )}
        {!latest && <span className="text-slate-500">Henüz kaydedilmiş SDS yok.</span>}
      </div>

      <details className="rounded-md border border-slate-200 p-3" open={!company.address}>
        <summary className="cursor-pointer text-sm font-semibold">
          Firma bilgileri (Bölüm 1.3, 1.4)
        </summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Field label="Firma adı" value={company.name} disabled onChange={() => {}} />
          <Field
            label="Adres"
            value={company.address}
            disabled={!isOwner}
            onChange={(v) => setCompany({ ...company, address: v })}
          />
          <Field
            label="Telefon"
            value={company.phone}
            disabled={!isOwner}
            onChange={(v) => setCompany({ ...company, phone: v })}
          />
          <Field
            label="E-posta"
            value={company.email}
            disabled={!isOwner}
            onChange={(v) => setCompany({ ...company, email: v })}
          />
          <Field
            label="Acil durum telefonu"
            value={company.emergencyPhone}
            disabled={!isOwner}
            onChange={(v) => setCompany({ ...company, emergencyPhone: v })}
          />
        </div>
        {!isOwner && (
          <p className="mt-2 text-xs text-slate-500">
            Firma bilgilerini firma sahibi değiştirebilir.
          </p>
        )}
      </details>

      <details className="rounded-md border border-slate-200 p-3" open>
        <summary className="cursor-pointer text-sm font-semibold">
          Ürün bilgileri (Bölüm 1.2, 14, 16)
        </summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Field
            label="Belirlenmiş kullanım (TR)"
            value={inputs.identifiedUse.tr}
            disabled={!editable}
            placeholder="ör. Tekstil yardımcı kimyasalı, endüstriyel kullanım"
            onChange={(v) => set({ identifiedUse: { ...inputs.identifiedUse, tr: v } })}
          />
          <Field
            label="Belirlenmiş kullanım (EN)"
            value={inputs.identifiedUse.en}
            disabled={!editable}
            placeholder="e.g. Textile auxiliary, industrial use"
            onChange={(v) => set({ identifiedUse: { ...inputs.identifiedUse, en: v } })}
          />
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              disabled={!editable}
              checked={inputs.transport.notRegulated}
              onChange={(e) =>
                set({ transport: { ...inputs.transport, notRegulated: e.target.checked } })
              }
            />
            Taşımada tehlikeli madde değil (ADR/RID, IMDG, IATA)
          </label>
          {!inputs.transport.notRegulated && (
            <>
              <Field
                label="UN numarası"
                value={inputs.transport.unNumber}
                disabled={!editable}
                onChange={(v) => set({ transport: { ...inputs.transport, unNumber: v } })}
              />
              <Field
                label="Uygun sevkiyat adı"
                value={inputs.transport.shippingName}
                disabled={!editable}
                onChange={(v) => set({ transport: { ...inputs.transport, shippingName: v } })}
              />
              <Field
                label="Taşıma sınıfı"
                value={inputs.transport.transportClass}
                disabled={!editable}
                onChange={(v) => set({ transport: { ...inputs.transport, transportClass: v } })}
              />
              <Field
                label="Ambalaj grubu"
                value={inputs.transport.packingGroup}
                disabled={!editable}
                onChange={(v) => set({ transport: { ...inputs.transport, packingGroup: v } })}
              />
            </>
          )}
          <Field
            label="Onaylayan KDU adı soyadı"
            value={inputs.kdu.name}
            disabled={!editable}
            onChange={(v) => set({ kdu: { ...inputs.kdu, name: v } })}
          />
          <Field
            label="KDU sertifika no"
            value={inputs.kdu.certificateNo}
            disabled={!editable}
            onChange={(v) => set({ kdu: { ...inputs.kdu, certificateNo: v } })}
          />
        </div>
      </details>

      <details className="rounded-md border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-semibold">
          Önlem ifadeleri ({inputs.pStatements.length} seçili)
        </summary>
        <p className="mt-2 text-xs text-slate-500">
          Sınıflandırmaya göre önerilenler. Etikete girecekleri KDU seçer.
        </p>
        <ul className="mt-2 grid gap-1 text-sm">
          {suggestions.map((p) => (
            <li key={p.code}>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  disabled={!editable}
                  checked={inputs.pStatements.includes(p.code)}
                  onChange={(e) =>
                    set({
                      pStatements: e.target.checked
                        ? suggestions
                            .map((s) => s.code)
                            .filter((c) => c === p.code || inputs.pStatements.includes(c))
                        : inputs.pStatements.filter((c) => c !== p.code),
                    })
                  }
                />
                <span>
                  <b className="font-mono">{p.code}</b> {phrase('tr', p.code) ?? '(metin yok)'}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </details>

      <details className="rounded-md border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-semibold">
          Bölüm metinleri (KDU kontrol eder)
        </summary>
        <div className="mt-2 flex gap-1 text-sm">
          {(['tr', 'en'] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={`rounded-md px-3 py-1 ${lang === l ? 'bg-sky-900 text-white' : 'border border-slate-300'}`}
            >
              {l === 'tr' ? 'Türkçe' : 'İngilizce'}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Metinler ürünün tehlikelerine göre önerildi. Boş olanları (ör. 2.3, 8.1) uzman doldurmalı.
        </p>
        <div className="mt-2 grid gap-3">
          {SECTION_TEXT_KEYS.map((key) => {
            const suggested = defaultSectionText(content, lang, key);
            const value = content.inputs.texts[lang][key] ?? '';
            return (
              <label key={key} className="grid gap-1 text-xs text-slate-600">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  {SECTION_TEXT_TITLES[key]}
                  {editable && suggested && value !== suggested && (
                    <button
                      type="button"
                      className="text-sky-800 underline"
                      onClick={() =>
                        set({
                          texts: {
                            ...inputs.texts,
                            [lang]: { ...inputs.texts[lang], [key]: suggested },
                          },
                        })
                      }
                    >
                      Önerilen metni kullan
                    </button>
                  )}
                </span>
                <textarea
                  rows={Math.min(8, Math.max(2, value.split('\n').length + 1))}
                  value={value}
                  disabled={!editable}
                  placeholder={`Bölüm ${sectionLabel(key)} için metin girilmeli`}
                  onChange={(e) =>
                    set({
                      texts: {
                        ...inputs.texts,
                        [lang]: { ...inputs.texts[lang], [key]: e.target.value },
                      },
                    })
                  }
                  className={`rounded-md border px-2 py-1.5 text-sm text-slate-900 ${value.trim() ? 'border-slate-300' : 'border-red-300 bg-red-50'}`}
                />
              </label>
            );
          })}
        </div>
      </details>

      {blockers.length > 0 && (
        <section className="grid gap-1 rounded-md border border-red-200 bg-red-50 p-3 text-red-800">
          <h3 className="text-sm font-bold">Yayınlamadan önce tamamlanmalı ({blockers.length})</h3>
          <ul className="grid list-disc gap-1 pl-5 text-sm">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </section>
      )}

      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={`rounded-md px-3 py-2 text-sm ${message.tone === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}
        >
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {editable && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="rounded-md bg-sky-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {latest ? 'Taslağı kaydet' : 'SDS taslağı oluştur'}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void downloadPdf('tr', null)}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          Taslak PDF (TR)
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void downloadPdf('en', null)}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          Taslak PDF (EN)
        </button>
        {isKdu && (
          <button
            type="button"
            disabled={busy || !canApprove}
            onClick={() => void approve()}
            title={
              canApprove
                ? ''
                : !savedSame
                  ? 'Önce değişiklikleri taslak olarak kaydet'
                  : 'Eksikler tamamlanmalı'
            }
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            KDU olarak onayla ve yayınla
          </button>
        )}
      </div>
      {latest && !savedSame && (
        <p className="text-xs text-amber-700">Kaydedilmemiş değişiklikler var.</p>
      )}

      {trDoc && trDoc.sds_revisions.length > 0 && (
        <section className="grid gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Revizyonlar</h3>
          <ul className="grid gap-1 text-sm">
            {trDoc.sds_revisions.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-2 border-b border-slate-100 py-1.5"
              >
                <b>Revizyon {r.revision_number}</b>
                <span className="text-slate-500">
                  {r.approved_at
                    ? `onaylandı ${trDate(r.approved_at)}`
                    : `taslak · ${trDate(r.created_at)}`}
                  {r.change_log.length > 0 && ` · değişen bölümler: ${r.change_log.join(', ')}`}
                </span>
                {r.approved_by && !r.pdf_path && isKdu && trDoc && (
                  <button
                    type="button"
                    className="text-amber-800 underline"
                    onClick={() => void retryStore(r.revision_number)}
                  >
                    PDF'i sakla
                  </button>
                )}
                {r.approved_by && (
                  <span className="ml-auto flex gap-2">
                    <button
                      type="button"
                      className="text-sky-800 underline"
                      onClick={() => void downloadPdf('tr', r)}
                    >
                      PDF TR
                    </button>
                    <button
                      type="button"
                      className="text-sky-800 underline"
                      onClick={() => void downloadPdf('en', r)}
                    >
                      PDF EN
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
