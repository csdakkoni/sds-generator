import { categoryInfo, hCodeOptions, isHazardCategory, moreSevere } from './categories';
import { classKey } from './harmonised';
import { HAZARD_CATEGORIES, type HazardCategory } from './types';
import type { ComponentClassification } from './types';

/**
 * A substance classification line taken from an outside source. `uncertain` is set when the
 * source gives a hazard statement whose category it does not state and the statement alone
 * cannot decide (e.g. H350 is Carc. 1A or 1B): the line then carries the most severe candidate
 * and a person has to choose.
 */
export interface SourceLine extends ComponentClassification {
  uncertain?: { candidates: string[] };
}

// GHS building blocks that SEA/CLP did not adopt (H227, H303, H305, H313, H316, H320, H333,
// H401, H402); they have no TR classification. Kept as numbers: the engine never emits them,
// and the phrase-table test treats every quoted code in the engine as one it can emit.
const NOT_IN_CLP = new Set([227, 303, 305, 313, 316, 320, 333, 401, 402].map((n) => `H${n}`));

const CLASS_WORDS: Partial<Record<string, RegExp>> = {
  acute_toxicity: /acute/i,
  skin_corrosion_irritation: /skin corr/i,
  respiratory_sensitisation: /respiratory sens|resp\. sens/i,
  skin_sensitisation: /skin sens/i,
  germ_cell_mutagenicity: /mutagen|muta\./i,
  carcinogenicity: /carcinogen|carc\./i,
  reproductive_toxicity: /reproductive|repr\./i,
};

const ROUTE_WORDS: Record<string, RegExp> = {
  H300: /oral/i,
  H310: /dermal|skin/i,
  H330: /inhal/i,
};

/** Base code of a hazard statement: H360FD -> H360, H361d -> H361. */
const base = (hCode: string) => hCode.slice(0, 4);

/** Engine categories whose hazard statement is this code (CLP Annex I tables). */
export function categoriesForHCode(hCode: string): HazardCategory[] {
  return HAZARD_CATEGORIES.filter((c) => hCodeOptions(c).includes(base(hCode)));
}

const suffix = (category: string) => category.slice(category.lastIndexOf(' ') + 1).toLowerCase();
const clean = (text: string) => text.replace(/\(\s*[\d.,]+\s*%\s*\)/g, '').trim();

/** Picks the candidate a source's "hazard class and category" text names, if exactly one. */
function fromCategoryTexts(
  hCode: string,
  candidates: HazardCategory[],
  texts: string[],
): HazardCategory | null {
  const found = new Set<HazardCategory>();
  for (const raw of texts) {
    const text = clean(raw);
    for (const c of candidates) {
      if (text === c) {
        found.add(c);
        continue;
      }
      const words = CLASS_WORDS[categoryInfo(c).hazardClass];
      const route = ROUTE_WORDS[base(hCode)];
      const number = /category\s*([0-9][a-c]?)\b/i.exec(text)?.[1]?.toLowerCase();
      if (words?.test(text) && (!route || route.test(text)) && number === suffix(c)) found.add(c);
    }
  }
  return found.size === 1 ? ([...found][0] ?? null) : null;
}

/**
 * Turns the hazard statements an outside source lists for a substance into CLP category lines.
 * Codes SEA/CLP does not use, and codes the engine does not evaluate (mostly physical hazards,
 * which a mixture needs measured data for anyway, CLAUDE.md rule 6), are returned separately so
 * they are shown, never dropped.
 */
export function resolveStatements(
  hCodes: string[],
  categoryTexts: string[] = [],
): { lines: SourceLine[]; notInClp: string[]; notEvaluated: string[] } {
  const lines: SourceLine[] = [];
  const notInClp: string[] = [];
  const notEvaluated: string[] = [];
  const add = (line: SourceLine) => {
    if (!lines.some((l) => l.category === line.category && l.hCode === line.hCode))
      lines.push(line);
  };
  for (const hCode of new Set(hCodes.flatMap((h) => h.split('+').map((p) => p.trim())))) {
    if (!/^H\d{3}/.test(hCode)) continue;
    if (NOT_IN_CLP.has(hCode)) {
      notInClp.push(hCode);
      continue;
    }
    const candidates = categoriesForHCode(hCode);
    if (candidates.length === 0) {
      notEvaluated.push(hCode);
      continue;
    }
    if (candidates.length === 1) {
      add({ category: candidates[0] as HazardCategory, hCode });
      continue;
    }
    const named = fromCategoryTexts(hCode, candidates, categoryTexts);
    if (named) {
      add({ category: named, hCode });
      continue;
    }
    // "Skin Corr. 1", "Skin Sens. 1" and "Resp. Sens. 1" are valid categories when the
    // sub-category is not determined (CLP 3.2.2, 3.4.2).
    const generic = candidates.find((c) => / 1$/.test(c));
    if (generic) {
      add({ category: generic, hCode });
      continue;
    }
    const worst = candidates.reduce((a, b) => moreSevere(a, b));
    add({ category: worst, hCode, uncertain: { candidates } });
  }
  return { lines, notInClp, notEvaluated };
}

/**
 * Lines to draft with while sources are unconfirmed: per hazard class (acute toxicity per
 * route), the most severe category any source gives. A choice of the draft only; the KDU
 * confirms or changes it.
 */
export function conservativeLines(lineSets: SourceLine[][]): SourceLine[] {
  const best = new Map<string, SourceLine>();
  for (const line of lineSets.flat()) {
    if (!isHazardCategory(line.category)) continue;
    const key = classKey(line);
    const current = best.get(key);
    if (!current || !isHazardCategory(current.category)) {
      best.set(key, line);
      continue;
    }
    if (current.category === line.category) {
      // Same category: a source that states it beats one where it was only inferred.
      if (current.uncertain && !line.uncertain) best.set(key, line);
      continue;
    }
    if (moreSevere(current.category, line.category) === line.category) best.set(key, line);
  }
  return [...best.values()];
}

/** Hazard class id of a category ("Eye Dam. 1" -> "eye_damage_irritation"), for storage. */
export function hazardClassOf(category: string): string {
  return isHazardCategory(category) ? categoryInfo(category).hazardClass : 'other';
}
