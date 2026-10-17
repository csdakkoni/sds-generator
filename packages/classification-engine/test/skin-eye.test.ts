import { describe, expect, it } from 'vitest';
import { classify, component, find, warningCodes, water } from './helpers';

describe('skin corrosion/irritation (CLP Annex I Table 3.2.3)', () => {
  it('Skin Corr. 1A + 1B ≥ 5 % but 1A < 5 % gives Skin Corr. 1B', () => {
    const r = classify([
      component('A', 3, [['Skin Corr. 1A', 'H314']]),
      component('B', 3, [['Skin Corr. 1B', 'H314']]),
      water(94),
    ]);
    expect(find(r, 'skin_corrosion_irritation')?.category).toBe('Skin Corr. 1B');
  });

  it('Skin Corr. 1A ≥ 5 % gives Skin Corr. 1A', () => {
    const r = classify([component('A', 5, [['Skin Corr. 1A', 'H314']]), water(95)]);
    expect(find(r, 'skin_corrosion_irritation')?.category).toBe('Skin Corr. 1A');
  });

  it('a Skin Corr. 1 ingredient without sub-category gives Skin Corr. 1 without sub-category', () => {
    const r = classify([
      component('A', 3, [['Skin Corr. 1', 'H314']]),
      component('B', 3, [['Skin Corr. 1A', 'H314']]),
      water(94),
    ]);
    expect(find(r, 'skin_corrosion_irritation')?.category).toBe('Skin Corr. 1');
  });

  it('Skin Corr. 1 between 1 % and 5 % gives Skin Irrit. 2', () => {
    const r = classify([component('A', 3, [['Skin Corr. 1B', 'H314']]), water(97)]);
    expect(find(r, 'skin_corrosion_irritation')?.category).toBe('Skin Irrit. 2');
  });

  it('(10 × Skin Corr. 1) + Skin Irrit. 2 ≥ 10 % gives Skin Irrit. 2', () => {
    const r = classify([
      component('A', 0.3, [['Skin Corr. 1A', 'H314']]),
      component('B', 8, [['Skin Irrit. 2', 'H315']]),
      water(91.7),
    ]);
    expect(find(r, 'skin_corrosion_irritation')?.category).toBe('Skin Irrit. 2');
  });

  it('Skin Irrit. 2 below 10 % alone is not classified', () => {
    const r = classify([component('B', 9, [['Skin Irrit. 2', 'H315']]), water(91)]);
    expect(find(r, 'skin_corrosion_irritation')).toBeUndefined();
    expect(r.classStatus.skin_corrosion_irritation).toBe('not_classified');
  });

  it('an SCL lower than the generic limit is used (Σ C / SCL ≥ 1)', () => {
    const r = classify([
      component('A', 1, [['Skin Irrit. 2', 'H315']], {
        specificConcentrationLimits: [{ category: 'Skin Irrit. 2', lowerLimit: 1 }],
      }),
      water(99),
    ]);
    expect(find(r, 'skin_corrosion_irritation')?.category).toBe('Skin Irrit. 2');
  });
});

describe('serious eye damage/irritation (CLP Annex I Table 3.3.3)', () => {
  it('Eye Dam. 1 between 1 % and 3 % gives Eye Irrit. 2', () => {
    const r = classify([component('A', 1.5, [['Eye Dam. 1', 'H318']]), water(98.5)]);
    expect(find(r, 'eye_damage_irritation')?.category).toBe('Eye Irrit. 2');
  });

  it('Eye Irrit. 2 ≥ 10 % gives Eye Irrit. 2', () => {
    const r = classify([component('A', 10, [['Eye Irrit. 2', 'H319']]), water(90)]);
    expect(find(r, 'eye_damage_irritation')?.category).toBe('Eye Irrit. 2');
  });

  it('Skin Corr. 1 ingredients count towards Eye Dam. 1 (≥ 3 %)', () => {
    const r = classify([component('A', 3, [['Skin Corr. 1B', 'H314']]), water(97)]);
    expect(find(r, 'eye_damage_irritation')?.category).toBe('Eye Dam. 1');
  });
});

describe('concentration ranges', () => {
  it('reports both bounds when they differ and applies the upper bound as a stated assumption', () => {
    const r = classify([component('A', [2, 4], [['Eye Dam. 1', 'H318']]), water([96, 98])]);
    const eye = find(r, 'eye_damage_irritation');
    expect(eye?.category).toBe('Eye Dam. 1');
    expect(eye?.lowerBoundCategory).toBe('Eye Irrit. 2');
    expect(eye?.trace.map((t) => t.message).join(' ')).toContain(
      'Üst sınır varsayımı uygulandı (seçilmiş varsayım',
    );
    expect(eye?.trace[0]?.message).toContain('%2–4 (üst sınırda ≥ %3, alt sınırda < %3)');
    expect(warningCodes(r)).toContain('RANGE_BOUNDS_DIFFER');
  });

  it('never averages a range: 2–4 % is not treated as 3 %', () => {
    const r = classify([component('A', [1, 5], [['Eye Dam. 1', 'H318']]), water([95, 99])]);
    expect(find(r, 'eye_damage_irritation')?.category).toBe('Eye Dam. 1');
    expect(find(r, 'eye_damage_irritation')?.lowerBoundCategory).toBe('Eye Irrit. 2');
  });
});
