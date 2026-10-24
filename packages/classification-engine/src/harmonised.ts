import { acuteRouteOf, categoryInfo, isHazardCategory } from './categories';
import type { ComponentClassification, ComponentInput, EngineWarning } from './types';

/**
 * Applies a substance's harmonised (SEA Annex 6) classification to a component.
 *
 * The harmonised classification is a floor (SEA Annex 6, CLP Art. 4(3)): for each hazard class
 * it lists, the component carries at least that category. A supplier SDS may be stricter, never
 * lighter. Classes the harmonised entry does not list stay as the supplier wrote them; they
 * are not assumed absent. Every change is reported so the KDU sees where the two sources differ.
 */
export function applyHarmonised(raw: ComponentInput): {
  component: ComponentInput;
  warnings: EngineWarning[];
} {
  const { harmonised, ...rest } = raw;
  if (!harmonised) return { component: raw, warnings: [] };

  const warnings: EngineWarning[] = [];
  const note = (code: string, severity: EngineWarning['severity'], message: string) =>
    warnings.push({ code, severity, message: `${raw.name}: ${message}`, componentIds: [raw.id] });

  const supplierKnown = raw.hazardData === 'classified' || raw.hazardData === 'not_classified';
  const lines: ComponentClassification[] = supplierKnown ? [...raw.classifications] : [];
  if (!supplierKnown) {
    note(
      'HARMONISED_ONLY',
      'blocking',
      `onaylı tedarikçi verisi yok; yalnızca ${harmonised.reference} listesindeki sınıflar kullanıldı. Listede olmayan sınıflar için veri yok, bu sınıflar "belirlenemedi" kalmalı: KDU değerlendirmeli.`,
    );
  }

  for (const line of harmonised.classifications) {
    const key = classKey(line);
    const index = lines.findIndex((l) => classKey(l) === key);
    const existing = index >= 0 ? lines[index] : undefined;
    if (!existing) {
      lines.push(line);
      if (supplierKnown) {
        note(
          'HARMONISED_ADDED',
          'review',
          `${line.category} (${line.hCode}) ${harmonised.reference} listesinde var, tedarikçi SDS'inde yok; resmî sınıflandırma uygulandı.`,
        );
      }
    } else if (existing.category === line.category) {
      continue;
    } else if (rank(line) < rank(existing)) {
      lines[index] = line;
      note(
        'HARMONISED_RAISED',
        'review',
        `tedarikçi SDS'i ${existing.category} diyor, ${harmonised.reference} ${line.category} (${line.hCode}) diyor; resmî (daha ağır) sınıflandırma uygulandı, düşürülemez.`,
      );
    } else {
      note(
        'HARMONISED_STRICTER_SUPPLIER',
        'info',
        `tedarikçi SDS'i ${existing.category}, ${harmonised.reference} ${line.category}; daha ağır olan tedarikçi sınıflandırması korundu.`,
      );
    }
  }

  return {
    component: { ...rest, hazardData: 'classified', classifications: lines },
    warnings,
  };
}

/** Lines of the same hazard class (and, for acute toxicity, the same route) compete. */
export function classKey(line: ComponentClassification): string {
  if (!isHazardCategory(line.category)) return `other:${line.category}`;
  const info = categoryInfo(line.category);
  if (info.hazardClass === 'acute_toxicity') {
    return `acute_toxicity:${acuteRouteOf(line.hCode) ?? line.category}`;
  }
  return info.hazardClass;
}

/** Lower is more severe. Categories the engine does not evaluate never outrank a known one. */
function rank(line: ComponentClassification): number {
  return isHazardCategory(line.category)
    ? categoryInfo(line.category).rank
    : Number.MAX_SAFE_INTEGER;
}
