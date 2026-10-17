import type { HazardCategory, MixtureMeasurements } from '../types';
import {
  atLeast,
  BOUNDS,
  type Component,
  conc,
  emptyOutput,
  fmt,
  fmtPctRange,
  notClassifiedStatus,
  type RuleOutput,
} from '../util';
import { type BoundFindings, toOutput } from './common';

const ASPIRATION_REF = 'CLP Ek I 3.10.3.3.1';
const VISCOSITY_LIMIT = 20.5;

/** Aspiration: Asp. Tox. 1 ingredients ≥ 10 % and kinematic viscosity ≤ 20.5 mm²/s at 40 °C. */
export function classifyAspiration(
  components: readonly Component[],
  measurements: MixtureMeasurements,
): RuleOutput {
  const output = emptyOutput();
  const contributors = components.filter((c) => c.known.some((k) => k.category === 'Asp. Tox. 1'));
  const sum = (bound: 'lower' | 'upper') => contributors.reduce((s, c) => s + conc(c, bound), 0);
  const total = { lower: sum('lower'), upper: sum('upper') };
  const range = fmtPctRange(total.lower, total.upper);

  if (!atLeast(total.upper, 10)) {
    output.status.aspiration = notClassifiedStatus(components);
    return output;
  }
  const viscosity = measurements.kinematicViscosity40C;
  if (viscosity === undefined) {
    output.status.aspiration = 'undetermined';
    output.warnings.push({
      code: 'ASPIRATION_VISCOSITY_MISSING',
      severity: 'blocking',
      hazardClass: 'aspiration',
      componentIds: contributors.map((c) => c.id),
      message: `Asp. Tox. 1 bileşenlerin toplamı ${range} ≥ %10, ama 40 °C'deki kinematik viskozite ölçülmemiş. H304 belirlenemedi; ölçüm girilmeden form kesinleşemez.`,
    });
    return output;
  }
  if (viscosity > VISCOSITY_LIMIT) {
    output.status.aspiration = notClassifiedStatus(components);
    return output;
  }
  const findings: BoundFindings = { lower: null, upper: null };
  for (const bound of BOUNDS) {
    if (!atLeast(total[bound], 10)) continue;
    findings[bound] = {
      category: 'Asp. Tox. 1',
      hCodes: ['H304'],
      trace: {
        message: `H304 (Asp. Tox. 1), çünkü Asp. Tox. 1 bileşenlerin toplamı ${range} ≥ %10 ve ölçülen kinematik viskozite ${fmt(viscosity)} mm²/s ≤ ${fmt(VISCOSITY_LIMIT)} mm²/s (40 °C)`,
        reference: ASPIRATION_REF,
      },
    };
  }
  return toOutput('aspiration', findings, components);
}

const ACUTE_REF = 'CLP Ek I Tablo 4.1.1';
const CHRONIC_REF = 'CLP Ek I Tablo 4.1.2';

type AquaticCat =
  | 'Aquatic Acute 1'
  | 'Aquatic Chronic 1'
  | 'Aquatic Chronic 2'
  | 'Aquatic Chronic 3'
  | 'Aquatic Chronic 4';

interface WeightedCriterion {
  target: AquaticCat;
  /** Weight per contributing category; `m` multiplies by the component's M-factor. */
  weights: Partial<Record<HazardCategory, { factor: number; m?: 'acute' | 'chronic' }>>;
  formula: string;
  reference: string;
}

const AQUATIC_ACUTE: WeightedCriterion[] = [
  {
    target: 'Aquatic Acute 1',
    weights: { 'Aquatic Acute 1': { factor: 1, m: 'acute' } },
    formula: 'Σ(Acute 1 × M)',
    reference: ACUTE_REF,
  },
];

