import { execFileSync } from 'node:child_process';

export interface PdfText {
  pageCount: number;
  /** Text per page (index 0 = page 1); null when pdftotext is not available. */
  pages: string[] | null;
}

/** Reads the text layer with poppler's pdftotext when installed; used for checks only. */
export function readPdfText(path: string): PdfText {
  try {
    const info = execFileSync('pdfinfo', [path], { encoding: 'utf8' });
    const pageCount = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1] ?? 0);
    const text = execFileSync('pdftotext', ['-layout', path, '-'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return { pageCount, pages: text.split('\f').slice(0, pageCount) };
  } catch {
    return { pageCount: 0, pages: null };
  }
}

/** A PDF without a meaningful text layer is treated as scanned. */
export function isScanned(text: PdfText): boolean | null {
  if (!text.pages || text.pageCount === 0) return null;
  const chars = text.pages.join('').replace(/\s/g, '').length;
  return chars / text.pageCount < 100;
}
