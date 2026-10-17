import { categoryInfo } from './categories';
import type {
  HazardCategory,
  LabelElements,
  MixtureClassification,
  Pictogram,
  PStatementSuggestion,
  SupplementalStatement,
  TraceEntry,
} from './types';

// Precautionary statement sets per category from the CLP Annex I tables as adopted in SEA.
// They are suggestions for the KDU; the set must be checked against the SEA version in
// force (TODO(KDU) #18).
const ORAL_1_3 = ['P264', 'P270', 'P301+P310', 'P321', 'P330', 'P405', 'P501'];
const CMR = ['P201', 'P202', 'P280', 'P308+P313', 'P405', 'P501'];
const SKIN_CORR = [
  'P260',
  'P264',
  'P280',
  'P301+P330+P331',
  'P303+P361+P353',
  'P363',
  'P304+P340',
  'P310',
  'P321',
  'P305+P351+P338',
  'P405',
  'P501',
];
const RESP_SENS = ['P261', 'P284', 'P304+P340', 'P342+P311', 'P501'];
const SKIN_SENS = ['P261', 'P272', 'P280', 'P302+P352', 'P333+P313', 'P321', 'P362+P364', 'P501'];
const FLAM = [
  'P210',
  'P233',
  'P240',
  'P241',
  'P242',
  'P243',
  'P280',
  'P303+P361+P353',
  'P370+P378',
  'P403+P235',
  'P501',
];

const P_BY_CATEGORY: Partial<Record<HazardCategory, string[]>> = {
  'Flam. Liq. 1': FLAM,
  'Flam. Liq. 2': FLAM,
  'Flam. Liq. 3': FLAM,
  'Met. Corr. 1': ['P234', 'P390', 'P406'],
  'Skin Corr. 1': SKIN_CORR,
  'Skin Corr. 1A': SKIN_CORR,
  'Skin Corr. 1B': SKIN_CORR,
  'Skin Corr. 1C': SKIN_CORR,
  'Skin Irrit. 2': ['P264', 'P280', 'P302+P352', 'P321', 'P332+P313', 'P362+P364'],
  'Eye Dam. 1': ['P280', 'P305+P351+P338', 'P310'],
  'Eye Irrit. 2': ['P264', 'P280', 'P305+P351+P338', 'P337+P313'],
  'Resp. Sens. 1': RESP_SENS,
  'Resp. Sens. 1A': RESP_SENS,
  'Resp. Sens. 1B': RESP_SENS,
  'Skin Sens. 1': SKIN_SENS,
  'Skin Sens. 1A': SKIN_SENS,
  'Skin Sens. 1B': SKIN_SENS,
  'Muta. 1A': CMR,
  'Muta. 1B': CMR,
  'Muta. 2': CMR,
  'Carc. 1A': CMR,
  'Carc. 1B': CMR,
  'Carc. 2': CMR,
  'Repr. 1A': CMR,
  'Repr. 1B': CMR,
  'Repr. 2': CMR,
  'Lact.': ['P201', 'P260', 'P263', 'P264', 'P270', 'P308+P313'],
  'STOT SE 1': ['P260', 'P264', 'P270', 'P308+P311', 'P321', 'P405', 'P501'],
  'STOT SE 2': ['P260', 'P264', 'P270', 'P308+P311', 'P405', 'P501'],
  'STOT SE 3': ['P261', 'P271', 'P304+P340', 'P312', 'P403+P233', 'P405', 'P501'],
  'STOT RE 1': ['P260', 'P264', 'P270', 'P314', 'P501'],
  'STOT RE 2': ['P260', 'P314', 'P501'],
  'Asp. Tox. 1': ['P301+P310', 'P331', 'P405', 'P501'],
  'Aquatic Acute 1': ['P273', 'P391', 'P501'],
  'Aquatic Chronic 1': ['P273', 'P391', 'P501'],
  'Aquatic Chronic 2': ['P273', 'P391', 'P501'],
  'Aquatic Chronic 3': ['P273', 'P501'],
  'Aquatic Chronic 4': ['P273', 'P501'],
};

const ACUTE_P: Record<string, string[]> = {
  H300: ORAL_1_3,
  H301: ORAL_1_3,
  H302: ['P264', 'P270', 'P301+P312', 'P330', 'P501'],
  H310: ['P262', 'P264', 'P270', 'P280', 'P302+P352', 'P310', 'P321', 'P361+P364', 'P405', 'P501'],
  H311: ['P280', 'P302+P352', 'P312', 'P321', 'P361+P364', 'P405', 'P501'],
  H312: ['P280', 'P302+P352', 'P312', 'P321', 'P362+P364', 'P501'],
  H330: ['P260', 'P271', 'P284', 'P304+P340', 'P310', 'P320', 'P403+P233', 'P405', 'P501'],
  H331: ['P261', 'P271', 'P304+P340', 'P311', 'P321', 'P403+P233', 'P405', 'P501'],
  H332: ['P261', 'P271', 'P304+P340', 'P312'],
};

