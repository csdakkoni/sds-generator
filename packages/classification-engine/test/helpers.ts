import type {
  ClassificationResult,
  ComponentInput,
  MixtureInput,
  MixtureMeasurements,
} from '../src/index';
import { classifyMixture } from '../src/index';

let nextId = 0;

/** A classified component; `conc` is a single value or [min, max] in %. */
export function component(
  name: string,
  conc: number | [number, number],
  classifications: [category: string, hCode: string][],
  extra: Partial<ComponentInput> = {},
): ComponentInput {
  const [min, max] = typeof conc === 'number' ? [conc, conc] : conc;
  return {
    id: `c${++nextId}`,
    name,
    concentration: { min, max },
    hazardData: classifications.length > 0 ? 'classified' : 'not_classified',
    classifications: classifications.map(([category, hCode]) => ({ category, hCode })),
    ...extra,
  };
}

/** Water as the not classified balance of a recipe. */
export function water(conc: number | [number, number]): ComponentInput {
  return component('Su', conc, []);
}

/** Measurements that keep physical hazards out of the way of health/environment tests. */
export const NEUTRAL: MixtureMeasurements = {
  physicalState: 'liquid',
  flashPointC: 100,
  metalCorrosion: 'negative',
};

export function classify(
  components: ComponentInput[],
  measurements: MixtureMeasurements = NEUTRAL,
): ClassificationResult {
  const input: MixtureInput = { components, measurements };
  return classifyMixture(input);
}

export function categories(result: ClassificationResult): string[] {
  return result.classifications.map((c) => c.category);
}

export function find(result: ClassificationResult, hazardClass: string) {
  return result.classifications.find((c) => c.hazardClass === hazardClass);
}

export function warningCodes(result: ClassificationResult): string[] {
  return result.warnings.map((w) => w.code);
}
