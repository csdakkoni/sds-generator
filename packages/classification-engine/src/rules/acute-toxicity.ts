import { type AcuteRoute, acuteHCode, acuteRouteOf } from '../categories';
import type {
  AteResult,
  HazardCategory,
  HazardClassId,
  InhalationForm,
  MixtureClassification,
  TraceEntry,
} from '../types';
import {
  type Bound,
  type Component,
  conc,
  emptyOutput,
  fmt,
  fmtPctRange,
  type RuleOutput,
} from '../util';

const FORMULA_REF = 'CLP Ek I 3.1.3.6.1 (ATE karışım formülü)';
const UNKNOWN_REF = 'CLP Ek I 3.1.3.6.2.3 (akut toksisitesi bilinmeyen bileşenler > %10)';

type Scale = 'oral' | 'dermal' | InhalationForm;
type Cat = 1 | 2 | 3 | 4;

/** Upper ATE limits of categories 1–4 (CLP Ek I Tablo 3.1.1). */
const CATEGORY_LIMITS: Record<Scale, [number, number, number, number]> = {
  oral: [5, 50, 300, 2000],
  dermal: [50, 200, 1000, 2000],
  gas: [100, 500, 2500, 20000],
  vapour: [0.5, 2, 10, 20],
  dust_mist: [0.05, 0.5, 1, 5],
};

/** Converted ATE point estimates for a classified ingredient without an ATE (CLP Ek I Tablo 3.1.2). */
const CONVERTED_ATE: Record<Scale, [number, number, number, number]> = {
  oral: [0.5, 5, 100, 500],
  dermal: [5, 50, 300, 1100],
  gas: [10, 100, 700, 4500],
  vapour: [0.05, 0.5, 3, 11],
  dust_mist: [0.005, 0.05, 0.5, 1.5],
};

const UNITS: Record<Scale, AteResult['unit']> = {
  oral: 'mg/kg',
  dermal: 'mg/kg',
  gas: 'ppmV',
  vapour: 'mg/l',
  dust_mist: 'mg/l',
};

const CLASS_ID: Record<AcuteRoute, HazardClassId> = {
  oral: 'acute_toxicity_oral',
  dermal: 'acute_toxicity_dermal',
  inhalation: 'acute_toxicity_inhalation',
};

const ROUTE_TR: Record<AcuteRoute, string> = {
  oral: 'ağız yolu',
  dermal: 'cilt yolu',
  inhalation: 'solunum yolu',
};

interface Contributor {
  component: Component;
  ate: number;
  source: string;
}

function categoryNumber(category: HazardCategory): Cat | null {
  const match = /^Acute Tox\. ([1-4])$/.exec(category);
  return match ? (Number(match[1]) as Cat) : null;
}

function categoryFor(ate: number, scale: Scale): Cat | null {
  const index = CATEGORY_LIMITS[scale].findIndex((limit) => ate <= limit);
  return index === -1 ? null : ((index + 1) as Cat);
}

export function classifyAcuteToxicity(components: readonly Component[]): RuleOutput {
  const output = emptyOutput();
  output.ate = [];
  for (const route of ['oral', 'dermal', 'inhalation'] as const) {
    if (route === 'inhalation') {
      classifyInhalation(components, output);
    } else {
      classifyRoute(components, route, route, contributorsFor(components, route, route), output);
    }
  }
  return output;
}

function contributorsFor(
  components: readonly Component[],
  route: AcuteRoute,
  scale: Scale,
): Contributor[] {
  const contributors: Contributor[] = [];
  for (const component of components) {
    const providedAte = component.ate?.[route];
    const classification = component.known.find(
      (k) => categoryNumber(k.category) !== null && acuteRouteOf(k.hCode) === route,
    );
    if (providedAte !== undefined && categoryFor(providedAte, scale) !== null) {
      contributors.push({ component, ate: providedAte, source: 'ATE' });
    } else if (classification) {
      const cat = categoryNumber(classification.category) as Cat;
      contributors.push({
        component,
        ate: CONVERTED_ATE[scale][cat - 1] as number,
        source: `${classification.category} dönüştürülmüş ATE (CLP Ek I Tablo 3.1.2)`,
      });
    }
  }
  return contributors;
}

function classifyInhalation(components: readonly Component[], output: RuleOutput): void {
  const byForm = new Map<InhalationForm, Component[]>();
  for (const component of components) {
    const relevant =
      component.ate?.inhalation !== undefined ||
      component.known.some(
        (k) => categoryNumber(k.category) !== null && acuteRouteOf(k.hCode) === 'inhalation',
      );
    if (!relevant) continue;
    if (!component.inhalationForm) {
      output.warnings.push({
        code: 'ACUTE_TOX_INHALATION_FORM_MISSING',
        severity: 'blocking',
        hazardClass: 'acute_toxicity_inhalation',
        componentIds: [component.id],
        message: `${component.name} için solunum yolu akut toksisite verisi var ama fiziksel form (gaz, buhar, toz/sis) girilmemiş; solunum ATE'si hesaplanamaz.`,
      });
      continue;
    }
    byForm.set(component.inhalationForm, [
      ...(byForm.get(component.inhalationForm) ?? []),
      component,
    ]);
  }
  if (byForm.size > 1) {
    output.warnings.push({
      code: 'ACUTE_TOX_INHALATION_MIXED_FORMS',
      severity: 'review',
      hazardClass: 'acute_toxicity_inhalation',
      message:
        'Bileşenler farklı solunum formlarında (gaz, buhar, toz/sis); her form ayrı hesaplandı. Karışımın solunabilir formu KDU tarafından değerlendirilmeli (TODO(KDU) #11).',
    });
  }
  if (byForm.size === 0) {
    classifyRoute(components, 'inhalation', 'vapour', [], output);
    return;
  }
  for (const [form, formComponents] of byForm) {
    classifyRoute(
      components,
      'inhalation',
      form,
      contributorsFor(formComponents, 'inhalation', form),
      output,
    );
  }
}

