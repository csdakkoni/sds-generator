/**
 * Outside data sources for substances that are not (fully) covered by SEA Annex 6: what each
 * source says, how far independent sources agree, and the firm KDU's confirmation of it.
 * Classification knowledge (H code -> category, agreement, draft lines) lives in the engine.
 */
import {
  compareSources,
  conservativeLines,
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
  snapshot: { unreadable?: string[] } | null;
}

export interface OutsideSource {
  record: OutsideRecord;
  lines: SourceLine[];
  notInClp: string[];
  notEvaluated: string[];
  unreadable: string[];
}

export interface OutsideSummary {
  cas: string;
  sources: OutsideSource[];
  agreement: Agreement;
  /** What a draft calculates with until the KDU confirms: the most severe line per class. */
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
    const r = resolveStatements(
      record.lines.map((l) => l.hCode),
      record.category_texts,
    );
    return { record, ...r, unreadable: record.snapshot?.unreadable ?? [] };
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

/** Plain-Turkish state of a substance's outside sources, for labels and the KDU. */
export function agreementLabel(summary: OutsideSummary | undefined): string {
  if (!summary || summary.sources.length === 0) return 'Dış kaynakta veri yok';
  switch (summary.agreement.status) {
    case 'agreed':
      return `${summary.agreement.families} bağımsız kaynak uyumlu, KDU onayı bekliyor`;
    case 'conflict':
      return 'Kaynaklar farklı ya da kategori belirsiz: KDU karar verecek';
    case 'single_family':
      return 'Tek bağımsız kaynak var: KDU kontrol edecek';
    default:
      return 'Dış kaynakta veri yok';
  }
}
