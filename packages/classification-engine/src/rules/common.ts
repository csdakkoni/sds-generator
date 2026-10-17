import { categoryInfo } from '../categories';
import { type AdditiveCriterion, evaluate, termsFor } from '../summation';
import type { HazardCategory, HazardClassId, MixtureClassification, TraceEntry } from '../types';
import { type Bound, type Component, notClassifiedStatus, type RuleOutput } from '../util';

export interface Finding {
  category: HazardCategory;
  hCodes: string[];
  trace: TraceEntry;
}

export type BoundFindings = Record<Bound, Finding | null>;

/** Applies criteria in order of severity; the first one met at each bound decides the category. */
export function findByCriteria(
  components: readonly Component[],
  criteria: readonly AdditiveCriterion[],
  hCodeOverride?: string,
): BoundFindings {
  const result: BoundFindings = { lower: null, upper: null };
  for (const criterion of criteria) {
    const evaluation = evaluate(termsFor(components, criterion));
    for (const bound of ['lower', 'upper'] as const) {
      if (result[bound] || !evaluation.met[bound]) continue;
      const hCode = hCodeOverride ?? (categoryInfo(criterion.target).hCode as string);
      result[bound] = {
        category: criterion.target,
        hCodes: [hCode],
        trace: {
          message: `${hCode} (${criterion.target}), çünkü ${evaluation.description}`,
          reference: criterion.reference,
        },
      };
    }
  }
  return result;
}

/**
 * Turns per-bound findings into the rule output. The upper bound is the applied assumption;
 * a different lower-bound outcome is recorded in the trace, never hidden.
 */
export function toOutput(
  hazardClass: HazardClassId,
  findings: BoundFindings,
  components: readonly Component[],
  extraTrace: TraceEntry[] = [],
): RuleOutput {
  const { lower, upper } = findings;
  if (!upper) {
    return {
      classifications: [],
      status: { [hazardClass]: notClassifiedStatus(components) },
      warnings: [],
    };
  }
  const trace = [upper.trace, ...extraTrace];
  if (lower?.category !== upper.category) {
    trace.push({
      message: `Konsantrasyon aralıklarının alt sınırında sonuç ${lower ? lower.category : 'sınıflandırılmaz'}, üst sınırında ${upper.category}. Üst sınır varsayımı uygulandı (seçilmiş varsayım, yasal bir zorunluluk değil).`,
      reference: 'Motor varsayımı: üst sınır',
    });
  }
  const classification: MixtureClassification = {
    hazardClass,
    category: upper.category,
    hCodes: upper.hCodes,
    lowerBoundCategory: lower ? lower.category : null,
    trace,
  };
  return {
    classifications: [classification],
    status: { [hazardClass]: 'classified' },
    warnings: [],
  };
}
