import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { checkExtraction } from './checks.ts';
import { isScanned, readPdfText } from './pdf.ts';
import { INSTRUCTIONS } from './prompt.ts';
import type { ExtractionProvider } from './provider.ts';
import type { ExtractionFile } from './schema.ts';
import { parseExtraction, RESPONSE_SCHEMA } from './validate.ts';

/** Extracts one supplier SDS; throws when the model output does not match the schema. */
export async function extractFile(
  path: string,
  provider: ExtractionProvider,
): Promise<ExtractionFile> {
  const started = Date.now();
  const text = readPdfText(path);
  const raw = await provider.extract({
    pdf: readFileSync(path),
    fileName: basename(path),
    instructions: INSTRUCTIONS,
    responseSchema: RESPONSE_SCHEMA,
  });
  const extraction = parseExtraction(raw);
  extraction.flags.push(...checkExtraction(extraction, text.pages));
  return {
    file: basename(path),
    pageCount: text.pageCount,
    scanned: isScanned(text),
    provider: provider.name,
    model: provider.model,
    extractedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    extraction,
  };
}
