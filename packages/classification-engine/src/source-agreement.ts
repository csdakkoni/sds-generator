import { classKey } from './harmonised';
import type { SourceLine } from './statements';

/**
 * Compares the classifications of one substance from several data sources.
 *
 * Sources that share an origin (for example PubChem and the ECHA C&L inventory, which both
 * rest on the same industry notifications) belong to one `family` and count as ONE vote:
 * agreement counts only between independent families. Nothing here decides a classification;
 * it says how much the sources agree so the app can choose between a one-click confirmation
 * and the KDU list (CLAUDE.md: conflicting profiles are never resolved by the system).
 */
export interface SourceClassification {
  sourceId: string;
  /** Independence group; sources of the same family never confirm each other. */
  family: string;
  /** Human-readable reference shown to the KDU. */
  reference: string;
  lines: SourceLine[];
}

export interface SourceDifference {
  /** Hazard class key, e.g. "eye_damage_irritation" or "acute_toxicity:oral". */
  hazardClass: string;
  /** What each family says for this class; null when a family lists nothing for it. */
  byFamily: Record<string, string | null>;
}

export type Agreement =
  | { status: 'none'; families: number; differences: []; trace: string }
  | { status: 'single_family'; families: 1; differences: []; trace: string }
  | { status: 'agreed'; families: number; differences: []; trace: string }
  | { status: 'conflict'; families: number; differences: SourceDifference[]; trace: string };

const UNCERTAIN = ' (kategori kaynakta yok)';
const label = (l: SourceLine) => `${l.category} (${l.hCode})${l.uncertain ? UNCERTAIN : ''}`;

/** One family's view: per hazard class the sorted lines it lists. */
function view(sources: SourceClassification[]): Map<string, string> {
  const perClass = new Map<string, string[]>();
  for (const s of sources) {
    for (const line of s.lines) {
      const key = classKey(line);
      const list = perClass.get(key) ?? [];
      if (!list.includes(label(line))) list.push(label(line));
      perClass.set(key, list);
    }
  }
  return new Map([...perClass].map(([k, v]) => [k, [...v].sort().join(' + ')]));
}

export function compareSources(sources: SourceClassification[]): Agreement {
  const families = new Map<string, SourceClassification[]>();
  for (const s of sources) families.set(s.family, [...(families.get(s.family) ?? []), s]);
  const names = [...families.keys()].sort();

  if (names.length === 0) {
    return { status: 'none', families: 0, differences: [], trace: 'Hiç kaynak yok.' };
  }
  if (names.length === 1) {
    return {
      status: 'single_family',
      families: 1,
      differences: [],
      trace: `Yalnızca tek bağımsız kaynak ailesi var (${names[0]}); doğrulama yapılamaz.`,
    };
  }

  const views = new Map(names.map((n) => [n, view(families.get(n) ?? [])]));
  const classes = [...new Set([...views.values()].flatMap((v) => [...v.keys()]))].sort();
  const differences: SourceDifference[] = [];
  for (const hazardClass of classes) {
    const byFamily = Object.fromEntries(
      names.map((n) => [n, views.get(n)?.get(hazardClass) ?? null]),
    );
    // A category a source does not state is never an agreement, even if two sources match.
    const uncertain = Object.values(byFamily).some((v) => v?.includes(UNCERTAIN));
    if (uncertain || new Set(Object.values(byFamily)).size > 1) {
      differences.push({ hazardClass, byFamily });
    }
  }

  if (differences.length === 0) {
    return {
      status: 'agreed',
      families: names.length,
      differences: [],
      trace: `${names.length} bağımsız kaynak ailesi (${names.join(', ')}) aynı sınıflandırmayı veriyor.`,
    };
  }
  return {
    status: 'conflict',
    families: names.length,
    differences,
    trace: `${names.length} bağımsız kaynak ailesi arasında ${differences.length} sınıfta fark veya belirsizlik var; sistem seçim yapmaz, KDU değerlendirir.`,
  };
}