function classifyRoute(
  components: readonly Component[],
  route: AcuteRoute,
  scale: Scale,
  contributors: Contributor[],
  output: RuleOutput,
): void {
  const hazardClass = CLASS_ID[route];
  const unknown = components.filter((c) => c.hazardData === 'unknown');
  const ates: Record<Bound, number | null> = { lower: null, upper: null };
  const unknownShare: Record<Bound, number> = { lower: 0, upper: 0 };

  for (const bound of ['lower', 'upper'] as const) {
    unknownShare[bound] = unknown.reduce((s, c) => s + conc(c, bound), 0);
    const sum = contributors.reduce((s, c) => s + conc(c.component, bound) / c.ate, 0);
    if (sum === 0) continue;
    const known = unknownShare[bound] > 10 ? 100 - unknownShare[bound] : 100;
    ates[bound] = known / sum;
  }

  const form = route === 'inhalation' ? (scale as InhalationForm) : undefined;
  output.ate?.push({
    route,
    ...(form ? { form } : {}),
    lower: ates.lower,
    upper: ates.upper,
    unit: UNITS[scale],
  });

  if (unknown.length > 0) {
    output.warnings.push({
      code: 'ACUTE_TOX_UNKNOWN_INGREDIENTS',
      severity: 'review',
      hazardClass,
      componentIds: unknown.map((c) => c.id),
      message: `Karışımın ${fmtPctRange(unknownShare.lower, unknownShare.upper)} kadarı akut toksisitesi (${ROUTE_TR[route]}) bilinmeyen bileşenlerden oluşuyor: ${unknown.map((c) => c.name).join(', ')}. Bu, "tehlike yok" anlamına gelmez.`,
    });
  }

  // Lower ATE means more toxic: the upper concentration bound gives the lower ATEmix.
  const catUpper = ates.upper === null ? null : categoryFor(ates.upper, scale);
  const catLower = ates.lower === null ? null : categoryFor(ates.lower, scale);
  if (catUpper === null) {
    const prior = output.status[hazardClass];
    if (prior !== 'classified') {
      output.status[hazardClass] = unknown.length > 0 ? 'undetermined' : 'not_classified';
    }
    return;
  }

  const category = `Acute Tox. ${catUpper}` as HazardCategory;
  const hCode = acuteHCode(route, catUpper);
  const unit = UNITS[scale];
  const terms = contributors
    .map(
      (c) =>
        `${c.component.name} ${fmtPctRange(c.component.concentration.min, c.component.concentration.max)} / ${fmt(c.ate)} ${unit} (${c.source})`,
    )
    .join('; ');
  const trace: TraceEntry[] = [
    {
      message: `${hCode} (${category}), çünkü ATEmix (${ROUTE_TR[route]}${form ? `, ${form}` : ''}) = ${fmtAteRange(ates.lower, ates.upper)} ${unit} ≤ ${fmt(CATEGORY_LIMITS[scale][catUpper - 1] as number)} ${unit}; 100 / ATEmix = Σ Ci / ATEi (${terms})`,
      reference: `${FORMULA_REF}; CLP Ek I Tablo 3.1.1`,
    },
  ];
  if (unknownShare.upper > 10) {
    trace.push({
      message: `Bilinmeyen bileşenlerin payı ${fmtPctRange(unknownShare.lower, unknownShare.upper)} > %10 olduğu için formülde (100 − ΣC bilinmeyen) kullanıldı.`,
      reference: UNKNOWN_REF,
    });
  }
  if (catLower !== catUpper) {
    trace.push({
      message: `Konsantrasyon aralıklarının alt sınırında sonuç ${catLower ? `Acute Tox. ${catLower}` : 'sınıflandırılmaz'}, üst sınırında ${category}. Üst sınır varsayımı uygulandı (seçilmiş varsayım, yasal bir zorunluluk değil).`,
      reference: 'Motor varsayımı: üst sınır',
    });
  }

  const classification: MixtureClassification = {
    hazardClass,
    category,
    hCodes: [hCode],
    lowerBoundCategory: catLower ? (`Acute Tox. ${catLower}` as HazardCategory) : null,
    trace,
  };
  const existing = output.classifications.findIndex((c) => c.hazardClass === hazardClass);
  if (existing === -1) {
    output.classifications.push(classification);
  } else if (Number(output.classifications[existing]?.category.slice(-1)) > catUpper) {
    output.classifications[existing] = classification;
  }
  output.status[hazardClass] = 'classified';
}

function fmtAteRange(lower: number | null, upper: number | null): string {
  const show = (v: number | null) => (v === null ? '—' : fmt(Math.round(v * 100) / 100));
  return lower !== null && upper !== null && show(lower) === show(upper)
    ? show(upper)
    : `${show(upper)}–${show(lower)}`;
}
