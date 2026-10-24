/**
 * Reads the per-source GHS records of a PubChem compound page (PUG-View, heading "GHS
 * Classification" and "Hazard Classes and Categories").
 *
 * PubChem does not classify anything; it republishes what each source said, with a reference
 * per item. This file only regroups those items by source and keeps each hazard statement as
 * the source lists it. The code of a statement is the item's leading token (one structured
 * item per statement); free text is never searched for codes (CLAUDE.md rule 3). Turning codes
 * into CLP categories is the engine's job (resolveStatements).
 */

interface Markup {
  String?: string;
}
interface Information {
  ReferenceNumber?: number;
  Name?: string;
  Value?: { StringWithMarkup?: Markup[] };
}
interface Section {
  TOCHeading?: string;
  Section?: Section[];
  Information?: Information[];
}
interface Reference {
  ReferenceNumber?: number;
  SourceName?: string;
  SourceID?: string;
  Name?: string;
  URL?: string;
  LicenseNote?: string;
  LicenseURL?: string;
}
export interface PugView {
  Record?: { Section?: Section[]; Reference?: Reference[] };
}

export interface SourceGhs {
  sourceId: string;
  sourceName: string;
  family: string;
  url: string | null;
  licenseNote: string | null;
  licenseUrl: string | null;
  statements: { hCode: string; text: string }[];
  categoryTexts: string[];
  notClassified: boolean;
  /** Items that could not be read as a statement; shown to the KDU, never guessed. */
  unreadable: string[];
  snapshot: { references: Reference[]; items: Information[] };
}

/**
 * Independence groups. Sources in one family rest on the same origin and count as one vote.
 * TODO(KDU): confirm the families, e.g. whether Safe Work Australia (HCIS) is independent of
 * the EU harmonised list it was built from.
 */
const FAMILIES: [RegExp, string][] = [
  [/european chemicals agency|\bECHA\b/i, 'echa_notifications'],
  [/\bNITE\b|national institute of technology and evaluation/i, 'jp_nite'],
  [/new zealand|\bCCID\b/i, 'nz_epa'],
  [/korea/i, 'kr_me'],
  [/safe work australia|\bHCIS\b/i, 'au_hcis'],
];

/**
 * Sources left out entirely. ECHA C&L "majority notification" data is never shown or stored
 * (CLAUDE.md, decision 2026-10-19), and PubChem's ECHA records are exactly that aggregate.
 */
export const EXCLUDED_FAMILIES = new Set(['echa_notifications']);

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

export function familyOf(sourceName: string): string {
  return FAMILIES.find(([re]) => re.test(sourceName))?.[1] ?? `other:${slug(sourceName)}`;
}

const LEADING_CODE = /^\s*(H\d{3}[A-Za-z]*(?:\s*\+\s*H\d{3}[A-Za-z]*)*)(?=[\s:(]|$)/;
const NOT_CLASSIFIED = /^\s*not classified\b/i;
// PubChem's own note on an aggregate, not a statement.
const AGGREGATE_NOTE = /^\s*reported as not meeting ghs hazard criteria/i;

function sections(root: Section[] | undefined, heading: string, out: Section[] = []): Section[] {
  for (const s of root ?? []) {
    if (s.TOCHeading === heading) out.push(s);
    sections(s.Section, heading, out);
  }
  return out;
}

const strings = (i: Information) =>
  (i.Value?.StringWithMarkup ?? []).map((m) => m.String?.trim() ?? '').filter(Boolean);

export function parseGhs(ghs: PugView, categories: PugView = {}): SourceGhs[] {
  const references = new Map<number, Reference>();
  for (const r of [...(ghs.Record?.Reference ?? []), ...(categories.Record?.Reference ?? [])]) {
    if (r.ReferenceNumber !== undefined) references.set(r.ReferenceNumber, r);
  }
  const statementItems = sections(ghs.Record?.Section, 'GHS Classification').flatMap(
    (s) => s.Information ?? [],
  );
  const categoryItems = [
    ...sections(ghs.Record?.Section, 'Hazard Classes and Categories'),
    ...sections(categories.Record?.Section, 'Hazard Classes and Categories'),
  ].flatMap((s) => s.Information ?? []);

  const bySource = new Map<string, SourceGhs>();
  const entry = (n: number | undefined): SourceGhs | null => {
    const ref = n === undefined ? undefined : references.get(n);
    const name = ref?.SourceName?.trim();
    if (!ref || !name) return null;
    const sourceId = `pubchem:${slug(name)}`;
    let e = bySource.get(sourceId);
    if (!e) {
      e = {
        sourceId,
        sourceName: name,
        family: familyOf(name),
        url: ref.URL ?? null,
        licenseNote: ref.LicenseNote ?? null,
        licenseUrl: ref.LicenseURL ?? null,
        statements: [],
        categoryTexts: [],
        notClassified: false,
        unreadable: [],
        snapshot: { references: [], items: [] },
      };
      bySource.set(sourceId, e);
    }
    if (!e.snapshot.references.includes(ref)) e.snapshot.references.push(ref);
    return e;
  };

  for (const item of statementItems) {
    if (item.Name !== 'GHS Hazard Statements') continue;
    const e = entry(item.ReferenceNumber);
    if (!e) continue;
    e.snapshot.items.push(item);
    for (const text of strings(item)) {
      const code = LEADING_CODE.exec(text)?.[1];
      if (code) {
        const hCode = code.replace(/\s+/g, '');
        if (!e.statements.some((s) => s.hCode === hCode)) e.statements.push({ hCode, text });
      } else if (NOT_CLASSIFIED.test(text)) {
        e.notClassified = true;
      } else if (!AGGREGATE_NOTE.test(text)) {
        e.unreadable.push(text);
      }
    }
  }
  for (const item of categoryItems) {
    const e = entry(item.ReferenceNumber);
    if (!e) continue;
    e.snapshot.items.push(item);
    for (const text of strings(item))
      if (!e.categoryTexts.includes(text)) e.categoryTexts.push(text);
  }
  for (const e of bySource.values()) if (e.statements.length > 0) e.notClassified = false;
  return [...bySource.values()].filter(
    (e) => e.statements.length > 0 || e.notClassified || e.unreadable.length > 0,
  );
}
