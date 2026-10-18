import type {
  ClassificationResult,
  EngineWarning,
  HazardClassId,
  Pictogram,
} from '@sds/classification-engine';

/** Shows the engine's result as it is; nothing here changes a hazard (CLAUDE.md rule 1). */

export const HAZARD_CLASS_TR: Record<HazardClassId, string> = {
  flammable_liquid: 'Alevlenir sıvılar',
  metal_corrosion: 'Metalleri aşındırıcı',
  acute_toxicity_oral: 'Akut toksisite (ağız)',
  acute_toxicity_dermal: 'Akut toksisite (deri)',
  acute_toxicity_inhalation: 'Akut toksisite (soluma)',
  skin_corrosion_irritation: 'Cilt aşınması / tahrişi',
  eye_damage_irritation: 'Ciddi göz hasarı / tahrişi',
  respiratory_sensitisation: 'Solunum hassasiyeti',
  skin_sensitisation: 'Cilt hassasiyeti',
  germ_cell_mutagenicity: 'Eşey hücre mutajenitesi',
  carcinogenicity: 'Kanserojenite',
  reproductive_toxicity: 'Üreme sistemi toksisitesi',
  lactation: 'Emzirme üzerinden etkiler',
  stot_single: 'Belirli hedef organ toksisitesi (tek maruz kalma)',
  stot_repeated: 'Belirli hedef organ toksisitesi (tekrarlı maruz kalma)',
  aspiration: 'Aspirasyon tehlikesi',
  aquatic_acute: 'Sucul ortam, akut',
  aquatic_chronic: 'Sucul ortam, kronik',
};

const PICTOGRAM_TR: Record<Pictogram, string> = {
  GHS01: 'Patlayıcı',
  GHS02: 'Alev',
  GHS03: 'Oksitleyici',
  GHS04: 'Basınçlı gaz',
  GHS05: 'Aşındırıcı',
  GHS06: 'Kurukafa',
  GHS07: 'Ünlem işareti',
  GHS08: 'Sağlık tehlikesi',
  GHS09: 'Çevre',
};

const SEVERITY: Record<EngineWarning['severity'], { title: string; cls: string }> = {
  blocking: { title: 'Tamamlanması gerekenler', cls: 'border-red-200 bg-red-50 text-red-800' },
  review: { title: 'KDU kontrol etmeli', cls: 'border-amber-200 bg-amber-50 text-amber-900' },
  info: { title: 'Bilgi', cls: 'border-sky-200 bg-sky-50 text-sky-900' },
};

const fmt = (n: number | null) =>
  n === null ? '?' : new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(n);

