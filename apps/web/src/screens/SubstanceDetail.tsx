import { HAZARD_CATEGORIES, hCodeOptions, type HazardCategory } from '@sds/classification-engine';
import { useCallback, useEffect, useState } from 'react';
import { isValidCas } from '../lib/cas';
import { loadHarmonised, type HarmonisedEntry } from '../lib/ek6';
import {
  agreementLabel,
  confirmOutside,
  fetchOutside,
  loadConfirmed,
  loadOutside,
  summarise,
  type ConfirmedProfile,
  type OutsideSummary,
} from '../lib/outside';
import { hasRole } from '../lib/review';
import { supabase } from '../lib/supabase';
import type { Membership } from '../lib/types';

interface Substance {
  id: string;
  name: string;
  cas_number: string;
  ec_number: string | null;
  list_no: string | null;
  synonyms: string[];
}

interface Registry {
  source_id: string;
  data_license: string;
  license_url: string | null;
}

interface Loaded {
  substance: Substance | null;
  ek6: HarmonisedEntry | null;
  summary: OutsideSummary;
  confirmed: ConfirmedProfile | null;
  registry: Record<string, Registry>;
}

type Line = { category: string; hCode: string; candidates?: string[] };

const FAMILY_LABEL: Record<string, string> = {
  jp_nite: 'Japonya (NITE)',
  nz_epa: 'Yeni Zelanda (EPA)',
  kr_me: 'Kore',
  au_hcis: 'Avustralya (HCIS)',
};
const familyLabel = (f: string) => FAMILY_LABEL[f] ?? f.replace(/^other:/, '');

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 rounded-xl border border-slate-200 bg-white shadow-sm p-4">
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      {children}
    </section>
  );
}

const lineText = (l: { category: string; hCode: string }) => `${l.category} (${l.hCode})`;

/**
 * One substance: identity, SEA Annex 6, what each outside source says and how far independent
 * sources agree (information only), and the firm KDU's expert assessment. A substance not yet in the library is looked
 * up automatically.
 */
