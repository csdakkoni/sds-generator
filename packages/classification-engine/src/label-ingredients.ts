import { acuteRouteOf, categoryInfo, isHazardCategory } from './categories';
import { applyHarmonised } from './harmonised';
import type {
  ClassificationResult,
  ComponentClassification,
  HazardClassId,
  MixtureInput,
  TraceEntry,
} from './types';

export interface LabelIngredient {
  componentId: string;
  name: string;
  /** Mixture hazard classes this component's own classification bears on. */
  hazardClasses: HazardClassId[];
  trace: TraceEntry;
}

const REFERENCE = 'CLP Madde 18(3)(b), SEA karşılığı';

/** Does a mixture classification fall under the classes named in CLP Art. 18(3)(b)? */
function named(hazardClass: HazardClassId, category: string): boolean {
  switch (hazardClass) {
    case 'acute_toxicity_oral':
    case 'acute_toxicity_dermal':
    case 'acute_toxicity_inhalation':
    case 'respiratory_sensitisation':
    case 'skin_sensitisation':
    case 'germ_cell_mutagenicity':
    case 'carcinogenicity':
    case 'reproductive_toxicity':
    case 'lactation':
    case 'stot_single':
    case 'stot_repeated':
    case 'aspiration':
      return true;
    // "Skin corrosion or serious eye damage": the irritation categories are not named.
    case 'skin_corrosion_irritation':
      return category.startsWith('Skin Corr. 1');
    case 'eye_damage_irritation':
      return category === 'Eye Dam. 1';
    default:
      return false;
  }
}

/** The mixture class a component line bears on (acute toxicity split by route). */
function classesOf(line: ComponentClassification): HazardClassId[] {
  if (!isHazardCategory(line.category)) return [];
  const info = categoryInfo(line.category);
  if (info.hazardClass === 'acute_toxicity') {
    const route = acuteRouteOf(line.hCode);
    return route ? [`acute_toxicity_${route}` as HazardClassId] : [];
  }
  // Skin Corr. 1 components count towards Eye Dam. 1 of the mixture (CLP Table 3.3.3).
  if (line.category.startsWith('Skin Corr. 1'))
    return ['skin_corrosion_irritation', 'eye_damage_irritation'];
  if (
    info.hazardClass === 'skin_corrosion_irritation' ||
    info.hazardClass === 'eye_damage_irritation'
  )
    return line.category === 'Eye Dam. 1' ? ['eye_damage_irritation'] : [];
  return [info.hazardClass];
}

/**
 * Substances to name on the label next to the product name (CLP Art. 18(3)(b)): those
 * responsible for the mixture's classification in acute toxicity, skin corrosion or serious eye
 * damage, CMR, sensitisation, STOT and aspiration. Chosen approach: a component is named when
 * its own classification (after the harmonised floor) lies in a named class the mixture is
 * classified in; for skin corrosion and eye damage only the category 1 lines count.
 */
export function labelIngredients(
  input: MixtureInput,
  result: ClassificationResult,
): LabelIngredient[] {
  const mixtureClasses = result.classifications
    .filter((c) => named(c.hazardClass, c.category))
    .map((c) => c.hazardClass);
  if (mixtureClasses.length === 0) return [];
  const out: LabelIngredient[] = [];
  for (const raw of input.components) {
    const { component } = applyHarmonised(raw);
    const hits = [
      ...new Set(
        component.classifications.flatMap(classesOf).filter((c) => mixtureClasses.includes(c)),
      ),
    ];
    if (hits.length === 0) continue;
    out.push({
      componentId: component.id,
      name: component.name,
      hazardClasses: hits,
      trace: {
        message: `${component.name} etikette adıyla yer alır: karışımın ${hits.join(', ')} sınıflandırmasına katkı veren bir sınıflandırması var (seçilmiş yaklaşım).`,
        reference: REFERENCE,
      },
    });
  }
  return out;
}
