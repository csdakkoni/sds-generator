import { categoryInfo } from '../categories';
import type { HazardCategory } from '../types';
import { atLeast, BOUNDS, type Component, conc, fmt, fmtPctRange, sclLimit } from '../util';
import type { BoundFindings } from './common';

/**
 * Non-additive criterion: a single component at or above the limit classifies the mixture.
 * The SCL (lowest lower limit among `sclCategories`) replaces the generic limit.
 */
export interface ThresholdRule {
  componentCategory: HazardCategory;
  mixtureCategory: HazardCategory;
  genericLimit: number;
  sclCategories: readonly HazardCategory[];
  reference: string;
}

interface Hit {
  component: Component;
  hCode: string;
  limit: number;
  fromScl: boolean;
  rule: ThresholdRule;
}

/**
 * @param hCodeFromComponent keep the component's own statement (H350i, H360FD, organ
 * specific H370…) instead of the category default.
 */
export function findByThresholds(
  components: readonly Component[],
  rules: readonly ThresholdRule[],
  hCodeFromComponent: boolean,
): BoundFindings {
  const result: BoundFindings = { lower: null, upper: null };
  for (const bound of BOUNDS) {
    const hits: Hit[] = [];
    for (const rule of rules) {
      for (const component of components) {
        const k = component.known.find((x) => x.category === rule.componentCategory);
        if (!k) continue;
        const scl = sclLimit(component, rule.sclCategories);
        const limit = scl ?? rule.genericLimit;
        if (atLeast(conc(component, bound), limit)) {
          hits.push({ component, hCode: k.hCode, limit, fromScl: scl !== undefined, rule });
        }
      }
    }
    if (hits.length === 0) continue;
    const rank = (h: Hit) => categoryInfo(h.rule.mixtureCategory).rank;
    const best = Math.min(...hits.map(rank));
    const top = hits.filter((h) => rank(h) === best);
    const category = (top[0] as Hit).rule.mixtureCategory;
    const defaultH = categoryInfo(category).hCode;
    const hCodes = [
      ...new Set(top.map((h) => (hCodeFromComponent || !defaultH ? h.hCode : defaultH))),
    ];
    const reasons = top
      .map(
        (h) =>
          `${h.component.name} (${h.rule.componentCategory}) ${fmtPctRange(h.component.concentration.min, h.component.concentration.max)} ≥ ${h.fromScl ? 'SCL' : 'genel sınır'} %${fmt(h.limit)}`,
      )
      .join('; ');
    result[bound] = {
      category,
      hCodes,
      trace: {
        message: `${hCodes.join(', ')} (${category}), çünkü ${reasons}`,
        reference: [...new Set(top.map((h) => h.rule.reference))].join('; '),
      },
    };
  }
  return result;
}
