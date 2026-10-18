import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { z } from 'zod';
import { checkExtraction } from './checks.ts';
import { isScanned, readPdfText } from './pdf.ts';
import { INSTRUCTIONS } from './prompt.ts';
import type { ExtractionProvider } from './provider.ts';
import { Extraction, type ExtractionFile } from './schema.ts';

const RESPONSE_SCHEMA = (() => {
  const schema = z.toJSONSchema(Extraction) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
})();

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
  const parsed = Extraction.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Model output does not match the schema: ${z.prettifyError(parsed.error)}`);
  }
  const extraction = parsed.data;
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
