import { describe, expect, it } from 'vitest';
import { categoriesForHCode, compareSources, conservativeLines, resolveStatements } from '../src';

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
