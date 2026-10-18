import {
  HAZARD_CATEGORIES,
  type HazardCategory,
  type HazardClassId,
  type Pictogram,
  type SignalWord,
} from './types';

interface CategoryInfo {
  hazardClass: HazardClassId | 'acute_toxicity';
  /** Lower is more severe within the hazard class. */
  rank: number;
  /** Default hazard statement; null where it depends on the route or the component (acute tox, STOT SE 3). */
  hCode: string | null;
  pictogram: Pictogram | null;
  signalWord: SignalWord | null;
}

// Pictograms, signal words and hazard statements per category: CLP Annex I tables for each
// hazard class (e.g. Table 2.6.2, 3.1.3, 3.2.5, 3.3.5, 3.4.7, 3.5.3, 3.6.3, 3.7.3, 3.8.4,
// 3.9.5, 3.10.2, 4.1.4), adopted unchanged in SEA Annex I.
const INFO: Record<HazardCategory, CategoryInfo> = {
  'Flam. Liq. 1': info('flammable_liquid', 0, 'H224', 'GHS02', 'danger'),
  'Flam. Liq. 2': info('flammable_liquid', 1, 'H225', 'GHS02', 'danger'),
  'Flam. Liq. 3': info('flammable_liquid', 2, 'H226', 'GHS02', 'warning'),
  'Met. Corr. 1': info('metal_corrosion', 0, 'H290', 'GHS05', 'warning'),
  'Acute Tox. 1': info('acute_toxicity', 0, null, 'GHS06', 'danger'),
  'Acute Tox. 2': info('acute_toxicity', 1, null, 'GHS06', 'danger'),
  'Acute Tox. 3': info('acute_toxicity', 2, null, 'GHS06', 'danger'),
  'Acute Tox. 4': info('acute_toxicity', 3, null, 'GHS07', 'warning'),
  'Skin Corr. 1A': info('skin_corrosion_irritation', 0, 'H314', 'GHS05', 'danger'),
  'Skin Corr. 1B': info('skin_corrosion_irritation', 1, 'H314', 'GHS05', 'danger'),
  'Skin Corr. 1C': info('skin_corrosion_irritation', 2, 'H314', 'GHS05', 'danger'),
  'Skin Corr. 1': info('skin_corrosion_irritation', 3, 'H314', 'GHS05', 'danger'),
  'Skin Irrit. 2': info('skin_corrosion_irritation', 4, 'H315', 'GHS07', 'warning'),
  'Eye Dam. 1': info('eye_damage_irritation', 0, 'H318', 'GHS05', 'danger'),
  'Eye Irrit. 2': info('eye_damage_irritation', 1, 'H319', 'GHS07', 'warning'),
  'Resp. Sens. 1A': info('respiratory_sensitisation', 0, 'H334', 'GHS08', 'danger'),
  'Resp. Sens. 1': info('respiratory_sensitisation', 1, 'H334', 'GHS08', 'danger'),
  'Resp. Sens. 1B': info('respiratory_sensitisation', 2, 'H334', 'GHS08', 'danger'),
  'Skin Sens. 1A': info('skin_sensitisation', 0, 'H317', 'GHS07', 'warning'),
  'Skin Sens. 1': info('skin_sensitisation', 1, 'H317', 'GHS07', 'warning'),
  'Skin Sens. 1B': info('skin_sensitisation', 2, 'H317', 'GHS07', 'warning'),
  'Muta. 1A': info('germ_cell_mutagenicity', 0, 'H340', 'GHS08', 'danger'),
  'Muta. 1B': info('germ_cell_mutagenicity', 1, 'H340', 'GHS08', 'danger'),
  'Muta. 2': info('germ_cell_mutagenicity', 2, 'H341', 'GHS08', 'warning'),
  'Carc. 1A': info('carcinogenicity', 0, 'H350', 'GHS08', 'danger'),
  'Carc. 1B': info('carcinogenicity', 1, 'H350', 'GHS08', 'danger'),
  'Carc. 2': info('carcinogenicity', 2, 'H351', 'GHS08', 'warning'),
  'Repr. 1A': info('reproductive_toxicity', 0, 'H360', 'GHS08', 'danger'),
  'Repr. 1B': info('reproductive_toxicity', 1, 'H360', 'GHS08', 'danger'),
  'Repr. 2': info('reproductive_toxicity', 2, 'H361', 'GHS08', 'warning'),
  'Lact.': info('lactation', 0, 'H362', null, null),
  'STOT SE 1': info('stot_single', 0, 'H370', 'GHS08', 'danger'),
  'STOT SE 2': info('stot_single', 1, 'H371', 'GHS08', 'warning'),
  'STOT SE 3': info('stot_single', 2, null, 'GHS07', 'warning'),
  'STOT RE 1': info('stot_repeated', 0, 'H372', 'GHS08', 'danger'),
  'STOT RE 2': info('stot_repeated', 1, 'H373', 'GHS08', 'warning'),
  'Asp. Tox. 1': info('aspiration', 0, 'H304', 'GHS08', 'danger'),
  'Aquatic Acute 1': info('aquatic_acute', 0, 'H400', 'GHS09', 'warning'),
  'Aquatic Chronic 1': info('aquatic_chronic', 0, 'H410', 'GHS09', 'warning'),
  'Aquatic Chronic 2': info('aquatic_chronic', 1, 'H411', 'GHS09', null),
  'Aquatic Chronic 3': info('aquatic_chronic', 2, 'H412', null, null),
  'Aquatic Chronic 4': info('aquatic_chronic', 3, 'H413', null, null),
};

