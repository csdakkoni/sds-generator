/**
 * Substance identity from PubChem (CAS, names, EC, formula). Identity only: PubChem hazard
 * data is never read here, so nothing from this file can reach a classification
 * (CLAUDE.md, data sources).
 */

export interface SubstanceIdentity {
  cid: number;
  name: string;
  synonyms: string[];
  ecNumber: string | null;
  formula: string | null;
  molecularWeight: number | null;
}

interface SynonymsResponse {
  InformationList?: { Information?: { CID?: number; Synonym?: string[] }[] };
}
interface PropertyResponse {
  PropertyTable?: {
    Properties?: {
      CID?: number;
      Title?: string;
      MolecularFormula?: string;
      MolecularWeight?: string;
    }[];
  };
}

const EC_SHAPE = /^\d{3}-\d{3}-\d$/;
const MAX_SYNONYMS = 12;

/**
 * Combines PubChem's synonym and property answers for one CAS number. Returns null when
 * PubChem's record does not list that CAS among its synonyms, so a fuzzy name match can
 * never attach another substance's identity to the number.
 */
export function parseIdentity(
  cas: string,
  synonyms: SynonymsResponse,
  properties: PropertyResponse,
): SubstanceIdentity | null {
  const info = synonyms.InformationList?.Information?.[0];
  const list = info?.Synonym ?? [];
  if (!info?.CID || !list.includes(cas)) return null;
  const props = properties.PropertyTable?.Properties?.find((p) => p.CID === info.CID);
  const name = props?.Title?.trim() || list.find((s) => s !== cas && !EC_SHAPE.test(s));
  if (!name) return null;
  const weight = props?.MolecularWeight === undefined ? NaN : Number(props.MolecularWeight);
  return {
    cid: info.CID,
    name,
    synonyms: list
      .filter((s) => s !== cas && s !== name && !EC_SHAPE.test(s) && s.length <= 60)
      .slice(0, MAX_SYNONYMS),
    ecNumber: list.find((s) => EC_SHAPE.test(s)) ?? null,
    formula: props?.MolecularFormula ?? null,
    molecularWeight: Number.isFinite(weight) ? weight : null,
  };
}
