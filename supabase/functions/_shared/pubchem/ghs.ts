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
  /** Order PubChem lists a source's reports in; for NITE-CMC the fiscal year of the report. */
  SortOrder?: number;
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
  /** Older reports of the same source that were left out in favour of the newest one. */
  superseded: string[];
  snapshot: { references: Reference[]; items: Information[] };
}

/**
 * Independence groups. Sources in one family rest on the same origin and count as one vote.
 * TODO(KDU): confirm the families, e.g. whether Safe Work Australia (HCIS) is independent of
 * the EU harmonised list it was built from.
 */
const FAMILIES: [RegExp, string][] = [
  [/european chemicals agency|\bECHA\b/i, 'echa_notifications'],
  [/regulation \(ec\) no 1272\/2008|\beur-?lex\b/i, 'eu_clp_regulation'],
  [/\bNITE\b|national institute of technology and evaluation/i, 'jp_nite'],
  [/new zealand|\bCCID\b/i, 'nz_epa'],
  [/korea/i, 'kr_me'],
  [/safe work australia|\bHCIS\b/i, 'au_hcis'],
];

/**
 * Sources left out entirely. ECHA C&L "majority notification" data is never shown or stored
 * (CLAUDE.md, decision 2026-10-19), and PubChem's ECHA records are exactly that aggregate.
 * PubChem's "Regulation (EC) No 1272/2008" record is a copy of the EU's CLP Annex VI table
 * (its SourceID is the Annex VI index number); CLAUDE.md keeps third-party copies of regulation
 * tables out of the product database, and the SEA Ek-6 import is the harmonised source here.
 */
export const EXCLUDED_FAMILIES = new Set(['echa_notifications', 'eu_clp_regulation']);

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

/** What one reference (one report of one source) says. */
interface Report {
  ref: Reference;
  statements: { hCode: string; text: string }[];
  categoryTexts: string[];
  notClassified: boolean;
  unreadable: string[];
  items: Information[];
}

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

  const reports = new Map<number, Report>();
  const report = (n: number | undefined): Report | null => {
    const ref = n === undefined ? undefined : references.get(n);
    if (!ref?.SourceName?.trim()) return null;
    let r = reports.get(ref.ReferenceNumber ?? -1);
    if (!r) {
      r = {
        ref,
        statements: [],
        categoryTexts: [],
        notClassified: false,
        unreadable: [],
        items: [],
      };
      reports.set(ref.ReferenceNumber ?? -1, r);
    }
    return r;
  };

  for (const item of statementItems) {
    if (item.Name !== 'GHS Hazard Statements') continue;
    const r = report(item.ReferenceNumber);
    if (!r) continue;
    r.items.push(item);
    for (const text of strings(item)) {
      const code = LEADING_CODE.exec(text)?.[1];
      if (code) {
        const hCode = code.replace(/\s+/g, '');
        if (!r.statements.some((s) => s.hCode === hCode)) r.statements.push({ hCode, text });
      } else if (NOT_CLASSIFIED.test(text)) {
        r.notClassified = true;
      } else if (!AGGREGATE_NOTE.test(text)) {
        r.unreadable.push(text);
      }
    }
  }
  for (const item of categoryItems) {
    const r = report(item.ReferenceNumber);
    if (!r) continue;
    r.items.push(item);
    for (const text of strings(item))
      if (!r.categoryTexts.includes(text)) r.categoryTexts.push(text);
  }

  // A source can publish several reports of one substance (NITE-CMC: the original 2006 and the
  // revised 2014 classification). Only the newest is used; merging them would put a superseded
  // category next to its replacement and show a conflict the source itself resolved.
  const bySource = new Map<string, Report[]>();
  for (const r of reports.values()) {
    const id = `pubchem:${slug(r.ref.SourceName ?? '')}`;
    bySource.set(id, [...(bySource.get(id) ?? []), r]);
  }
  const out: SourceGhs[] = [];
  for (const [sourceId, all] of bySource) {
    const newest = Math.max(...all.map((r) => r.ref.SortOrder ?? -Infinity));
    const current = all.filter((r) => (r.ref.SortOrder ?? -Infinity) === newest);
    const older = all.filter((r) => !current.includes(r));
    const first = current[0]?.ref;
    if (!first) continue;
    const e: SourceGhs = {
      sourceId,
      sourceName: first.SourceName?.trim() ?? sourceId,
      family: familyOf(first.SourceName ?? ''),
      url: first.URL ?? null,
      licenseNote: first.LicenseNote ?? null,
      licenseUrl: first.LicenseURL ?? null,
      statements: [],
      categoryTexts: [],
      notClassified: false,
      unreadable: [],
      superseded: older.map((r) => r.ref.Name ?? `rapor ${r.ref.SortOrder ?? '?'}`),
      snapshot: { references: [], items: [] },
    };
    for (const r of all) {
      e.snapshot.references.push(r.ref);
      e.snapshot.items.push(...r.items);
    }
    for (const r of current) {
      for (const st of r.statements)
        if (!e.statements.some((x) => x.hCode === st.hCode)) e.statements.push(st);
      for (const t of r.categoryTexts) if (!e.categoryTexts.includes(t)) e.categoryTexts.push(t);
      e.notClassified = e.notClassified || r.notClassified;
      e.unreadable.push(...r.unreadable);
    }
    if (e.statements.length > 0) e.notClassified = false;
    if (e.statements.length > 0 || e.notClassified || e.unreadable.length > 0) out.push(e);
  }
  return out;
}