function info(
  hazardClass: CategoryInfo['hazardClass'],
  rank: number,
  hCode: string | null,
  pictogram: Pictogram | null,
  signalWord: SignalWord | null,
): CategoryInfo {
  return { hazardClass, rank, hCode, pictogram, signalWord };
}

export function isHazardCategory(value: string): value is HazardCategory {
  return (HAZARD_CATEGORIES as readonly string[]).includes(value);
}

export function categoryInfo(category: HazardCategory): CategoryInfo {
  return INFO[category];
}

/** Returns the more severe of two categories of the same hazard class. */
export function moreSevere(a: HazardCategory, b: HazardCategory): HazardCategory {
  return INFO[a].rank <= INFO[b].rank ? a : b;
}

export type AcuteRoute = 'oral' | 'dermal' | 'inhalation';

const ACUTE_H_CODES: Record<AcuteRoute, Record<1 | 2 | 3 | 4, string>> = {
  oral: { 1: 'H300', 2: 'H300', 3: 'H301', 4: 'H302' },
  dermal: { 1: 'H310', 2: 'H310', 3: 'H311', 4: 'H312' },
  inhalation: { 1: 'H330', 2: 'H330', 3: 'H331', 4: 'H332' },
};

export function acuteHCode(route: AcuteRoute, category: 1 | 2 | 3 | 4): string {
  return ACUTE_H_CODES[route][category];
}

/** Route of an acute toxicity hazard statement, or null if the code is not one. */
export function acuteRouteOf(hCode: string): AcuteRoute | null {
  for (const route of ['oral', 'dermal', 'inhalation'] as const) {
    if (Object.values(ACUTE_H_CODES[route]).includes(hCode)) return route;
  }
  return null;
}

/**
 * Hazard statements a component line of this category can carry: one fixed statement for
 * most categories; the route-specific ones for acute toxicity (CLP Table 3.1.3) and H335 or
 * H336 for STOT SE 3 (CLP Table 3.8.4). Used where a supplier SDS lists a category without
 * its H code, so the KDU picks the statement instead of the system guessing it.
 */
export function hCodeOptions(category: HazardCategory): string[] {
  const info = INFO[category];
  if (info.hCode) return [info.hCode];
  if (info.hazardClass === 'acute_toxicity') {
    const n = (info.rank + 1) as 1 | 2 | 3 | 4;
    return (['oral', 'dermal', 'inhalation'] as const).map((route) => acuteHCode(route, n));
  }
  return ['H335', 'H336'];
}
