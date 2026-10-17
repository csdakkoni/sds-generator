import type { AdditiveCriterion } from '../summation';
import type { HazardCategory } from '../types';
import type { Component, RuleOutput } from '../util';
import { type BoundFindings, findByCriteria, toOutput } from './common';

const SKIN_TABLE = 'CLP Ek I Tablo 3.2.3';
const EYE_TABLE = 'CLP Ek I Tablo 3.3.3';

const CORR_SUB: HazardCategory[] = ['Skin Corr. 1A', 'Skin Corr. 1B', 'Skin Corr. 1C'];
const CORR_ALL: HazardCategory[] = ['Skin Corr. 1', ...CORR_SUB];

function limits(categories: readonly HazardCategory[], limit: number) {
  return Object.fromEntries(categories.map((c) => [c, limit])) as Partial<
    Record<HazardCategory, number>
  >;
}

const SKIN_IRRIT: AdditiveCriterion = {
  target: 'Skin Irrit. 2',
  // Skin Corr. 1 ≥ 1 % (< 5 %), Skin Irrit. 2 ≥ 10 %, or (10 × Skin Corr. 1) + Skin Irrit. 2 ≥ 10 %.
  genericLimits: { ...limits(CORR_ALL, 1), 'Skin Irrit. 2': 10 },
  sclCategories: [...CORR_ALL, 'Skin Irrit. 2'],
  reference: SKIN_TABLE,
};

// Sub-categorised: 1A ≥ 5 % → 1A; 1A + 1B ≥ 5 % → 1B; 1A + 1B + 1C ≥ 5 % → 1C.
const SKIN_SUBCATEGORISED: AdditiveCriterion[] = [
  {
    target: 'Skin Corr. 1A',
    genericLimits: limits(['Skin Corr. 1A'], 5),
    sclCategories: ['Skin Corr. 1A'],
    reference: SKIN_TABLE,
  },
  {
    target: 'Skin Corr. 1B',
    genericLimits: limits(['Skin Corr. 1A', 'Skin Corr. 1B'], 5),
    sclCategories: ['Skin Corr. 1A', 'Skin Corr. 1B'],
    reference: SKIN_TABLE,
  },
  {
    target: 'Skin Corr. 1C',
    genericLimits: limits(CORR_SUB, 5),
    sclCategories: CORR_SUB,
    reference: SKIN_TABLE,
  },
  SKIN_IRRIT,
];

// TODO(KDU) #3: when at least one ingredient is Skin Corr. 1 without sub-category, the mixture is
// Skin Corr. 1 without sub-category if the sum of all corrosive ingredients is ≥ 5 %.
const SKIN_UNSUBCATEGORISED: AdditiveCriterion[] = [
  {
    target: 'Skin Corr. 1',
    genericLimits: limits(CORR_ALL, 5),
    sclCategories: CORR_ALL,
    reference: `${SKIN_TABLE} (alt kategorisiz Skin Corr. 1 bileşen notu)`,
  },
  SKIN_IRRIT,
];

const EYE: AdditiveCriterion[] = [
  {
    target: 'Eye Dam. 1',
    // Skin Corr. 1 + Eye Dam. 1 ≥ 3 %.
    genericLimits: { ...limits(CORR_ALL, 3), 'Eye Dam. 1': 3 },
    sclCategories: ['Eye Dam. 1'],
    reference: EYE_TABLE,
  },
  {
    target: 'Eye Irrit. 2',
    // Skin Corr. 1 + Eye Dam. 1 ≥ 1 % (< 3 %), Eye Irrit. 2 ≥ 10 %,
    // or 10 × (Skin Corr. 1 + Eye Dam. 1) + Eye Irrit. 2 ≥ 10 %.
    genericLimits: { ...limits(CORR_ALL, 1), 'Eye Dam. 1': 1, 'Eye Irrit. 2': 10 },
    sclCategories: ['Eye Dam. 1', 'Eye Irrit. 2'],
    reference: EYE_TABLE,
  },
];

export function classifySkin(components: readonly Component[]): {
  output: RuleOutput;
  findings: BoundFindings;
} {
  const hasUnsubcategorised = components.some((c) =>
    c.known.some((k) => k.category === 'Skin Corr. 1'),
  );
  const findings = findByCriteria(
    components,
    hasUnsubcategorised ? SKIN_UNSUBCATEGORISED : SKIN_SUBCATEGORISED,
  );
  return { output: toOutput('skin_corrosion_irritation', findings, components), findings };
}

/**
 * Eye damage/irritation. A mixture classified Skin Corr. 1 is also taken as Eye Dam. 1
 * (TODO(KDU) #6: confirm, matters when an SCL makes the mixture corrosive below 3 %).
 */
export function classifyEye(components: readonly Component[], skin: BoundFindings): RuleOutput {
  const findings = findByCriteria(components, EYE);
  for (const bound of ['lower', 'upper'] as const) {
    const skinFinding = skin[bound];
    if (!skinFinding || !CORR_ALL.includes(skinFinding.category)) continue;
    if (findings[bound]?.category === 'Eye Dam. 1') continue;
    findings[bound] = {
      category: 'Eye Dam. 1',
      hCodes: ['H318'],
      trace: {
        message: `H318 (Eye Dam. 1), çünkü karışım ${skinFinding.category} olarak sınıflandırıldı; cilt aşındırıcı karışım ciddi göz hasarı da kabul edilir`,
        reference: 'CLP Ek I 3.3 (cilt aşındırıcılığı → ciddi göz hasarı)',
      },
    };
  }
  return toOutput('eye_damage_irritation', findings, components);
}
