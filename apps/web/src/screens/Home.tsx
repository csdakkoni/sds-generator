import { useEffect, useState } from 'react';
import { progress, type ProductSummary, type Progress, type Step } from '../lib/progress';
import { hasRole } from '../lib/review';
import { supabase } from '../lib/supabase';
import type { Membership, RawMaterial } from '../lib/types';
import { Alert, ButtonLink, Card, Icon, type IconName } from '../ui';

const MATERIALS =
  'id, trade_name, supplier_name, raw_material_components (sds_document_id), raw_material_sds_documents (id, status, extraction_status, flags, uploaded_at, revision_number, revision_date)';

const STEP: Record<
  Step['key'],
  { title: string; text: string; icon: IconName; href: string; action: string }
> = {
  upload: {
    title: "Tedarikçi SDS'lerini yükle",
    text: 'PDF klasörünü bırak; sistem her hammaddeyi okur ve kütüphanene ekler.',
    icon: 'upload',
    href: '#/hammaddeler',
    action: 'SDS yükle',
  },
  approve: {
    title: 'Eksikleri yanıtla, hammaddeleri onayla',
    text: 'Yalnızca sistemin emin olmadığı noktalar sorulur. Onay hammadde başına bir kez verilir.',
    icon: 'check',
    href: '#/hammaddeler',
    action: 'Hammaddelere git',
  },
  recipes: {
    title: 'Ürün reçetelerini gir',
    text: 'Reçeteyi Excel’den yapıştır; sınıflandırma anında hesaplanır.',
    icon: 'box',
    href: '#/urunler',
    action: 'Ürünlere git',
  },
  sds: {
    title: 'SDS ve etiketi yayımla',
    text: 'TR ve EN SDS taslağı her zaman hazırdır; KDU onayıyla yayımlanır.',
    icon: 'file',
    href: '#/sds',
    action: "SDS'lere git",
  },
};

function StepCard({ step, index }: { step: Step; index: number }) {
  const s = STEP[step.key];
  const active = step.state === 'active';
  return (
    <li
      className={`relative flex flex-wrap gap-4 rounded-xl border bg-white p-5 shadow-sm sm:flex-nowrap ${
        active ? 'border-sky-300 ring-2 ring-sky-100' : 'border-slate-200'
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          step.state === 'done'
            ? 'bg-emerald-100 text-emerald-700'
            : active
              ? 'bg-sky-900 text-white'
              : 'bg-slate-100 text-slate-500'
        }`}
      >
        {step.state === 'done' ? <Icon name="done" /> : <Icon name={s.icon} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Adım {index + 1}
          {step.state === 'done' && <span className="ml-2 text-emerald-700">Tamam</span>}
          {active && <span className="ml-2 text-sky-800">Sıradaki</span>}
        </p>
        <h3 className="mt-0.5 font-semibold text-slate-900">{s.title}</h3>
        <p className="mt-1 text-sm text-slate-500">{s.text}</p>
        <p className="mt-3 text-sm font-medium text-slate-700">{step.summary}</p>
      </div>
      <div className="w-full pl-14 sm:w-auto sm:self-center sm:pl-0">
        <ButtonLink href={s.href} variant={active ? 'primary' : 'secondary'}>
          {s.action}
        </ButtonLink>
      </div>
    </li>
  );
}

function Stat({ label, value, href }: { label: string; value: number | string; href: string }) {
  return (
    <a
      href={href}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-sky-300"
    >
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
    </a>
  );
}

/** The firm's starting page: where it stands on the way from supplier SDSs to published SDSs. */
export function Home({ membership }: { membership: Membership }) {
  const [data, setData] = useState<Progress | null>(null);
  const [kduOpen, setKduOpen] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const org = membership.organization_id;
  const isKdu = hasRole(membership, 'kdu');

  useEffect(() => {
    let active = true;
    void Promise.all([
      supabase.from('raw_materials').select(MATERIALS).eq('organization_id', org),
      supabase
        .from('products')
        .select('id, recipe_lines (id), sds_documents (language, status)')
        .eq('organization_id', org),
      isKdu
        ? supabase
            .from('kdu_review_queue')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', org)
            .eq('status', 'open')
        : Promise.resolve(null),
    ]).then(([m, p, k]) => {
      if (!active) return;
      if (m.error || p.error) {
        setError((m.error ?? p.error)?.message ?? '');
        return;
      }
      setData(progress(m.data as unknown as RawMaterial[], p.data as unknown as ProductSummary[]));
      if (k) setKduOpen(k.count ?? 0);
    });
    return () => {
      active = false;
    };
  }, [org, isKdu]);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {membership.organizations?.name}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Tedarikçi SDS'lerinden yayımlanmış SDS'e dört adım. Sistem bir sonraki adımı gösterir.
        </p>
      </div>
      {error && <Alert>{error}</Alert>}
      {data && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            label="Onaylı hammadde"
            value={`${data.materials.approved} / ${data.materials.total}`}
            href="#/hammaddeler"
          />
          <Stat label="Açık soru" value={data.materials.questions} href="#/hammaddeler" />
          <Stat label="Ürün" value={data.products.total} href="#/urunler" />
          {kduOpen !== null ? (
            <Stat label="KDU kontrol listesi" value={kduOpen} href="#/kdu" />
          ) : (
            <Stat label="Yayındaki SDS" value={data.products.published} href="#/sds" />
          )}
        </div>
      )}
      <Card title="Yol haritan" padded={false}>
        <ol className="grid gap-3 bg-slate-50 p-4">
          {data?.steps.map((s, i) => <StepCard key={s.key} step={s} index={i} />) ?? (
            <p className="p-4 text-sm text-slate-500">Yükleniyor…</p>
          )}
        </ol>
      </Card>
    </div>
  );
}
