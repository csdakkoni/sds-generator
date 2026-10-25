/**
 * The GHS label of a product, from the same content as its SDS. Every hazard element comes
 * from the engine result (CLAUDE.md rules 1 and 7); statement texts come from the official
 * phrase table, and the substances named next to the product name come from the engine's
 * `labelIngredients`.
 */
import { labelIngredients, type Pictogram } from '@sds/classification-engine';
import { phrase, type SdsContent, type SdsLanguage } from './content';

export interface LabelData {
  productName: string;
  /** Substances named on the label (CLP Art. 18(3)(b)), by their chemical names. */
  contains: string[];
  pictograms: Pictogram[];
  signalWord: string | null;
  hazard: string[];
  precautionary: string[];
  supplemental: string[];
  supplier: string[];
  emergency: string | null;
  /**
   * False while the classification cannot be finalised: an empty hazard list then means missing
   * data, never "not classified" (CLAUDE.md rule 5).
   */
  complete: boolean;
}

const SIGNAL: Record<SdsLanguage, Record<'danger' | 'warning', string>> = {
  tr: { danger: 'TEHLİKE', warning: 'DİKKAT' },
  en: { danger: 'DANGER', warning: 'WARNING' },
};
const MISSING: Record<SdsLanguage, string> = { tr: 'metin yok', en: 'text missing' };

export function labelData(content: SdsContent, lang: SdsLanguage): LabelData {
  const { result, composition, company, inputs } = content;
  const named = labelIngredients(
    {
      components: composition.map((c, i) => ({
        id: String(i),
        name: c.name,
        concentration: { min: c.min, max: c.max },
        hazardData: c.classifications.length > 0 ? 'classified' : 'not_classified',
        classifications: c.classifications,
      })),
      measurements: {},
    },
    result,
  );
  const line = (code: string, detail = '') =>
    `${code}: ${phrase(lang, code, detail) ?? `[${MISSING[lang]}]`}`;
  return {
    productName: content.product.name,
    contains: [...new Set(named.map((n) => n.name))],
    pictograms: result.label.pictograms,
    signalWord: result.label.signalWord ? SIGNAL[lang][result.label.signalWord] : null,
    hazard: result.label.hStatements.map((c) => line(c)),
    precautionary: inputs.pStatements.map((c) => line(c)),
    supplemental: result.label.supplemental.map((s) => line(s.code, s.detail)),
    supplier: [company.name, company.address, company.phone].filter((s) => s.trim()),
    emergency: company.emergencyPhone.trim() || null,
    complete: result.canFinalize && !content.notes.some((n) => n.severity === 'blocking'),
  };
}
