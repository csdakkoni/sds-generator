import type { ExtractionFile } from './schema.ts';

export interface SummaryRow {
  file: string;
  components: number;
  flags: number;
  durationMs: number;
  error?: string;
}

export function summaryRow(result: ExtractionFile): SummaryRow {
  return {
    file: result.file,
    components: result.extraction.components.length,
    flags: result.extraction.flags.length,
    durationMs: result.durationMs,
  };
}

export function summaryMarkdown(rows: readonly SummaryRow[]): string {
  const lines = [
    '| Belge | Bileşen | Bayraklı alan | Süre (sn) | Hata |',
    '|---|---:|---:|---:|---|',
    ...rows.map(
      (r) =>
        `| ${r.file} | ${r.error ? '—' : r.components} | ${r.error ? '—' : r.flags} | ${(r.durationMs / 1000).toFixed(1)} | ${r.error ?? ''} |`,
    ),
  ];
  return `${lines.join('\n')}\n`;
}
