import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Extraction, ExtractionFile } from '../src/schema';

const notStated = { status: 'not_stated', value: null, source: null } as const;

describe('extraction schema', () => {
  it('accepts a value that is not in the document as null / not_stated', () => {
    const ok = Extraction.safeParse({
      identity: {
        tradeName: { status: 'found', value: 'Örnek', source: { page: 1, quote: 'Örnek' } },
        supplier: notStated,
        revisionDate: notStated,
        revisionNumber: notStated,
        language: 'tr',
      },
      productClassification: { status: 'not_stated', lines: [], statusSource: null },
      components: [],
      physicalProperties: [],
      transport: { unNumber: notStated, transportClass: notStated, packingGroup: notStated },
      flags: [],
    });
    expect(ok.success).toBe(true);
  });

  it('keeps concentration bounds separate', () => {
    expect(
      Object.keys(Extraction.shape.components.element.shape.concentration.unwrap().shape),
    ).toEqual(['min', 'max', 'raw', 'source']);
  });

  it('schema.json is up to date (run npm run schema)', () => {
    const committed = readFileSync(new URL('../schema.json', import.meta.url), 'utf8');
    expect(JSON.parse(committed)).toEqual(z.toJSONSchema(ExtractionFile));
  });
});
