import type { HazardCategory } from './types';
import {
  atLeast,
  BOUNDS,
  type Bound,
  classificationsIn,
  type Component,
  conc,
  fmt,
  fmtPctRange,
  fmtRange,
  sclLimit,
} from './util';

/**
 * One additive criterion: the mixture gets `target` when Σ Ci / Li ≥ 1, where Li is the
 * component's SCL (lowest lower limit among `sclCategories`) or else the generic limit of
 * its contributing category. Generic cut-off values are not applied (TODO(KDU) #2): every
 * component counts. With generic limits only, this equals the summation rows of
 * the CLP tables, e.g. (10 × Skin Corr. 1) + Skin Irrit. 2 ≥ 10 %.
 */
export interface AdditiveCriterion {
  target: HazardCategory;
  /** Contributing component category → generic concentration limit in %. */
  genericLimits: Partial<Record<HazardCategory, number>>;
  /** Component SCL categories that replace the generic limit for this target. */
  sclCategories: readonly HazardCategory[];
  reference: string;
}

export interface Term {
  component: Component;
  category: HazardCategory;
  hCode: string;
  limit: number;
  fromScl: boolean;
}

export function termsFor(
  components: readonly Component[],
  criterion: AdditiveCriterion,
  filter?: (hCode: string) => boolean,
): Term[] {
  const contributing = Object.keys(criterion.genericLimits) as HazardCategory[];
  const terms: Term[] = [];
  for (const component of components) {
    const matches = classificationsIn(component, contributing).filter(
      (k) => !filter || filter(k.hCode),
    );
    if (matches.length === 0) continue;
    // A component classified in several contributing categories counts once, at its lowest limit.
    const best = matches.reduce((a, b) =>
      (criterion.genericLimits[a.category] ?? Infinity) <=
      (criterion.genericLimits[b.category] ?? Infinity)
        ? a
        : b,
    );
    const scl = sclLimit(component, criterion.sclCategories);
    const generic = criterion.genericLimits[best.category] as number;
    terms.push({
      component,
      category: best.category,
      hCode: best.hCode,
      limit: scl ?? generic,
      fromScl: scl !== undefined,
    });
  }
  return terms;
}

export function ratioSum(terms: readonly Term[], bound: Bound): number {
  return terms.reduce((sum, t) => sum + conc(t.component, bound) / t.limit, 0);
}

export interface SumEvaluation {
  met: Record<Bound, boolean>;
  description: string;
}

export function evaluate(terms: readonly Term[]): SumEvaluation {
  const sums = { lower: ratioSum(terms, 'lower'), upper: ratioSum(terms, 'upper') };
  const met = {
    lower: terms.length > 0 && atLeast(sums.lower, 1),
    upper: terms.length > 0 && atLeast(sums.upper, 1),
  };
  return { met, description: describe(terms, sums, met) };
}

function describe(
  terms: readonly Term[],
  sums: Record<Bound, number>,
  met: Record<Bound, boolean>,
): string {
  const compare = (limit: string) =>
    met.lower === met.upper
      ? `${met.upper ? '≥' : '<'} ${limit}`
      : `(üst sınırda ${met.upper ? '≥' : '<'} ${limit}, alt sınırda ${met.lower ? '≥' : '<'} ${limit})`;
  const limits = new Set(terms.map((t) => t.limit));
  const [onlyLimit] = [...limits];
  if (limits.size === 1 && onlyLimit !== undefined && terms.every((t) => !t.fromScl)) {
    const total = BOUNDS.map((b) => terms.reduce((s, t) => s + conc(t.component, b), 0));
    const categories = [...new Set(terms.map((t) => t.category))].join(' + ');
    return `${categories} bileşenlerin toplamı ${fmtPctRange(total[0] ?? 0, total[1] ?? 0)} ${compare(`%${fmt(onlyLimit)}`)}`;
  }
  const parts = terms.map(
    (t) =>
      `${t.component.name} ${fmtPctRange(t.component.concentration.min, t.component.concentration.max)} / ${t.fromScl ? 'SCL' : 'genel sınır'} %${fmt(t.limit)}`,
  );
  const ratio = fmtRange(round(sums.lower), round(sums.upper));
  return `Σ(C / sınır) = ${ratio} ${compare('1')} (${parts.join('; ')})`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