const ART26 = 'SEA Madde 26 / CLP Madde 26 (piktogram önceliği)';

/**
 * Label elements derived only from the final classification (CLAUDE.md rule 7).
 */
export function deriveLabel(
  classifications: readonly MixtureClassification[],
  supplemental: readonly SupplementalStatement[],
): LabelElements {
  const trace: TraceEntry[] = [];
  const categories = classifications.map((c) => c.category);

  // Pictograms with the precedence rules of Article 26(1).
  const reasons = new Map<Pictogram, HazardCategory[]>();
  for (const category of categories) {
    const pictogram = categoryInfo(category).pictogram;
    if (pictogram) reasons.set(pictogram, [...(reasons.get(pictogram) ?? []), category]);
  }
  const ghs07 = reasons.get('GHS07');
  if (ghs07) {
    let remaining = ghs07;
    if (reasons.has('GHS06')) {
      remaining = [];
      trace.push({ message: 'GHS07 kullanılmadı, çünkü GHS06 var.', reference: `${ART26} (b)` });
    }
    if (reasons.has('GHS05')) {
      const before = remaining.length;
      remaining = remaining.filter((c) => c !== 'Skin Irrit. 2' && c !== 'Eye Irrit. 2');
      if (remaining.length < before) {
        trace.push({
          message: 'GHS07 cilt/göz tahrişi için kullanılmadı, çünkü GHS05 var.',
          reference: `${ART26} (c)`,
        });
      }
    }
    const respSens = classifications.some((c) => c.hazardClass === 'respiratory_sensitisation');
    if (respSens) {
      const before = remaining.length;
      remaining = remaining.filter(
        (c) =>
          ![
            'Skin Irrit. 2',
            'Eye Irrit. 2',
            'Skin Sens. 1',
            'Skin Sens. 1A',
            'Skin Sens. 1B',
          ].includes(c),
      );
      if (remaining.length < before) {
        trace.push({
          message:
            'GHS07 cilt hassaslaştırması ve cilt/göz tahrişi için kullanılmadı, çünkü solunum hassaslaştırması için GHS08 var.',
          reference: `${ART26} (d)`,
        });
      }
    }
    if (remaining.length === 0) reasons.delete('GHS07');
  }
  const pictograms = [...reasons.keys()].sort();

  // Signal word: "Danger" takes precedence over "Warning" (Article 20(3)).
  const words = categories.map((c) => categoryInfo(c).signalWord);
  const signalWord = words.includes('danger')
    ? 'danger'
    : words.includes('warning')
      ? 'warning'
      : null;
  if (signalWord) {
    const by = categories.filter((c) => categoryInfo(c).signalWord === signalWord);
    trace.push({
      message: `Uyarı kelimesi ${signalWord === 'danger' ? 'TEHLİKE' : 'DİKKAT'}, çünkü ${by.join(', ')}`,
      reference: 'SEA Madde 20 / CLP Madde 20',
    });
  }

  // Hazard statements without duplicates. H318 is not repeated next to H314 (TODO(KDU) #8).
  let hStatements = [...new Set(classifications.flatMap((c) => c.hCodes))].sort();
  if (hStatements.includes('H314') && hStatements.includes('H318')) {
    hStatements = hStatements.filter((h) => h !== 'H318');
    trace.push({
      message: 'H318 etikete ayrıca yazılmadı, çünkü H314 ciddi göz hasarını kapsar.',
      reference: 'SEA Madde 27 / CLP Madde 27',
    });
  }

  const pStatementSuggestions = suggestP(classifications);
  return {
    pictograms,
    signalWord,
    hStatements,
    pStatementSuggestions,
    supplemental: [...supplemental],
    trace,
  };
}

function suggestP(classifications: readonly MixtureClassification[]): PStatementSuggestion[] {
  const byCode = new Map<string, Set<HazardCategory>>();
  for (const c of classifications) {
    const codes = c.hazardClass.startsWith('acute_toxicity')
      ? c.hCodes.flatMap((h) => ACUTE_P[h] ?? [])
      : (P_BY_CATEGORY[c.category] ?? []);
    for (const code of codes) byCode.set(code, (byCode.get(code) ?? new Set()).add(c.category));
  }
  return [...byCode.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
    .map(([code, cats]) => ({ code, categories: [...cats] }));
}
