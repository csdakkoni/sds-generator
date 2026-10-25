import { describe, expect, it } from 'vitest';
import {
  categoriesForHCode,
  compareSources,
  conservativeLines,
  resolveReports,
  resolveStatements,
} from '../src';

describe('categoriesForHCode (CLP Annex I tables)', () => {
  it('maps a statement to the categories that carry it', () => {
    expect(categoriesForHCode('H318')).toEqual(['Eye Dam. 1']);
    expect(categoriesForHCode('H300')).toEqual(['Acute Tox. 1', 'Acute Tox. 2']);
    expect(categoriesForHCode('H360FD')).toEqual(['Repr. 1A', 'Repr. 1B']);
    expect(categoriesForHCode('H220')).toEqual([]);
  });
});

describe('resolveStatements', () => {
  it('turns unambiguous statements into lines and splits combined ones', () => {
    const r = resolveStatements(['H225', 'H319', 'H336', 'H301+H311'], []);
    expect(r.lines).toEqual([
      { category: 'Flam. Liq. 2', hCode: 'H225' },
      { category: 'Eye Irrit. 2', hCode: 'H319' },
      { category: 'STOT SE 3', hCode: 'H336' },
      { category: 'Acute Tox. 3', hCode: 'H301' },
      { category: 'Acute Tox. 3', hCode: 'H311' },
    ]);
  });

  it('takes the category from the source text when the statement alone cannot decide', () => {
    expect(resolveStatements(['H350'], ['Carc. 1B (100%)']).lines).toEqual([
      { category: 'Carc. 1B', hCode: 'H350' },
    ]);
    expect(resolveStatements(['H300'], ['Acute toxicity (Oral) - Category 2']).lines).toEqual([
      { category: 'Acute Tox. 2', hCode: 'H300' },
    ]);
  });

  it('uses the CLP category without sub-category where one exists (Skin Corr. 1)', () => {
    expect(resolveStatements(['H314', 'H317']).lines).toEqual([
      { category: 'Skin Corr. 1', hCode: 'H314' },
      { category: 'Skin Sens. 1', hCode: 'H317' },
    ]);
  });

  it('marks an undecidable category as uncertain with the most severe candidate', () => {
    expect(resolveStatements(['H350']).lines).toEqual([
      { category: 'Carc. 1A', hCode: 'H350', uncertain: { candidates: ['Carc. 1A', 'Carc. 1B'] } },
    ]);
  });

  it('reports GHS-only and not-evaluated codes instead of dropping them', () => {
    const r = resolveStatements(['H320', 'H220', 'H319']);
    expect(r.notInClp).toEqual(['H320']);
    expect(r.notEvaluated).toEqual(['H220']);
    expect(r.lines).toEqual([{ category: 'Eye Irrit. 2', hCode: 'H319' }]);
  });
});

describe('conservativeLines', () => {
  it('keeps the most severe category per class, acute toxicity per route', () => {
    expect(
      conservativeLines([
        [
          { category: 'Eye Irrit. 2', hCode: 'H319' },
          { category: 'Acute Tox. 4', hCode: 'H302' },
        ],
        [
          { category: 'Eye Dam. 1', hCode: 'H318' },
          { category: 'Acute Tox. 3', hCode: 'H311' },
        ],
      ]),
    ).toEqual([
      { category: 'Eye Dam. 1', hCode: 'H318' },
      { category: 'Acute Tox. 4', hCode: 'H302' },
      { category: 'Acute Tox. 3', hCode: 'H311' },
    ]);
  });
});

describe('compareSources with uncertain categories', () => {
  it('never counts an unstated category as agreement', () => {
    const line = resolveStatements(['H350']).lines;
    const r = compareSources([
      { sourceId: 'a', family: 'a', reference: 'a', lines: line },
      { sourceId: 'b', family: 'b', reference: 'b', lines: line },
    ]);
    expect(r.status).toBe('conflict');
  });
});

describe('resolveReports (a source with several dated reports)', () => {
  const stotSingle =
    'Specific target organ toxicity - Single exposure - Category 3 (Respiratory tract irritation, Narcotic effects)';

  it('lets the newest report win per hazard class (NITE-CMC acetone, 2006 and 2014)', () => {
    const r = resolveReports([
      {
        order: 2006,
        hCodes: ['H225', 'H305', 'H320', 'H335', 'H336', 'H361', 'H373'],
        categoryTexts: [
          'Flammable liquids - Category 2',
          'Reproductive toxicity - Category 2',
          stotSingle,
          'Specific target organ toxicity - Repeated exposure - Category 2 (blood)',
        ],
      },
      {
        order: 2014,
        hCodes: ['H225', 'H320', 'H335', 'H336', 'H361', 'H372'],
        categoryTexts: [
          'Flammable liquids - Category 2',
          'Reproductive toxicity - Category 2',
          stotSingle,
          'Specific target organ toxicity - Repeated exposure - Category 1 (central nervous system)',
        ],
      },
    ]);
    expect(r.lines.map((l) => l.hCode).sort()).toEqual(['H225', 'H335', 'H336', 'H361', 'H372']);
    expect(r.lines.find((l) => l.hCode === 'H372')?.category).toBe('STOT RE 1');
    expect(r.notInClp.sort()).toEqual(['H305', 'H320']);
  });

  it('keeps classes only an older report covers (a 2024 update of the aquatic class alone)', () => {
    const r = resolveReports([
      { order: 2024, hCodes: ['H400'], categoryTexts: [] },
      { order: 2009, hCodes: ['H314', 'H318', 'H331'], categoryTexts: [] },
      { order: 2006, hCodes: ['H314', 'H318', 'H330', 'H331', 'H400'], categoryTexts: [] },
    ]);
    const seen = [...r.lines.map((l) => l.hCode), ...r.notEvaluated];
    // Health classes from 2009 stay; 2006's H330 is a class (inhalation) 2009 already covers.
    expect(seen).toEqual(expect.arrayContaining(['H400', 'H314', 'H318', 'H331']));
    expect(seen).not.toContain('H330');
  });

  it('counts reports of the same date together and undated reports as the oldest', () => {
    const r = resolveReports([
      { order: null, hCodes: ['H302'], categoryTexts: [] },
      { order: 2020, hCodes: ['H315'], categoryTexts: [] },
      { order: 2020, hCodes: ['H319'], categoryTexts: [] },
    ]);
    expect(r.lines.map((l) => l.hCode).sort()).toEqual(['H302', 'H315', 'H319']);
  });
});
