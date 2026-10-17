import type { AdditiveCriterion } from '../summation';
import type { HazardCategory, HazardClassId, TraceEntry } from '../types';
import { type Component, emptyOutput, type RuleOutput } from '../util';
import { findByCriteria, toOutput } from './common';
import { findByThresholds, type ThresholdRule } from './threshold';

function same(categories: HazardCategory[], limits: number[], reference: string): ThresholdRule[] {
  return categories.map((category, i) => ({
    componentCategory: category,
    mixtureCategory: category,
    genericLimit: limits[i] as number,
    sclCategories: categories.slice(0, i + 1),
    reference,
  }));
}

const CMR: [HazardClassId, ThresholdRule[]][] = [
  [
    'germ_cell_mutagenicity',
    same(['Muta. 1A', 'Muta. 1B', 'Muta. 2'], [0.1, 0.1, 1], 'CLP Ek I Tablo 3.5.2'),
  ],
  [
    'carcinogenicity',
    same(['Carc. 1A', 'Carc. 1B', 'Carc. 2'], [0.1, 0.1, 1], 'CLP Ek I Tablo 3.6.2'),
  ],
  [
    'reproductive_toxicity',
    same(['Repr. 1A', 'Repr. 1B', 'Repr. 2'], [0.3, 0.3, 3], 'CLP Ek I Tablo 3.7.2'),
  ],
  ['lactation', same(['Lact.'], [0.3], 'CLP Ek I Tablo 3.7.2')],
];

const H_VARIANT_NOTE: TraceEntry = {
  message:
    'Zararlılık ifadesi bileşenin kendi ifadesinden alındı (ör. H350i, H360FD). Farklı varyantların birleştirilmesi KDU kontrolündedir (TODO(KDU) #13).',
  reference: 'CLP Ek I 1.1.2.1.2 / Ek III',
};

/** Germ cell mutagenicity, carcinogenicity, reproductive toxicity, lactation. */
export function classifyCmr(components: readonly Component[]): RuleOutput {
  const output = emptyOutput();
  for (const [hazardClass, rules] of CMR) {
    const findings = findByThresholds(components, rules, true);
    const part = toOutput(
      hazardClass,
      findings,
      components,
      findings.upper ? [H_VARIANT_NOTE] : [],
    );
    output.classifications.push(...part.classifications);
    Object.assign(output.status, part.status);
  }
  return output;
}

function stotRules(
  prefix: 'STOT SE' | 'STOT RE',
  reference: string,
  sclCategories1: HazardCategory[],
): ThresholdRule[] {
  const c1 = `${prefix} 1` as HazardCategory;
  const c2 = `${prefix} 2` as HazardCategory;
  return [
    // Category 1 ingredient ≥ 10 % → category 1; 1 % ≤ C < 10 % → category 2;
    // category 2 ingredient ≥ 10 % → category 2.
    {
      componentCategory: c1,
      mixtureCategory: c1,
      genericLimit: 10,
      sclCategories: sclCategories1,
      reference,
    },
    {
      componentCategory: c1,
      mixtureCategory: c2,
      genericLimit: 1,
      sclCategories: [c1, c2],
      reference,
    },
    {
      componentCategory: c2,
      mixtureCategory: c2,
      genericLimit: 10,
      sclCategories: [c2],
      reference,
    },
  ];
}

const ORGAN_NOTE: TraceEntry = {
  message:
    'Hedef organ ve maruz kalma yolu bilgisi zararlılık ifadesine motor tarafından eklenmez; KDU tamamlar (TODO(KDU) #14).',
  reference: 'CLP Ek I 3.8.2.1 / 3.9.2.1',
};

/** Specific target organ toxicity, single (incl. category 3) and repeated exposure. */
export function classifyStot(components: readonly Component[]): RuleOutput {
  const output = emptyOutput();

  const se = findByThresholds(
    components,
    stotRules('STOT SE', 'CLP Ek I Tablo 3.8.3', ['STOT SE 1']),
    false,
  );
  const sePart = toOutput('stot_single', se, components, se.upper ? [ORGAN_NOTE] : []);
  output.classifications.push(...sePart.classifications);
  let seClassified = se.upper !== null;

  // Category 3 effects add up separately for respiratory irritation and narcotic effects.
  for (const hCode of ['H335', 'H336']) {
    const criterion: AdditiveCriterion = {
      target: 'STOT SE 3',
      genericLimits: { 'STOT SE 3': 20 },
      sclCategories: ['STOT SE 3'],
      reference: 'CLP Ek I 3.8.3.4.5 (kategori 3 için genel sınır %20; TODO(KDU) #14)',
    };
    const findings = findByCriteria(
      components.map((c) => ({
        ...c,
        known: c.known.filter((k) => k.category !== 'STOT SE 3' || k.hCode === hCode),
      })),
      [criterion],
      hCode,
    );
    const part = toOutput('stot_single', findings, components);
    output.classifications.push(...part.classifications);
    seClassified ||= findings.upper !== null;
  }
  output.status.stot_single = seClassified
    ? 'classified'
    : (sePart.status.stot_single ?? 'not_classified');

  const re = findByThresholds(
    components,
    stotRules('STOT RE', 'CLP Ek I Tablo 3.9.4', ['STOT RE 1']),
    false,
  );
  const rePart = toOutput('stot_repeated', re, components, re.upper ? [ORGAN_NOTE] : []);
  output.classifications.push(...rePart.classifications);
  Object.assign(output.status, rePart.status);
  return output;
}