export function ClassificationView({
  result,
  notes,
}: {
  result: ClassificationResult;
  notes: EngineWarning[];
}) {
  const warnings = [...notes, ...result.warnings];
  const canFinalize = result.canFinalize && !notes.some((n) => n.severity === 'blocking');
  const undetermined = (Object.keys(result.classStatus) as HazardClassId[]).filter(
    (c) => result.classStatus[c] === 'undetermined',
  );
  const { label } = result;

  return (
    <div className="grid gap-4">
      <p
        className={`rounded-md px-3 py-2 text-sm font-semibold ${canFinalize ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}
      >
        {canFinalize
          ? 'Sınıflandırma tamamlanabilir. KDU kontrol edip SDS adımına geçebilir.'
          : 'Sınıflandırma henüz kesinleşemez: aşağıdaki eksikler tamamlanmalı.'}
      </p>

      <div className="flex flex-wrap items-center gap-6">
        <div>
          <p className="text-xs text-slate-500">Uyarı kelimesi</p>
          <p
            className={`text-2xl font-bold ${label.signalWord === 'danger' ? 'text-red-700' : 'text-slate-900'}`}
          >
            {label.signalWord === 'danger'
              ? 'TEHLİKE'
              : label.signalWord === 'warning'
                ? 'DİKKAT'
                : 'Yok'}
          </p>
        </div>
        <ul className="flex flex-wrap gap-4" aria-label="Piktogramlar">
          {label.pictograms.length === 0 && (
            <li className="text-sm text-slate-500">Piktogram yok</li>
          )}
          {label.pictograms.map((p) => (
            <li key={p} className="grid justify-items-center gap-2">
              <span className="grid h-14 w-14 rotate-45 place-items-center border-4 border-red-600 bg-white">
                <span className="-rotate-45 text-xs font-bold">{p}</span>
              </span>
              <span className="text-xs text-slate-600">{PICTOGRAM_TR[p]}</span>
            </li>
          ))}
        </ul>
      </div>

      <section className="grid gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Sınıflandırma ve gerekçesi
        </h3>
        {result.classifications.length === 0 && (
          <p className="text-sm text-slate-500">Hesaplanan bir tehlike sınıfı yok.</p>
        )}
        <ul className="grid gap-2">
          {result.classifications.map((c) => (
            <li key={c.hazardClass} className="rounded-md border border-slate-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                {c.hCodes.map((h) => (
                  <span
                    key={h}
                    className="rounded border-2 border-red-700 bg-red-50 px-1.5 py-0.5 font-mono text-xs font-bold text-red-700"
                  >
                    {h}
                  </span>
                ))}
                <b className="text-sm">{c.category}</b>
                <span className="text-sm text-slate-500">{HAZARD_CLASS_TR[c.hazardClass]}</span>
              </div>
              <ul className="mt-2 grid gap-1 text-sm text-slate-700">
                {c.trace.map((t, i) => (
                  <li key={i}>
                    {t.message} <span className="text-xs text-slate-500">({t.reference})</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        {label.supplemental.length > 0 && (
          <ul className="grid gap-1 text-sm">
            {label.supplemental.map((s) => (
              <li key={s.code}>
                <b className="font-mono">{s.code}</b> {s.detail}{' '}
                <span className="text-xs text-slate-500">({s.trace.reference})</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {result.ate.some((a) => a.upper !== null) && (
        <section className="grid gap-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Karışımın akut toksisite tahmini (ATEmix)
          </h3>
          <ul className="text-sm">
            {result.ate.map((a) => (
              <li key={`${a.route}-${a.form ?? ''}`}>
                {{ oral: 'Ağız', dermal: 'Deri', inhalation: 'Soluma' }[a.route]}:{' '}
                {[a.lower, a.upper]
                  .filter((v): v is number => v !== null)
                  .sort((x, y) => x - y)
                  .map(fmt)
                  .join(' – ')}{' '}
                {a.unit}
              </li>
            ))}
          </ul>
        </section>
      )}

      {undetermined.length > 0 && (
        <section className="grid gap-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Belirlenemeyen sınıflar
          </h3>
          <p className="text-sm text-slate-600">
            Veri eksik olduğu için bu sınıflar için "tehlike yok" denemiyor:{' '}
            {undetermined.map((c) => HAZARD_CLASS_TR[c]).join(', ')}.
          </p>
        </section>
      )}

      {(['blocking', 'review', 'info'] as const).map((sev) => {
        const list = warnings.filter((w) => w.severity === sev);
        if (list.length === 0) return null;
        return (
          <section key={sev} className={`grid gap-1 rounded-md border p-3 ${SEVERITY[sev].cls}`}>
            <h3 className="text-sm font-bold">
              {SEVERITY[sev].title} ({list.length})
            </h3>
            <ul className="grid list-disc gap-1 pl-5 text-sm">
              {list.map((w, i) => (
                <li key={i}>{w.message}</li>
              ))}
            </ul>
          </section>
        );
      })}

      <p className="text-xs text-slate-500">
        Motor sürümü {result.engineVersion}. Konsantrasyon aralıklarında üst sınır varsayımı
        uygulandı (seçilmiş varsayım, yasal zorunluluk değil).
      </p>
    </div>
  );
}
