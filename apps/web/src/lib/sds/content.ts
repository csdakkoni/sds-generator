/**
 * The content of one SDS revision. It is language-neutral data: both the Turkish and the
 * English documents are rendered from it, and two revisions are compared on it to decide
 * whether a new revision number is due (CLAUDE.md rule 10).
 */
import type { ClassificationResult, EngineWarning, MixtureInput } from '@sds/classification-engine';
import phrases from './phrases.json';

export type SdsLanguage = 'tr' | 'en';

export interface CompanyInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
  emergencyPhone: string;
}

export interface TransportInfo {
  /** True when the KDU has assessed the product as not dangerous for transport. */
  notRegulated: boolean;
  unNumber: string;
  shippingName: string;
  transportClass: string;
  packingGroup: string;
}

/** What the KDU enters or confirms on the SDS screen. */
export interface SdsInputs {
  identifiedUse: Record<SdsLanguage, string>;
  transport: TransportInfo;
  /** Precautionary statements the KDU selected from the engine's suggestions. */
  pStatements: string[];
  /** Section texts the KDU wrote or edited, per language; see SECTION_TEXT_KEYS. */
  texts: Record<SdsLanguage, Partial<Record<SectionTextKey, string>>>;
  kdu: { name: string; certificateNo: string };
}

/** Free-text parts of the SDS that depend on the product and stay under KDU control. */
export const SECTION_TEXT_KEYS = [
  's2_3',
  's4',
  's5',
  's6',
  's7',
  's8_1',
  's8_2',
  's10',
  's13',
] as const;
export type SectionTextKey = (typeof SECTION_TEXT_KEYS)[number];

export interface CompositionLine {
  name: string;
  ec: string | null;
  cas: string | null;
  /** Share of the mixture in %, both bounds kept. */
  min: number;
  max: number;
  classifications: { category: string; hCode: string }[];
}

export interface DataSource {
  rawMaterial: string;
  fileName: string;
  supplierRevision: string | null;
  approvedAt: string | null;
}

export interface SdsContent {
  schemaVersion: 1;
  product: { name: string; code: string | null };
  company: CompanyInfo;
  inputs: SdsInputs;
  measurements: { property: string; value_text: string; unit: string | null }[];
  composition: CompositionLine[];
  result: ClassificationResult;
  /** Warnings raised while gathering the recipe data (see lib/mixture.ts). */
  notes: EngineWarning[];
  dataSources: DataSource[];
}

export function emptyInputs(): SdsInputs {
  return {
    identifiedUse: { tr: '', en: '' },
    transport: {
      notRegulated: false,
      unNumber: '',
      shippingName: '',
      transportClass: '',
      packingGroup: '',
    },
    pStatements: [],
    texts: { tr: {}, en: {} },
    kdu: { name: '', certificateNo: '' },
  };
}

/** JSON with sorted keys, so equal content always compares equal. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

export function sameContent(a: SdsContent, b: SdsContent): boolean {
  return canonical(a) === canonical(b);
}

/** Section numbers whose content differs between two revisions, for the change log. */
export function changedSections(prev: SdsContent, next: SdsContent): number[] {
  const parts: [number, (c: SdsContent) => unknown][] = [
    [1, (c) => [c.product, c.company, c.inputs.identifiedUse]],
    [
      2,
      (c) => [
        c.result.classifications,
        c.result.label,
        c.inputs.pStatements,
        c.inputs.texts.tr.s2_3,
        c.inputs.texts.en.s2_3,
      ],
    ],
    [3, (c) => c.composition],
    [4, (c) => [c.inputs.texts.tr.s4, c.inputs.texts.en.s4]],
    [5, (c) => [c.inputs.texts.tr.s5, c.inputs.texts.en.s5]],
    [6, (c) => [c.inputs.texts.tr.s6, c.inputs.texts.en.s6]],
    [7, (c) => [c.inputs.texts.tr.s7, c.inputs.texts.en.s7]],
    [
      8,
      (c) => [
        c.inputs.texts.tr.s8_1,
        c.inputs.texts.en.s8_1,
        c.inputs.texts.tr.s8_2,
        c.inputs.texts.en.s8_2,
      ],
    ],
    [9, (c) => c.measurements],
    [10, (c) => [c.inputs.texts.tr.s10, c.inputs.texts.en.s10]],
    [11, (c) => [c.result.classStatus, c.result.ate]],
    [12, (c) => [c.result.classStatus.aquatic_acute, c.result.classStatus.aquatic_chronic]],
    [13, (c) => [c.inputs.texts.tr.s13, c.inputs.texts.en.s13]],
    [14, (c) => c.inputs.transport],
    [16, (c) => [c.dataSources, c.result.engineVersion, c.inputs.kdu]],
  ];
  return parts
    .filter(([, pick]) => canonical(pick(prev)) !== canonical(pick(next)))
    .map(([n]) => n);
}

