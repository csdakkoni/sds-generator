/**
 * Splits the "classification" cell of a SEA Annex 6 row into hazard class lines.
 *
 * The cell is Turkish abbreviations plus a category ("Göz Hsr. 1", "Sucul Kronik 2"); the
 * abbreviation to CLP class table below is the one the KDU approved
 * (sinif-kisaltma-esleme.csv). Hazard statements are never scanned out of text (CLAUDE.md
 * rule 3): each line takes its code from the row's structured "classification_h" column, and
 * only when that code belongs to the class (CLP Annex VI table 3 / Annex I). A line, a code
 * or an abbreviation that does not reconcile makes the whole row "unparsed": nothing is
 * written for it and it is reported for the KDU instead of being guessed.
 */

export interface Ek6ClassificationRow {
  list_no: string;
  classification_text?: string | null;
  classification_h?: string[];
}

export interface ParsedLine {
  hazard_class: string;
  category: string;
  h_code: string | null;
}

export type ParsedRow = { ok: true; lines: ParsedLine[] } | { ok: false; reason: string };

interface ClassRule {
  /** Matches the Turkish abbreviation, tolerating the spacing/dot variants found in the table. */
  pattern: RegExp;
  hazardClass: string;
  /** CLP abbreviation shown in the line category: `${clp} ${category}`. */
  clp: string;
  /** Allowed category tokens. */
  categories: string[];
  /** Hazard statement base codes allowed for a category (the row's own code must start with one). */
  h: (category: string) => string[];
  /** The hazard statement is carried by the row's H list (false: a class the list does not carry). */
  carriesH?: boolean;
}

const acuteH = (category: string): string[] =>
  ({
    '1': ['H300', 'H310', 'H330'],
    '2': ['H300', 'H310', 'H330'],
    '3': ['H301', 'H311', 'H331'],
    '4': ['H302', 'H312', 'H332'],
  })[category] ?? [];

const rule = (
  pattern: string,
  hazardClass: string,
  clp: string,
  categories: string[],
  h: (category: string) => string[],
  carriesH = true,
): ClassRule => ({
  pattern: new RegExp(`^${pattern}`, 'iu'),
  hazardClass,
  clp,
  categories,
  h,
  carriesH,
});

const fixed = (table: Record<string, string[]>) => (category: string) => table[category] ?? [];

