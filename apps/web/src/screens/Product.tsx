import { classifyMixture } from '@sds/classification-engine';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildMixture,
  MEASUREMENTS,
  parseRecipePaste,
  type MeasurementKey,
  type MeasurementRow,
  type RecipeLine,
  type RecipeMaterial,
} from '../lib/mixture';
import { canEdit } from '../lib/review';
import { supabase } from '../lib/supabase';
import type { Extraction, Membership } from '../lib/types';
import { ClassificationView } from './ClassificationView';

interface MaterialRow {
  id: string;
  trade_name: string;
  raw_material_sds_documents: {
    status: string;
    approved_at: string | null;
    extraction: Extraction | null;
  }[];
}

interface Loaded {
  name: string;
  code: string | null;
  lines: (RecipeLine & { position: number })[];
  materials: MaterialRow[];
  measurements: MeasurementRow[];
}

const pct = (n: number) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 4 }).format(n);
const parseNumber = (s: string) => Number(s.replace(',', '.').trim());

function toRecipeMaterial(m: MaterialRow): RecipeMaterial {
  const approved = m.raw_material_sds_documents
    .filter((d) => d.status === 'approved' && d.extraction)
    .sort((a, b) => (b.approved_at ?? '').localeCompare(a.approved_at ?? ''))[0];
  return { id: m.id, trade_name: m.trade_name, approvedExtraction: approved?.extraction ?? null };
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

export function Product({
  membership,
  productId,
  onBack,
}: {
  membership: Membership;
  productId: string;
  onBack: () => void;
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editable = canEdit(membership);
  const org = membership.organization_id;

  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      supabase.from('products').select('name, code').eq('id', productId).single(),
      supabase
        .from('recipe_lines')
        .select('id, raw_material_id, percent_min, percent_max, position')
        .eq('product_id', productId)
        .order('position'),
      supabase
        .from('raw_materials')
        .select('id, trade_name, raw_material_sds_documents (status, approved_at, extraction)')
        .eq('organization_id', org)
        .order('trade_name'),
      supabase
        .from('product_measurements')
        .select('property, value_text, numeric_min')
        .eq('product_id', productId),
    ]).then(([p, l, m, ms]) => {
      if (!active) return;
      const failed = [p, l, m, ms].find((r) => r.error);
      if (failed?.error) {
        setError(failed.error.message);
        return;
      }
      setData({
        name: p.data?.name ?? '',
        code: p.data?.code ?? null,
        lines: (l.data ?? []) as Loaded['lines'],
        materials: (m.data ?? []) as MaterialRow[],
        measurements: (ms.data ?? []) as MeasurementRow[],
      });
    });
    return () => {
      active = false;
    };
  }, [productId, org, version]);

  const computed = useMemo(() => {
    if (!data || data.lines.length === 0) return null;
    const { input, notes } = buildMixture(
      data.lines,
      data.materials.map(toRecipeMaterial),
      data.measurements,
    );
    return { result: classifyMixture(input), notes };
  }, [data]);

  async function addLines(lines: { rawMaterialId: string; min: number; max: number }[]) {
    if (!data || lines.length === 0) return;
    setError(null);
    const start = data.lines.reduce((s, l) => Math.max(s, l.position + 1), 0);
    const { error: addError } = await supabase.from('recipe_lines').insert(
      lines.map((l, i) => ({
        organization_id: org,
        product_id: productId,
        raw_material_id: l.rawMaterialId,
        percent_min: l.min,
        percent_max: l.max,
        position: start + i,
      })),
    );
    if (addError) setError(`Reçete satırı eklenemedi: ${addError.message}`);
    reload();
  }

  async function removeLine(id: string) {
    const { error: removeError } = await supabase.from('recipe_lines').delete().eq('id', id);
    if (removeError) setError(removeError.message);
    reload();
  }

  async function saveMeasurement(key: MeasurementKey, valueText: string, numeric: number | null) {
    setError(null);
    const { error: deleteError } = await supabase
      .from('product_measurements')
      .delete()
      .eq('product_id', productId)
      .eq('property', key);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    if (valueText.trim()) {
      const unit = MEASUREMENTS.find((m) => m.key === key)?.unit ?? null;
      const { error: insertError } = await supabase.from('product_measurements').insert({
        organization_id: org,
        product_id: productId,
        property: key,
        value_text: valueText.trim(),
        numeric_min: numeric,
        numeric_max: numeric,
        unit,
      });
      if (insertError) setError(insertError.message);
    }
    reload();
  }

  if (!data) {
    return error ? (
      <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </p>
    ) : (
      <p className="text-sm text-slate-500">Yükleniyor…</p>
    );
  }

  const totalMin = data.lines.reduce((s, l) => s + Number(l.percent_min), 0);
  const totalMax = data.lines.reduce((s, l) => s + Number(l.percent_max), 0);
  const recipeMaterials = data.materials.map(toRecipeMaterial);

  return (
    <div className="grid gap-4">
      <button type="button" onClick={onBack} className="justify-self-start text-sm text-sky-800">
        ← Ürünler
      </button>
      <h1 className="text-2xl font-semibold text-slate-900">
        {data.name}
        {data.code && <span className="ml-2 text-base text-slate-500">{data.code}</span>}
      </h1>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-4">
          <Card title="Reçete">
            {data.lines.length === 0 && (
              <p className="text-sm text-slate-500">Henüz reçete satırı yok.</p>
            )}
            {data.lines.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="py-1.5 pr-3">Hammadde</th>
                    <th className="py-1.5 pr-3 text-right">Oran (%)</th>
                    <th className="py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((l) => {
                    const m = recipeMaterials.find((r) => r.id === l.raw_material_id);
                    return (
                      <tr key={l.id} className="border-b border-slate-100 align-top">
                        <td className="py-2 pr-3">
                          <a href={`#/hammaddeler/${l.raw_material_id}`} className="font-semibold">
                            {m?.trade_name ?? '?'}
                          </a>
                          {!m?.approvedExtraction && (
                            <small className="block text-amber-700">SDS'i onaylı değil</small>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono whitespace-nowrap">
                          {Number(l.percent_min) === Number(l.percent_max)
                            ? pct(Number(l.percent_min))
                            : `${pct(Number(l.percent_min))} – ${pct(Number(l.percent_max))}`}
                        </td>
                        <td className="py-2 text-right">
                          {editable && (
                            <button
                              type="button"
                              onClick={() => void removeLine(l.id)}
                              className="text-xs text-red-700 underline"
                            >
                              Sil
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="text-xs text-slate-500">
                    <td className="py-2 pr-3">Toplam</td>
                    <td className="py-2 pr-3 text-right font-mono">
                      {totalMin === totalMax
                        ? pct(totalMin)
                        : `${pct(totalMin)} – ${pct(totalMax)}`}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            )}
            {editable && (
              <AddLine materials={data.materials} onAdd={(line) => void addLines([line])} />
            )}
            {editable && (
              <PasteLines materials={data.materials} onAdd={(lines) => void addLines(lines)} />
            )}
          </Card>

          <Card title="Ölçülen değerler (karışımın kendisi)">
            <p className="text-sm text-slate-500">
              Laboratuvar sonuçlarını gir. Fiziksel tehlikeler bileşenlerden hesaplanmaz, ölçüm
              gerekir.
            </p>
            <Measurements
              rows={data.measurements}
              editable={editable}
              onSave={(key, text, n) => void saveMeasurement(key, text, n)}
            />
          </Card>
        </div>

        <div className="min-w-0">
          <Card title="Sınıflandırma sonucu">
            {computed ? (
              <ClassificationView result={computed.result} notes={computed.notes} />
            ) : (
              <p className="text-sm text-slate-500">Reçete girildiğinde burada hesaplanır.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function AddLine({
  materials,
  onAdd,
}: {
  materials: MaterialRow[];
  onAdd: (line: { rawMaterialId: string; min: number; max: number }) => void;
}) {
  const [materialId, setMaterialId] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const a = parseNumber(min);
    const b = max.trim() ? parseNumber(max) : a;
    if (!materialId || !Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b > 100 || a > b) {
      setProblem('Hammadde seç ve 0–100 arasında bir oran gir (aralık için alt ve üst sınır).');
      return;
    }
    setProblem(null);
    onAdd({ rawMaterialId: materialId, min: a, max: b });
    setMin('');
    setMax('');
  }

  return (
    <form onSubmit={submit} className="grid gap-2 border-t border-slate-100 pt-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid min-w-40 flex-1 gap-1 text-xs text-slate-600">
          Hammadde
          <select
            value={materialId}
            onChange={(e) => setMaterialId(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">Seç…</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.trade_name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid w-24 gap-1 text-xs text-slate-600">
          Oran %
          <input
            value={min}
            onChange={(e) => setMin(e.target.value)}
            inputMode="decimal"
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="grid w-24 gap-1 text-xs text-slate-600">
          Üst sınır %
          <input
            value={max}
            onChange={(e) => setMax(e.target.value)}
            inputMode="decimal"
            placeholder="aralıksa"
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-sky-900 px-3 py-1.5 text-sm font-semibold text-white"
        >
          Ekle
        </button>
      </div>
      {problem && <p className="text-xs text-red-700">{problem}</p>}
    </form>
  );
}

function PasteLines({
  materials,
  onAdd,
}: {
  materials: MaterialRow[];
  onAdd: (lines: { rawMaterialId: string; min: number; max: number }[]) => void;
}) {
  const [text, setText] = useState('');
  const [problems, setProblems] = useState<string[]>([]);

  function submit() {
    const parsed = parseRecipePaste(text, materials);
    setProblems(parsed.problems);
    if (parsed.lines.length > 0) onAdd(parsed.lines);
    if (parsed.problems.length === 0) setText('');
  }

  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-sky-800">Excel'den yapıştır</summary>
      <div className="mt-2 grid gap-2">
        <p className="text-xs text-slate-500">
          Excel'de "hammadde adı" ve "oran" sütunlarını (aralık için alt ve üst oran) seçip kopyala,
          buraya yapıştır.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="rounded-md border border-slate-300 px-2 py-1.5 font-mono text-xs"
        />
        <button
          type="button"
          onClick={submit}
          className="justify-self-start rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold"
        >
          Satırları ekle
        </button>
        {problems.length > 0 && (
          <ul className="grid gap-1 text-xs text-red-700">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

function Measurements({
  rows,
  editable,
  onSave,
}: {
  rows: MeasurementRow[];
  editable: boolean;
  onSave: (key: MeasurementKey, valueText: string, numeric: number | null) => void;
}) {
  const current = (key: MeasurementKey) => rows.find((r) => r.property === key)?.value_text ?? '';
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {MEASUREMENTS.map((m) => {
        if (m.key === 'physical_state' || m.key === 'metal_corrosion') {
          const options =
            m.key === 'physical_state'
              ? [
                  ['liquid', 'Sıvı'],
                  ['solid', 'Katı'],
                  ['gas', 'Gaz'],
                ]
              : [
                  ['negative', 'Negatif'],
                  ['positive', 'Pozitif'],
                ];
          return (
            <label key={m.key} className="grid gap-1 text-xs text-slate-600">
              {m.label}
              <select
                disabled={!editable}
                value={current(m.key)}
                onChange={(e) => onSave(m.key, e.target.value, null)}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="">Ölçülmedi</option>
                {options.map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
          );
        }
        return (
          <label key={m.key} className="grid gap-1 text-xs text-slate-600">
            {m.label}
            {m.unit ? ` (${m.unit})` : ''}
            <input
              key={current(m.key)}
              disabled={!editable}
              defaultValue={current(m.key)}
              inputMode="decimal"
              placeholder="Ölçülmedi"
              onBlur={(e) => {
                const text = e.target.value.trim();
                if (text === current(m.key)) return;
                const n = parseNumber(text);
                onSave(m.key, text, text && Number.isFinite(n) ? n : null);
              }}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
        );
      })}
    </div>
  );
}
