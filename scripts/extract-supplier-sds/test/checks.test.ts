import { describe, expect, it } from 'vitest';
import { checkExtraction } from '../src/checks';
import { extractFile } from '../src/extract';
import type { ExtractionProvider } from '../src/provider';
import type { Extraction } from '../src/schema';
import { summaryMarkdown } from '../src/summary';

const notStated = { status: 'not_stated', value: null, source: null } as const;
const found = (value: string, page: number, quote: string) =>
  ({ status: 'found', value, source: { page, quote } }) as const;

function extraction(overrides: Partial<Extraction> = {}): Extraction {
  return {
    identity: {
      tradeName: found('Örnek Ürün', 1, 'Ticari ad: Örnek Ürün'),
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
    ...overrides,
  };
}

const component = (min: number | null, max: number | null): Extraction['components'][number] => ({
  name: found('Sodyum hidroksit', 2, 'Sodyum hidroksit'),
  cas: found('1310-73-2', 2, '1310-73-2'),
  ec: notStated,
  registrationNumber: notStated,
  concentration: { min, max, raw: 'x', source: { page: 2, quote: 'Sodyum hidroksit' } },
  classifications: [],
  specificConcentrationLimits: [],
  mFactorAcute: notStated,
  mFactorChronic: notStated,
  ateOral: notStated,
  ateDermal: notStated,
  ateInhalation: notStated,
});

describe('checks against the PDF text', () => {
  it('flags a quote that is not in the document', () => {
    const flags = checkExtraction(extraction(), ['başka bir metin']);
    expect(flags).toEqual([
      expect.objectContaining({ field: 'identity.tradeName', kind: 'unreadable' }),
    ]);
  });

  it('accepts a quote on its page regardless of whitespace and case', () => {
    expect(checkExtraction(extraction(), ['TİCARİ AD:   örnek ürün'])).toEqual([]);
  });

  it('flags a quote found on another page', () => {
    const flags = checkExtraction(extraction(), ['', 'Ticari ad: Örnek Ürün']);
    expect(flags[0]).toMatchObject({ kind: 'other', page: 2 });
  });
});

describe('consistency checks', () => {
  it('flags min > max and an open bound', () => {
    const kinds = checkExtraction(
      extraction({ components: [component(5, 2), component(null, 1)] }),
      null,
    ).map((f) => f.kind);
    expect(kinds).toEqual(['conflict', 'ambiguous']);
  });

  it('flags "classified" without classification lines', () => {
    const flags = checkExtraction(
      extraction({
        productClassification: { status: 'classified', lines: [], statusSource: null },
      }),
      null,
    );
    expect(flags.map((f) => f.field)).toEqual(['productClassification']);
  });
});

describe('extractFile', () => {
  const pdf = new URL('./fixtures/empty.pdf', import.meta.url).pathname;

  it('rejects model output that does not match the schema', async () => {
    const provider: ExtractionProvider = {
      name: 'fake',
      model: 'x',
      extract: async () => ({ foo: 1 }),
    };
    await expect(extractFile(pdf, provider)).rejects.toThrow('does not match the schema');
  });

  it('wraps valid output with run metadata', async () => {
    const provider: ExtractionProvider = {
      name: 'fake',
      model: 'm1',
      extract: async () => extraction(),
    };
    const result = await extractFile(pdf, provider);
    expect(result).toMatchObject({ file: 'empty.pdf', provider: 'fake', model: 'm1' });
  });
});

it('renders the summary table', () => {
  expect(summaryMarkdown([{ file: 'a.pdf', components: 3, flags: 1, durationMs: 1500 }])).toContain(
    '| a.pdf | 3 | 1 | 1.5 |  |',
  );
});