// Spacing and dots vary in the source ("Ürm.Sis.Tok.", "Ürm. Sis. Tok."), so patterns allow \s*\.?.
const RULES: ClassRule[] = [
  rule('Akut\\s*Tok\\.?', 'acute_toxicity', 'Acute Tox.', ['1', '2', '3', '4'], acuteH),
  rule(
    'Alev\\.?\\s*Gaz',
    'flammable_gas',
    'Flam. Gas',
    ['1', '2'],
    fixed({ '1': ['H220'], '2': ['H221'] }),
  ),
  rule(
    'Alev\\.?\\s*Sıvı',
    'flammable_liquid',
    'Flam. Liq.',
    ['1', '2', '3'],
    fixed({ '1': ['H224'], '2': ['H225'], '3': ['H226'] }),
  ),
  rule(
    'Alev\\.?\\s*Katı',
    'flammable_solid',
    'Flam. Sol.',
    ['1', '2'],
    fixed({ '1': ['H228'], '2': ['H228'] }),
  ),
  rule('Asp\\.?\\s*Tok\\.?', 'aspiration', 'Asp. Tox.', ['1'], fixed({ '1': ['H304'] })),
  rule(
    'BHOT\\s*Tek\\.?\\s*Mrz\\.?',
    'stot_single',
    'STOT SE',
    ['1', '2', '3'],
    fixed({ '1': ['H370'], '2': ['H371'], '3': ['H335', 'H336'] }),
  ),
  rule(
    'BHOT\\s*Tekr(?:ar)?\\.?\\s*Mrz\\.?',
    'stot_repeated',
    'STOT RE',
    ['1', '2'],
    fixed({ '1': ['H372'], '2': ['H373'] }),
  ),
  rule('Basınç\\s*Gaz', 'pressurised_gas', 'Press. Gas', [''], () => [], false),
  rule(
    'Cilt\\s*Aşnd\\.?',
    'skin_corrosion_irritation',
    'Skin Corr.',
    ['1', '1A', '1B', '1C'],
    fixed({ '1': ['H314'], '1A': ['H314'], '1B': ['H314'], '1C': ['H314'] }),
  ),
  rule(
    'Cilt\\s*Tah\\.?',
    'skin_corrosion_irritation',
    'Skin Irrit.',
    ['2'],
    fixed({ '2': ['H315'] }),
  ),
  rule(
    'Cilt\\s*Hassas\\.?',
    'skin_sensitisation',
    'Skin Sens.',
    ['1', '1A', '1B'],
    fixed({ '1': ['H317'], '1A': ['H317'], '1B': ['H317'] }),
  ),
  rule(
    'Solnm\\.?\\s*Hassas\\.?',
    'respiratory_sensitisation',
    'Resp. Sens.',
    ['1', '1A', '1B'],
    fixed({ '1': ['H334'], '1A': ['H334'], '1B': ['H334'] }),
  ),
  rule('Göz\\s*Hsr\\.?', 'eye_damage_irritation', 'Eye Dam.', ['1'], fixed({ '1': ['H318'] })),
  rule('Göz\\s*Tah\\.?', 'eye_damage_irritation', 'Eye Irrit.', ['2'], fixed({ '2': ['H319'] })),
  rule(
    'Kans\\.?',
    'carcinogenicity',
    'Carc.',
    ['1A', '1B', '2'],
    fixed({ '1A': ['H350'], '1B': ['H350'], '2': ['H351'] }),
  ),
  rule(
    'Muta\\.?',
    'germ_cell_mutagenicity',
    'Muta.',
    ['1A', '1B', '2'],
    fixed({ '1A': ['H340'], '1B': ['H340'], '2': ['H341'] }),
  ),
  rule(
    'Ürm\\.?\\s*Sis\\.?\\s*Tok\\.?',
    'reproductive_toxicity',
    'Repr.',
    ['1A', '1B', '2'],
    fixed({ '1A': ['H360'], '1B': ['H360'], '2': ['H361'] }),
  ),
  rule('Emz(?:r)?\\.?', 'lactation', 'Lact.', [''], () => ['H362']),
  rule('Sucul\\s*Akut', 'aquatic_acute', 'Aquatic Acute', ['1'], fixed({ '1': ['H400'] })),
  rule(
    'Sucul\\s*Kronik',
    'aquatic_chronic',
    'Aquatic Chronic',
    ['1', '2', '3', '4'],
    fixed({ '1': ['H410'], '2': ['H411'], '3': ['H412'], '4': ['H413'] }),
  ),
  rule('Met\\.?\\s*Aşnd\\.?', 'metal_corrosion', 'Met. Corr.', ['1'], fixed({ '1': ['H290'] })),
  rule(
    'Su-tepk\\.?',
    'water_reactive',
    'Water-react.',
    ['1', '2', '3'],
    fixed({ '1': ['H260'], '2': ['H261'], '3': ['H261'] }),
  ),
  rule('Piro\\.?\\s*Sıvı', 'pyrophoric_liquid', 'Pyr. Liq.', ['1'], fixed({ '1': ['H250'] })),
  rule('Piro\\.?\\s*Katı', 'pyrophoric_solid', 'Pyr. Sol.', ['1'], fixed({ '1': ['H250'] })),
  rule(
    'Kend\\.?\\s*Isınan',
    'self_heating',
    'Self-heat.',
    ['1', '2'],
    fixed({ '1': ['H251'], '2': ['H252'] }),
  ),
  rule('Oksit\\.?\\s*Gaz', 'oxidising_gas', 'Ox. Gas', ['1'], fixed({ '1': ['H270'] })),
  rule(
    'Oksit\\.?\\s*Sıvı',
    'oxidising_liquid',
    'Ox. Liq.',
    ['1', '2', '3'],
    fixed({ '1': ['H271'], '2': ['H272'], '3': ['H272'] }),
  ),
  rule(
    'Oksit\\.?\\s*Katı',
    'oxidising_solid',
    'Ox. Sol.',
    ['1', '2', '3'],
    fixed({ '1': ['H271'], '2': ['H272'], '3': ['H272'] }),
  ),
  rule(
    'Org\\.?\\s*Peroksit',
    'organic_peroxide',
    'Org. Perox.',
    ['A', 'B', 'C', 'D', 'E', 'F'],
    fixed({ A: ['H240'], B: ['H241'], C: ['H242'], D: ['H242'], E: ['H242'], F: ['H242'] }),
  ),
  rule(
    'Kend\\.?\\s*Tep\\.?\\s*Grn\\.?',
    'self_reactive',
    'Self-react.',
    ['A', 'B', 'C', 'D', 'E', 'F'],
    fixed({ A: ['H240'], B: ['H241'], C: ['H242'], D: ['H242'], E: ['H242'], F: ['H242'] }),
  ),
  rule('Ozon', 'ozone', 'Ozone', ['1'], fixed({ '1': ['H420'] })),
];

const CATEGORY = /^\s*(1A|1B|1C|1|2|3|4|A|B|C|D|E|F)(?![\p{L}\d])/u;

/** Parses one row; every H code in the row's list must be claimed by exactly one line. */
export function parseClassification(row: Ek6ClassificationRow): ParsedRow {
  const text = (row.classification_text ?? '').trim();
  if (text === '') return { ok: false, reason: 'classification cell is empty' };
  const hCodes = [...(row.classification_h ?? [])];
  const claimed = new Set<number>();
  const lines: ParsedLine[] = [];

  let rest = text;
  while (rest.trim() !== '') {
    rest = rest.trim();
    const found = RULES.find((r) => r.pattern.test(rest));
    if (!found) return { ok: false, reason: `unknown abbreviation near "${rest.slice(0, 30)}"` };
    rest = rest.replace(found.pattern, '');
    let category = '';
    const m = CATEGORY.exec(rest);
    if (m) {
      category = m[1] ?? '';
      rest = rest.slice(m[0].length);
    }
    if (!found.categories.includes(category)) {
      return { ok: false, reason: `${found.clp}: category "${category}" is not valid` };
    }
    let h: string | null = null;
    if (found.carriesH) {
      const bases = found.h(category);
      const index = hCodes.findIndex(
        (code, i) => !claimed.has(i) && bases.some((b) => code.startsWith(b)),
      );
      if (index < 0) {
        return {
          ok: false,
          reason: `${found.clp} ${category}: no matching hazard statement in the row`,
        };
      }
      claimed.add(index);
      h = hCodes[index] ?? null;
    }
    lines.push({
      hazard_class: found.hazardClass,
      category: category === '' ? found.clp : `${found.clp} ${category}`,
      h_code: h,
    });
  }
  const left = hCodes.filter((_, i) => !claimed.has(i));
  if (left.length > 0) {
    return { ok: false, reason: `hazard statements not matched to a class: ${left.join(', ')}` };
  }
  return { ok: true, lines };
}
