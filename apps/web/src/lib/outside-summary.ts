/**
 * Outside data sources for substances that are not (fully) covered by SEA Annex 6: what each
 * source says, how far independent sources agree, and the firm KDU's confirmation of it.
 * Classification knowledge (H code -> category, agreement, draft lines) lives in the engine.
 */
import {
  compareSources,
  conservativeLines,
  resolveReports,
  resolveStatements,
  type Agreement,
  type SourceClassification,
  type SourceLine,
} from '@sds/classification-engine';

export interface OutsideRecord {
  source_id: string;
  family: string;
  name: string | null;
  reference: string;
  lines: { hCode: string; text: string }[];
  category_texts: string[];
  not_classified: boolean;
  fetched_at: string;
  snapshot: {
    unreadable?: string[];
    /** Present when the source published several dated reports. */
    reports?: { name: string; order: number | null; hCodes: string[]; categoryTexts: string[] }[];
  } | null;
}

export interface OutsideSource {
  record: OutsideRecord;
  lines: SourceLine[];
  notInClp: string[];
  notEvaluated: string[];
  unreadable: string[];
  /** Names of the source's separate reports, when it has several (newest wins per class). */
  reports: string[];
}

export interface OutsideSummary {
  cas: string;
  sources: OutsideSource[];
  agreement: Agreement;
  /**
   * The most severe line per class: a starting point for the KDU's own expert assessment.
   * Never used in a draft; the classification comes from the supplier SDS (decision 2026-10-25).
   */
  draftLines: SourceLine[];
}

/** A firm KDU's confirmed classification of a substance, made from outside sources. */
export interface ConfirmedProfile {
  profileId: string;
  reference: string;
  lines: { category: string; hCode: string }[];
  verifiedAt: string;
}

export function summarise(cas: string, records: OutsideRecord[]): OutsideSummary {
  const sources = records.map((record) => {
    const reports = record.snapshot?.reports ?? [];
    const r =
      reports.length > 1
        ? resolveReports(reports)
        : resolveStatements(
            record.lines.map((l) => l.hCode),
            record.category_texts,
          );
    return {
      record,
      ...r,
      unreadable: record.snapshot?.unreadable ?? [],
      reports: reports.length > 1 ? reports.map((x) => x.name) : [],
    };
  });
  const classifications: SourceClassification[] = sources.map((s) => ({
    sourceId: s.record.source_id,
    family: s.record.family,
    reference: s.record.name ?? s.record.source_id,
    lines: s.lines,
  }));
  return {
    cas,
    sources,
    agreement: compareSources(classifications),
    draftLines: conservativeLines(sources.map((s) => s.lines)),
  };
}

/** Plain-Turkish state of a substance's outside sources; they are information only. */
export function agreementLabel(summary: OutsideSummary | undefined): string {
  if (!summary || summary.sources.length === 0) return 'Dış kaynakta veri yok';
  switch (summary.agreement.status) {
    case 'agreed':
      return `Dış kaynaklar: ${summary.agreement.families} bağımsız kaynak uyumlu (yalnızca bilgi)`;
    case 'conflict':
      return 'Dış kaynaklar birbirinden farklı (yalnızca bilgi)';
    case 'single_family':
      return 'Dış kaynaklar: tek bağımsız kaynak (yalnızca bilgi)';
    default:
      return 'Dış kaynakta veri yok';
  }
}