export function SubstanceDetail({
  cas,
  membership,
  userId,
  platformAdmin,
}: {
  cas: string;
  membership: Membership;
  userId: string;
  platformAdmin: boolean;
}) {
  const org = membership.organization_id;
  const isKdu = hasRole(membership, 'kdu');
  const [data, setData] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const read = () =>
        supabase
          .from('substances')
          .select('id, name, cas_number, ec_number, list_no, synonyms')
          .eq('cas_number', cas)
          .maybeSingle();
      let { data: substance } = await read();
      if (!substance && isValidCas(cas)) {
        if (active) setBusy('Kütüphanede yok; PubChem’de aranıyor ve kaydediliyor…');
        const fetched = await fetchOutside(cas);
        if (fetched.error && active) setError(`PubChem'e ulaşılamadı: ${fetched.error}`);
        ({ data: substance } = await read());
      }
      const [ek6, outside, confirmed] = await Promise.all([
        loadHarmonised([cas]),
        loadOutside([cas]),
        loadConfirmed(org, [cas]),
      ]);
      const summary = outside[cas] ?? summarise(cas, []);
      const ids = summary.sources.map((s) => s.record.source_id);
      const { data: registry } = ids.length
        ? await supabase
            .from('outside_sources')
            .select('source_id, data_license, license_url')
            .in('source_id', ids)
        : { data: [] };
      if (!active) return;
      setBusy(null);
      setData({
        substance: (substance as Substance | null) ?? null,
        ek6: ek6[cas] ?? null,
        summary,
        confirmed: confirmed[cas] ?? null,
        registry: Object.fromEntries(((registry ?? []) as Registry[]).map((r) => [r.source_id, r])),
      });
    })().catch((e: unknown) => {
      if (active) {
        setBusy(null);
        setError(e instanceof Error ? e.message : String(e));
      }
    });
    return () => {
      active = false;
    };
  }, [cas, org, version]);

  async function refresh() {
    setError(null);
    setBusy('Kaynaklar yeniden okunuyor…');
    const fetched = await fetchOutside(cas, true);
    if (fetched.error) setError(`PubChem'e ulaşılamadı: ${fetched.error}`);
    setBusy(null);
    reload();
  }

  async function verifyEk6(entry: HarmonisedEntry) {
    setError(null);
    const { error: verifyError } = await supabase
      .from('classification_profiles')
      .update({
        verification_status: 'verified',
        verified_by: userId,
        verified_at: new Date().toISOString(),
      })
      .eq('id', entry.profileId);
    if (verifyError) setError(`Doğrulanamadı: ${verifyError.message}`);
    reload();
  }

  async function clearLicense(sourceId: string) {
    setError(null);
    const { error: licenseError } = await supabase
      .from('outside_sources')
      .update({ data_license: 'official_public' })
      .eq('source_id', sourceId);
    if (licenseError) setError(`Lisans kaydedilemedi: ${licenseError.message}`);
    reload();
  }

  if (!data) {
    return (
      <div className="grid gap-3">
        <a href="#/kutuphane" className="text-sm text-sky-800 underline">
          ← Kütüphane
        </a>
        <p className="text-sm text-slate-500">{busy ?? 'Yükleniyor…'}</p>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>
    );
  }

  const { substance, ek6, summary, confirmed, registry } = data;
  return (
    <div className="grid gap-4">
      <a href="#/kutuphane" className="text-sm text-sky-800 underline">
        ← Kütüphane
      </a>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {substance?.name ?? 'Bulunamadı'}
        </h1>
        <p className="mt-1 font-mono text-sm text-slate-500">
          CAS {cas}
          {substance?.ec_number ? ` · EC ${substance.ec_number}` : ''}
        </p>
        {substance?.list_no && substance.synonyms[0] && (
          <p className="text-sm text-slate-600">Türkçe adı: {substance.synonyms[0]}</p>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {busy && <p className="text-sm text-slate-500">{busy}</p>}
      {!substance && (
        <p className="text-sm text-slate-600">
          Bu CAS numarası ne kütüphanede ne PubChem'de bulundu. Ad ve sınıflandırma KDU tarafından
          elle girilmeli.
        </p>
      )}

      <Card title="SEA Ek-6 (resmî sınıflandırma)">
        {ek6 ? (
          <>
            <p className="text-sm">{ek6.classifications.map(lineText).join(', ')}</p>
            <p className="text-xs text-slate-500">
              {ek6.reference} ·{' '}
              {ek6.verified ? 'doğrulanmış' : 'henüz doğrulanmadı, taslaklarda kullanılıyor'}
              {ek6.caveat ? ` · ${ek6.caveat}` : ''}
            </p>
            {!ek6.verified && platformAdmin && (
              <button
                type="button"
                onClick={() => void verifyEk6(ek6)}
                className="justify-self-start rounded-md bg-sky-800 px-3 py-1.5 text-sm font-semibold text-white"
              >
                Kontrol ettim, doğrula
              </button>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-600">
            Ek-6'da yok. Sınıflandırma hammaddenin tedarikçi SDS'inden gelir; aşağıdaki dış
            kaynaklar yalnızca bilgi ve kontrol içindir.
          </p>
        )}
      </Card>

      <Card title="Dış kaynaklar">
        <p className="text-sm font-medium">{agreementLabel(summary)}</p>
        {summary.sources.length > 0 && (
          <p className="text-xs text-slate-500">{summary.agreement.trace}</p>
        )}
        {summary.sources.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="py-1 pr-3 font-semibold">Kaynak</th>
                  <th className="py-1 pr-3 font-semibold">Sınıflandırma</th>
                  <th className="py-1 font-semibold">Lisans</th>
                </tr>
              </thead>
              <tbody>
                {summary.sources.map((s) => {
                  const reg = registry[s.record.source_id];
                  const extra = [
                    s.notEvaluated.length > 0 &&
                      `motorda değerlendirilmeyen: ${s.notEvaluated.join(', ')}`,
                    s.notInClp.length > 0 && `SEA'da karşılığı yok: ${s.notInClp.join(', ')}`,
                    s.unreadable.length > 0 && `okunamayan: ${s.unreadable.join(' | ')}`,
                    s.reports.length > 0 &&
                      `${s.reports.length} rapor, her sınıfta en yenisi geçerli: ${s.reports.join(', ')}`,
                  ].filter(Boolean);
                  return (
                    <tr key={s.record.source_id} className="border-t border-slate-100 align-top">
                      <td className="py-2 pr-3">
                        <b className="block">{familyLabel(s.record.family)}</b>
                        <a
                          href={s.record.reference}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-sky-800 underline"
                        >
                          {s.record.name ?? s.record.source_id}
                        </a>
                      </td>
                      <td className="py-2 pr-3">
                        {s.lines.length > 0
                          ? s.lines
                              .map(
                                (l) =>
                                  `${lineText(l)}${l.uncertain ? ' (kategori kaynakta yok)' : ''}`,
                              )
                              .join(', ')
                          : s.record.not_classified
                            ? 'Sınıflandırılmamış'
                            : '—'}
                        {extra.length > 0 && (
                          <small className="block text-slate-500">{extra.join(' · ')}</small>
                        )}
                      </td>
                      <td className="py-2 text-xs">
                        {reg?.data_license === 'unverified' ? (
                          <>
                            <span className="text-amber-700">netleşmedi</span>
                            {reg.license_url && (
                              <a
                                href={reg.license_url}
                                target="_blank"
                                rel="noreferrer"
                                className="ml-1 text-sky-800 underline"
                              >
                                şartlar
                              </a>
                            )}
                            {platformAdmin && (
                              <button
                                type="button"
                                onClick={() => void clearLicense(s.record.source_id)}
                                className="ml-1 block font-semibold text-sky-800 underline"
                              >
                                Uygun, herkese aç
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="text-emerald-700">uygun</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {summary.agreement.status === 'conflict' && (
          <ul className="text-xs text-slate-600">
            {summary.agreement.differences.map((d) => (
              <li key={d.hazardClass}>
                <b>{d.hazardClass}</b>:{' '}
                {Object.entries(d.byFamily)
                  .map(([f, v]) => `${familyLabel(f)}: ${v ?? 'yok'}`)
                  .join(' · ')}
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => void refresh()}
          className="justify-self-start text-xs font-semibold text-sky-800 underline"
        >
          Kaynakları yeniden oku
        </button>
      </Card>

      <Card title="KDU uzman değerlendirmesi">
        {confirmed ? (
          <p className="text-sm">
            Kayıtlı:{' '}
            {confirmed.lines.length > 0 ? confirmed.lines.map(lineText).join(', ') : 'ek sınıf yok'}{' '}
            <small className="text-slate-500">
              ({new Date(confirmed.verifiedAt).toLocaleDateString('tr-TR')})
            </small>
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            Kayıt yok. Bu maddeyi tedarikçi SDS'i olmadan, yalnızca CAS ile kullanan SDS'ler taslak
            kalır. Tedarikçi SDS'i alınamıyorsa KDU kendi değerlendirmesini burada kaydedebilir.
          </p>
        )}
        {isKdu && substance ? (
          <ConfirmForm
            key={`${version}`}
            ek6={ek6}
            summary={summary}
            hasConfirmed={!!confirmed}
            onConfirm={async (lines, choice) => {
              setError(null);
              const failed = await confirmOutside({
                organizationId: org,
                userId,
                substanceId: substance.id,
                summary,
                lines,
                choice,
              });
              if (failed) setError(failed);
              reload();
            }}
          />
        ) : (
          !isKdu && (
            <p className="text-xs text-slate-500">Değerlendirmeyi firmanın KDU'su kaydeder.</p>
          )
        )}
      </Card>
    </div>
  );
}

/** The KDU picks a starting point, fixes categories the sources leave open, and confirms. */
function ConfirmForm({
  ek6,
  summary,
  hasConfirmed,
  onConfirm,
}: {
  ek6: HarmonisedEntry | null;
  summary: OutsideSummary;
  hasConfirmed: boolean;
  onConfirm: (lines: { category: string; hCode: string }[], choice: string) => Promise<void>;
}) {
  const options: { key: string; label: string; lines: Line[] }[] = [];
  if (summary.sources.length > 0) {
    options.push({
      key: 'draft',
      label:
        summary.agreement.status === 'agreed'
          ? 'Kaynakların uyumlu sınıflandırması'
          : 'Önerilen: her sınıfta kaynakların en ağırı',
      lines: summary.draftLines.map((l) => ({
        category: l.category,
        hCode: l.hCode,
        ...(l.uncertain ? { candidates: l.uncertain.candidates } : {}),
      })),
    });
    for (const s of summary.sources) {
      if (summary.sources.length < 2) break;
      options.push({
        key: s.record.source_id,
        label: `Yalnızca ${familyLabel(s.record.family)}`,
        lines: s.lines.map((l) => ({
          category: l.category,
          hCode: l.hCode,
          ...(l.uncertain ? { candidates: l.uncertain.candidates } : {}),
        })),
      });
    }
  }
  options.push({
    key: 'none',
    label: ek6 ? 'Ek-6 dışında ek sınıf yok' : 'Sınıflandırılmaz (veri ile doğrulandı)',
    lines: [],
  });

  const [choice, setChoice] = useState(options[0]?.key ?? 'none');
  const [lines, setLines] = useState<Line[]>(options[0]?.lines ?? []);
  // Closed at first: the supplier SDS is the source; this is the KDU's deliberate exception.
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="justify-self-start text-xs font-semibold text-sky-800 underline"
      >
        {hasConfirmed ? 'Yeniden değerlendir' : 'Uzman değerlendirmesi kaydet'}
      </button>
    );
  }

  const pick = (key: string) => {
    setChoice(key);
    setLines(options.find((o) => o.key === key)?.lines ?? []);
  };
  const unresolved = lines.filter((l) => l.candidates);
  const label = options.find((o) => o.key === choice)?.label ?? choice;

  return (
    <div className="grid gap-3 border-t border-slate-100 pt-3">
      <div className="grid gap-1 text-sm">
        {options.map((o) => (
          <label key={o.key} className="flex items-center gap-2">
            <input type="radio" checked={choice === o.key} onChange={() => pick(o.key)} />
            {o.label}
          </label>
        ))}
      </div>
      <ul className="grid gap-1 text-sm">
        {lines.map((l, i) => (
          <li key={`${l.hCode}-${i}`} className="flex flex-wrap items-center gap-2">
            {l.candidates ? (
              <select
                value=""
                onChange={(e) =>
                  setLines((ls) =>
                    ls.map((x, j) => (j === i ? { category: e.target.value, hCode: x.hCode } : x)),
                  )
                }
                className="rounded border border-amber-400 px-1 py-0.5"
              >
                <option value="">Kategori seç ({l.hCode})</option>
                {l.candidates.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : (
              <span>{lineText(l)}</span>
            )}
            <button
              type="button"
              onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
              className="text-xs text-red-700 underline"
            >
              çıkar
            </button>
          </li>
        ))}
      </ul>
      <AddLine onAdd={(l) => setLines((ls) => [...ls, l])} />
      <button
        type="button"
        disabled={saving || unresolved.length > 0}
        onClick={() => {
          setSaving(true);
          void onConfirm(
            lines.map((l) => ({ category: l.category, hCode: l.hCode })),
            label,
          ).finally(() => setSaving(false));
        }}
        className="justify-self-start rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {unresolved.length > 0
          ? 'Önce belirsiz kategorileri seç'
          : saving
            ? 'Kaydediliyor…'
            : 'Değerlendirmeyi kaydet'}
      </button>
    </div>
  );
}

/** Adds a line by hand: a CLP category and one of its hazard statements. */
function AddLine({ onAdd }: { onAdd: (line: Line) => void }) {
  const [category, setCategory] = useState<HazardCategory | ''>('');
  const [hCode, setHCode] = useState('');
  const codes = category ? hCodeOptions(category) : [];
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <select
        value={category}
        onChange={(e) => {
          const c = e.target.value as HazardCategory | '';
          setCategory(c);
          setHCode(c ? (hCodeOptions(c)[0] ?? '') : '');
        }}
        className="rounded border border-slate-300 px-1 py-0.5"
      >
        <option value="">Sınıf ekle…</option>
        {HAZARD_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {codes.length > 1 && (
        <select
          value={hCode}
          onChange={(e) => setHCode(e.target.value)}
          className="rounded border border-slate-300 px-1 py-0.5"
        >
          {codes.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      )}
      {category && (
        <button
          type="button"
          onClick={() => {
            onAdd({ category, hCode });
            setCategory('');
            setHCode('');
          }}
          className="text-xs font-semibold text-sky-800 underline"
        >
          ekle
        </button>
      )}
    </div>
  );
}
