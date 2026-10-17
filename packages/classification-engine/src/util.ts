import { isHazardCategory } from './categories';
import type {
  ClassStatus,
  ComponentInput,
  EngineWarning,
  HazardCategory,
  HazardClassId,
  MixtureClassification,
  AteResult,
  SupplementalStatement,
} from './types';

export type Bound = 'lower' | 'upper';
export const BOUNDS: readonly Bound[] = ['lower', 'upper'];

/** Floating point tolerance for threshold comparisons (e.g. 0.3 × 100 ≥ 25). */
const EPSILON = 1e-9;

export function atLeast(value: number, threshold: number): boolean {
  return value >= threshold - EPSILON;
}

export interface KnownClassification {
  category: HazardCategory;
  hCode: string;
}

/** A validated component: only categories the engine evaluates are kept in `known`. */
export interface Component extends ComponentInput {
  known: KnownClassification[];
}

export function toComponent(input: ComponentInput): Component {
  const known: KnownClassification[] = [];
  for (const c of input.classifications) {
    if (isHazardCategory(c.category)) known.push({ category: c.category, hCode: c.hCode });
  }
  return { ...input, known };
}

export function conc(component: Component, bound: Bound): number {
  return bound === 'lower' ? component.concentration.min : component.concentration.max;
}

export function classificationsIn(
  component: Component,
  categories: readonly HazardCategory[],
): KnownClassification[] {
  return component.known.filter((k) => categories.includes(k.category));
}

/** Lowest SCL lower limit of the component among the given categories, if any. */
export function sclLimit(
  component: Component,
  categories: readonly HazardCategory[],
): number | undefined {
  const limits = (component.specificConcentrationLimits ?? [])
    .filter((s) => categories.includes(s.category))
    .map((s) => s.lowerLimit);
  return limits.length > 0 ? Math.min(...limits) : undefined;
}

export interface RuleOutput {
  classifications: MixtureClassification[];
  status: Partial<Record<HazardClassId, ClassStatus>>;
  warnings: EngineWarning[];
  ate?: AteResult[];
  supplemental?: SupplementalStatement[];
}

export function emptyOutput(): RuleOutput {
  return { classifications: [], status: {}, warnings: [] };
}

const numberFormat = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 6 });

export function fmt(value: number): string {
  return numberFormat.format(value);
}

/** "%10–20" for a range, "%2,5" for a single value. */
export function fmtPctRange(lower: number, upper: number): string {
  return lower === upper ? `%${fmt(lower)}` : `%${fmt(lower)}–${fmt(upper)}`;
}

export function fmtRange(lower: number, upper: number): string {
  return lower === upper ? fmt(lower) : `${fmt(lower)}–${fmt(upper)}`;
}

/** Components whose hazard data is unknown: they make a "not classified" result undetermined. */
export function unknownComponents(components: readonly Component[]): Component[] {
  return components.filter((c) => c.hazardData === 'unknown');
}

/**
 * Status for a health or environmental class that the mixture is not classified for:
 * undetermined when any component's data is unknown (missing data is not "no hazard").
 */
export function notClassifiedStatus(components: readonly Component[]): ClassStatus {
  return unknownComponents(components).length > 0 ? 'undetermined' : 'not_classified';
}
