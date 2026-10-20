import { classifyMixture } from '@sds/classification-engine';
import { describe, expect, it } from 'vitest';
import { buildMixture, parseRecipePaste, toMeasurements } from './mixture';
import type { ClassificationLine, Extraction } from './types';

const src = { page: 3, quote: 'x' };
const found = <T>(value: T) => ({ status: 'found' as const, value, source: src });

function line(category: string | null, hCode: string | null): ClassificationLine {
  return { hazardClassAsWritten: category ?? '?', category, hCode, source: src };
}

function extraction(components: Extraction['components']): Extraction {
  return {
    identity: {
      tradeName: found('T'),
      supplier: found('S'),
      revisionDate: found('2026'),
      revisionNumber: found('1'),
    },
    productClassification: { status: 'classified', lines: [] },
    components,
    physicalProperties: [],
  };
}

function comp(
  name: string,
  min: number | null,
  max: number | null,
  lines: ClassificationLine[],
): Extraction['components'][number] {
  return {
    name: found(name),
    cas: found('1-1-1'),
    concentration: { min, max, raw: `${min}-${max}`, source: src },
    classifications: lines,
  };
}

describe('buildMixture', () => {
  it('scales component ranges by the recipe range, keeping both bounds', () => {
    const { input } = buildMixture(
      [{ id: 'l1', raw_material_id: 'rm', percent_min: 10, percent_max: 20 }],
      [
        {
          id: 'rm',
          trade_name: 'Emülgatör',
          approvedExtraction: extraction([comp('A', 75, 100, [line('Eye Dam. 1', 'H318')])]),
        },
      ],
      [],
    );
    expect(input.components[0]?.concentration).toEqual({ min: 7.5, max: 20 });
    expect(input.components[0]?.hazardData).toBe('classified');
  });

  it('passes the verified Annex 6 entry of a CAS to the engine and labels the source', () => {
    const { input, sources } = buildMixture(
      [{ id: 'l1', raw_material_id: 'rm', percent_min: 100, percent_max: 100 }],
      [
        {
          id: 'rm',
          trade_name: 'Madde',
          approvedExtraction: extraction([comp('A', 100, 100, [line('Eye Irrit. 2', 'H319')])]),
        },
      ],
      [],
      {
        '1-1-1': {
          reference: 'SEA Ek-6 liste no 000-000-00-0',
          classifications: [{ category: 'Eye Dam. 1', hCode: 'H318' }],
        },
      },
    );
    expect(input.components[0]?.harmonised?.classifications).toEqual([
      { category: 'Eye Dam. 1', hCode: 'H318' },
    ]);
    expect(sources.l1).toBe('SEA Ek-6 + tedarikçi SDS');
    // The engine raises the supplier's lighter category to the official one.
    const result = classifyMixture(input);
    expect(result.classifications.some((c) => c.category === 'Eye Dam. 1')).toBe(true);
  });

  it('without an Annex 6 entry the source is the supplier SDS only', () => {
    const { sources } = buildMixture(
      [{ id: 'l1', raw_material_id: 'rm', percent_min: 100, percent_max: 100 }],
      [
        {
          id: 'rm',
          trade_name: 'Madde',
          approvedExtraction: extraction([comp('A', 100, 100, [line('Eye Irrit. 2', 'H319')])]),
        },
      ],
      [],
    );
    expect(sources.l1).toBe('Tedarikçi SDS (onaylı)');
  });

  it('treats a raw material without an approved SDS as missing data, not as no hazard', () => {
    const { input } = buildMixture(
      [{ id: 'l1', raw_material_id: 'rm', percent_min: 100, percent_max: 100 }],
      [{ id: 'rm', trade_name: 'X', approvedExtraction: null }],
      [],
    );
    expect(input.components[0]?.hazardData).toBe('unknown');
    expect(classifyMixture(input).canFinalize).toBe(false);
  });

  it('takes the only H code of a category, and asks the KDU where the route decides it', () => {
    const { input, notes } = buildMixture(
      [{ id: 'l1', raw_material_id: 'rm', percent_min: 100, percent_max: 100 }],
      [
        {
          id: 'rm',
          trade_name: 'X',
          approvedExtraction: extraction([
            comp('A', 100, 100, [line('Eye Dam. 1', null), line('Acute Tox. 4', null)]),
          ]),
        },
      ],
      [],
    );
    expect(input.components[0]?.classifications).toEqual([
      { category: 'Eye Dam. 1', hCode: 'H318' },
    ]);
    expect(notes.map((n) => [n.code, n.severity])).toEqual([
      ['RECIPE_H_CODE_FROM_CATEGORY', 'info'],
      ['RECIPE_H_CODE_MISSING', 'blocking'],
    ]);
  });

  it('assumes 100 % for an open upper bound and says so', () => {
    const { input, notes } = buildMixture(
      [{ id: 'l1', raw_material_id: 'rm', percent_min: 50, percent_max: 50 }],
      [
        {
          id: 'rm',
          trade_name: 'X',
          approvedExtraction: extraction([comp('A', 30, null, [line('Skin Irrit. 2', 'H315')])]),
        },
      ],
      [],
    );
    expect(input.components[0]?.concentration).toEqual({ min: 15, max: 50 });
    expect(notes.some((n) => n.code === 'RECIPE_OPEN_UPPER_BOUND')).toBe(true);
  });

  it('blocks a recipe whose ranges cannot add up to 100 %', () => {
    const { notes } = buildMixture(
      [{ id: 'l1', raw_material_id: 'rm', percent_min: 40, percent_max: 60 }],
      [{ id: 'rm', trade_name: 'X', approvedExtraction: null }],
      [],
    );
    expect(notes.find((n) => n.code === 'RECIPE_TOTAL')?.severity).toBe('blocking');
  });

  it('feeds the engine an end-to-end result with a trace', () => {
    const { input } = buildMixture(
      [
        { id: 'l1', raw_material_id: 'rm', percent_min: 20, percent_max: 20 },
        { id: 'l2', raw_material_id: 'water', percent_min: 80, percent_max: 80 },
      ],
      [
        {
          id: 'rm',
          trade_name: 'X',
          approvedExtraction: extraction([comp('A', 100, 100, [line('Eye Dam. 1', 'H318')])]),
        },
        {
          id: 'water',
          trade_name: 'Su',
          approvedExtraction: {
            ...extraction([]),
            productClassification: { status: 'not_classified', lines: [] },
          },
        },
      ],
      toMeasurementsRows(),
    );
    const result = classifyMixture(input);
    const eye = result.classifications.find((c) => c.hazardClass === 'eye_damage_irritation');
    expect(eye?.hCodes).toEqual(['H318']);
    expect(eye?.trace.length).toBeGreaterThan(0);
  });
});