type PhraseBook = {
  H: Record<string, string>;
  P: Record<string, string>;
  EUH: Record<string, string>;
};
const BOOK = phrases as Record<SdsLanguage, PhraseBook>;

/** Statement text; null when the phrase list has no text for the code. */
export function phrase(lang: SdsLanguage, code: string, detail = ''): string | null {
  const book = BOOK[lang];
  const text = code.startsWith('EUH')
    ? book.EUH[code]
    : code.startsWith('P')
      ? book.P[code]
      : book.H[code];
  return text === undefined ? null : text.replace('{detail}', detail);
}

/**
 * Reasons the revision cannot be approved and published yet. Missing data is never filled
 * in: it blocks publication until someone supplies it (CLAUDE.md rules 5, 6 and 11).
 */
export function publishBlockers(
  content: SdsContent,
  sectionText: (lang: SdsLanguage, key: SectionTextKey) => string,
): string[] {
  const out: string[] = [];
  const blocking = [...content.notes, ...content.result.warnings].filter(
    (w) => w.severity === 'blocking',
  );
  if (blocking.length > 0 || !content.result.canFinalize) {
    out.push(`Sınıflandırma kesinleşmedi (${blocking.length} eksik).`);
  }
  const c = content.company;
  if (!c.name.trim() || !c.address.trim() || !c.phone.trim() || !c.emergencyPhone.trim()) {
    out.push('Firma adı, adresi, telefonu ve acil durum telefonu girilmeli (Bölüm 1.3, 1.4).');
  }
  const i = content.inputs;
  if (!i.identifiedUse.tr.trim() || !i.identifiedUse.en.trim()) {
    out.push('Belirlenmiş kullanım TR ve EN girilmeli (Bölüm 1.2).');
  }
  const t = i.transport;
  if (!t.notRegulated && !(t.unNumber.trim() && t.shippingName.trim() && t.transportClass.trim())) {
    out.push('Taşıma bilgisi girilmeli ya da "taşımada tehlikeli değil" işaretlenmeli (Bölüm 14).');
  }
  if (!i.kdu.name.trim() || !i.kdu.certificateNo.trim()) {
    out.push('Onaylayan KDU adı ve sertifika numarası girilmeli (Bölüm 16).');
  }
  for (const lang of ['tr', 'en'] as const) {
    const empty = SECTION_TEXT_KEYS.filter((k) => !sectionText(lang, k).trim());
    if (empty.length > 0) {
      out.push(`${lang.toUpperCase()} metni boş bölümler: ${empty.map(sectionLabel).join(', ')}.`);
    }
  }
  const codes = [
    ...content.result.label.hStatements,
    ...i.pStatements,
    ...content.result.label.supplemental.map((s) => s.code),
  ];
  const missing = codes.filter(
    (code) => phrase('tr', code) === null || phrase('en', code) === null,
  );
  if (missing.length > 0) out.push(`İfade metni bulunmayan kodlar: ${missing.join(', ')}.`);
  return out;
}

export function sectionLabel(key: SectionTextKey): string {
  return key.slice(1).replace('_', '.');
}

export function composeContent(args: {
  product: SdsContent['product'];
  company: CompanyInfo;
  inputs: SdsInputs;
  measurements: SdsContent['measurements'];
  mixture: {
    input: MixtureInput;
    notes: EngineWarning[];
    cas: Record<string, string | null>;
    ec: Record<string, string | null>;
  };
  result: ClassificationResult;
  dataSources: DataSource[];
}): SdsContent {
  return {
    schemaVersion: 1,
    product: args.product,
    company: args.company,
    inputs: args.inputs,
    measurements: [...args.measurements].sort((a, b) => a.property.localeCompare(b.property)),
    composition: args.mixture.input.components.map((c) => ({
      name: c.name,
      ec: args.mixture.ec[c.id] ?? null,
      cas: args.mixture.cas[c.id] ?? null,
      min: c.concentration.min,
      max: c.concentration.max,
      classifications: c.classifications,
    })),
    result: args.result,
    notes: args.mixture.notes,
    dataSources: args.dataSources,
  };
}
