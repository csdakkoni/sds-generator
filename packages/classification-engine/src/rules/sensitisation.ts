import type { HazardCategory, SupplementalStatement } from '../types';
import {
  atLeast,
  type Component,
  emptyOutput,
  fmt,
  fmtPctRange,
  type RuleOutput,
  sclLimit,
} from '../util';
import { toOutput } from './common';
import { findByThresholds, type ThresholdRule } from './threshold';

const CLASSIFY_REF = 'CLP Ek I Tablo 3.4.5';
const ELICIT_REF = 'CLP Ek I Tablo 3.4.6 ve Ek II 2.8 (EUH208)';

const SKIN: HazardCategory[] = ['Skin Sens. 1', 'Skin Sens. 1A', 'Skin Sens. 1B'];
const RESP: HazardCategory[] = ['Resp. Sens. 1', 'Resp. Sens. 1A', 'Resp. Sens. 1B'];

function rules(categories: HazardCategory[], limits: [number, number, number]): ThresholdRule[] {
  return categories.map((category, i) => ({
    componentCategory: category,
    mixtureCategory: category,
    genericLimit: limits[i] as number,
    sclCategories: categories,
    reference: CLASSIFY_REF,
  }));
}

// Generic limits [1, 1A, 1B]. Respiratory limits differ for gaseous mixtures.
const SKIN_RULES = rules(SKIN, [1, 0.1, 1]);
const RESP_RULES_SOLID_LIQUID = rules(RESP, [1, 0.1, 1]);
const RESP_RULES_GAS = rules(RESP, [0.2, 0.1, 0.2]);

/** Elicitation limits for EUH208 [1, 1A, 1B]; with an SCL: one tenth of the SCL. */
const ELICITATION: [number, number, number] = [0.1, 0.01, 0.1];

export function classifySensitisation(
  components: readonly Component[],
  physicalState: 'liquid' | 'solid' | 'gas' | undefined,
): RuleOutput {
  const output = emptyOutput();
  const resp = physicalState === 'gas' ? RESP_RULES_GAS : RESP_RULES_SOLID_LIQUID;
  const supplemental: SupplementalStatement[] = [];

  for (const [hazardClass, classRules, categories] of [
    ['skin_sensitisation', SKIN_RULES, SKIN],
    ['respiratory_sensitisation', resp, RESP],
  ] as const) {
    const findings = findByThresholds(components, classRules, false);
    const part = toOutput(hazardClass, findings, components);
    output.classifications.push(...part.classifications);
    Object.assign(output.status, part.status);

    // EUH208 only for a mixture not classified for this sensitisation (TODO(KDU) #12).
    if (findings.upper) continue;
    for (const component of components) {
      const k = component.known.find((x) => categories.includes(x.category));
      if (!k) continue;
      const scl = sclLimit(component, categories);
      const limit =
        scl !== undefined ? scl / 10 : (ELICITATION[categories.indexOf(k.category)] as number);
      if (atLeast(component.concentration.max, limit)) {
        supplemental.push({
          code: 'EUH208',
          detail: component.name,
          trace: {
            message: `EUH208 (${component.name}), çünkü ${k.category} bileşen ${fmtPctRange(component.concentration.min, component.concentration.max)} ≥ ortaya çıkma sınırı %${fmt(limit)}${scl !== undefined ? ' (SCL / 10)' : ''}`,
            reference: ELICIT_REF,
          },
        });
      }
    }
  }

  if (supplemental.length > 0) output.supplemental = supplemental;
  return output;
}