function toMeasurementsRows() {
  return [
    { property: 'physical_state', value_text: 'liquid', numeric_min: null },
    { property: 'flash_point', value_text: '> 100 °C', numeric_min: 101 },
    { property: 'ph', value_text: '7', numeric_min: 7 },
  ];
}

describe('toMeasurements', () => {
  it('reads measured mixture values only', () => {
    expect(toMeasurements(toMeasurementsRows())).toEqual({
      physicalState: 'liquid',
      flashPointC: 101,
      pH: 7,
    });
  });
});

describe('parseRecipePaste', () => {
  const materials = [
    { id: 'a', trade_name: 'Emulan® OG' },
    { id: 'w', trade_name: 'Su' },
  ];

  it('reads single values and ranges with Turkish decimals', () => {
    const { lines, problems } = parseRecipePaste('Emulan® OG\t12,5\nsu\t80\t87,5', materials);
    expect(problems).toEqual([]);
    expect(lines).toEqual([
      { rawMaterialId: 'a', min: 12.5, max: 12.5 },
      { rawMaterialId: 'w', min: 80, max: 87.5 },
    ]);
  });

  it('reports unknown names and unreadable numbers instead of guessing', () => {
    const { lines, problems } = parseRecipePaste('Bilinmeyen;5\nSu;yok', materials);
    expect(lines).toEqual([]);
    expect(problems).toHaveLength(2);
  });
});