const AQUATIC_CHRONIC: WeightedCriterion[] = [
  {
    target: 'Aquatic Chronic 1',
    weights: { 'Aquatic Chronic 1': { factor: 1, m: 'chronic' } },
    formula: 'Σ(Chronic 1 × M)',
    reference: CHRONIC_REF,
  },
  {
    target: 'Aquatic Chronic 2',
    weights: {
      'Aquatic Chronic 1': { factor: 10, m: 'chronic' },
      'Aquatic Chronic 2': { factor: 1 },
    },
    formula: '(M × 10 × Chronic 1) + Chronic 2',
    reference: CHRONIC_REF,
  },
  {
    target: 'Aquatic Chronic 3',
    weights: {
      'Aquatic Chronic 1': { factor: 100, m: 'chronic' },
      'Aquatic Chronic 2': { factor: 10 },
      'Aquatic Chronic 3': { factor: 1 },
    },
    formula: '(M × 100 × Chronic 1) + (10 × Chronic 2) + Chronic 3',
    reference: CHRONIC_REF,
  },
  {
    target: 'Aquatic Chronic 4',
    weights: {
      'Aquatic Chronic 1': { factor: 1 },
      'Aquatic Chronic 2': { factor: 1 },
      'Aquatic Chronic 3': { factor: 1 },
      'Aquatic Chronic 4': { factor: 1 },
    },
    formula: 'Chronic 1 + Chronic 2 + Chronic 3 + Chronic 4',
    reference: CHRONIC_REF,
  },
];

const H_CODES: Record<AquaticCat, string> = {
  'Aquatic Acute 1': 'H400',
  'Aquatic Chronic 1': 'H410',
  'Aquatic Chronic 2': 'H411',
  'Aquatic Chronic 3': 'H412',
  'Aquatic Chronic 4': 'H413',
};

/** Hazards to the aquatic environment by the summation method with M-factors. */
export function classifyAquatic(components: readonly Component[]): RuleOutput {
  const output = emptyOutput();

  for (const component of components) {
    for (const [category, kind] of [
      ['Aquatic Acute 1', 'acute'],
      ['Aquatic Chronic 1', 'chronic'],
    ] as const) {
      if (
        component.known.some((k) => k.category === category) &&
        component.mFactors?.[kind] === undefined
      ) {
        output.warnings.push({
          code: 'AQUATIC_M_FACTOR_MISSING',
          severity: 'review',
          hazardClass: kind === 'acute' ? 'aquatic_acute' : 'aquatic_chronic',
          componentIds: [component.id],
          message: `${component.name} ${category} ama M-faktörü girilmemiş; M = 1 varsayıldı (TODO(KDU) #15).`,
        });
      }
    }
  }

  for (const [hazardClass, criteria] of [
    ['aquatic_acute', AQUATIC_ACUTE],
    ['aquatic_chronic', AQUATIC_CHRONIC],
  ] as const) {
    const findings: BoundFindings = { lower: null, upper: null };
    for (const criterion of criteria) {
      const sums = { lower: 0, upper: 0 };
      const parts: string[] = [];
      for (const component of components) {
        const k = component.known.find((x) => criterion.weights[x.category] !== undefined);
        if (!k) continue;
        const weight = criterion.weights[k.category] as { factor: number; m?: 'acute' | 'chronic' };
        const m = weight.m ? (component.mFactors?.[weight.m] ?? 1) : 1;
        for (const bound of BOUNDS) sums[bound] += conc(component, bound) * weight.factor * m;
        parts.push(
          `${component.name} ${k.category} ${fmtPctRange(component.concentration.min, component.concentration.max)}${weight.m ? ` × M ${fmt(m)}` : ''}${weight.factor !== 1 ? ` × ${weight.factor}` : ''}`,
        );
      }
      for (const bound of BOUNDS) {
        if (findings[bound] || parts.length === 0 || !atLeast(sums[bound], 25)) continue;
        const hCode = H_CODES[criterion.target];
        findings[bound] = {
          category: criterion.target,
          hCodes: [hCode],
          trace: {
            message: `${hCode} (${criterion.target}), çünkü ${criterion.formula} = ${fmtPctRange(sums.lower, sums.upper)} ≥ %25 (${parts.join('; ')})`,
            reference: criterion.reference,
          },
        };
      }
    }
    const part = toOutput(hazardClass, findings, components);
    output.classifications.push(...part.classifications);
    Object.assign(output.status, part.status);
  }
  return output;
}
