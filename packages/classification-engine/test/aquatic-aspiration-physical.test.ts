import { describe, expect, it } from 'vitest';
import { classify, component, find, NEUTRAL, warningCodes, water } from './helpers';

describe('aquatic environment (CLP Annex I Tables 4.1.1 and 4.1.2)', () => {
  it('Chronic 1 with M = 10 at 0.3 %: M × 10 × 0.3 = 30 ≥ 25 → Aquatic Chronic 2 (H411)', () => {
    const r = classify([
      component('A', 0.3, [['Aquatic Chronic 1', 'H410']], { mFactors: { chronic: 10 } }),
      water(99.7),
    ]);
    expect(find(r, 'aquatic_chronic')?.category).toBe('Aquatic Chronic 2');
    expect(r.label.pictograms).toEqual(['GHS09']);
  });

  it('Chronic 3 ≥ 25 % gives H412 without pictogram or signal word', () => {
    const r = classify([component('A', 30, [['Aquatic Chronic 3', 'H412']]), water(70)]);
    expect(r.label.hStatements).toEqual(['H412']);
    expect(r.label.pictograms).toEqual([]);
    expect(r.label.signalWord).toBeNull();
  });

  it('missing M-factor assumes M = 1 and asks for review', () => {
    const r = classify([component('A', 30, [['Aquatic Acute 1', 'H400']]), water(70)]);
    expect(find(r, 'aquatic_acute')?.category).toBe('Aquatic Acute 1');
    expect(warningCodes(r)).toContain('AQUATIC_M_FACTOR_MISSING');
  });
});

describe('aspiration (CLP Annex I 3.10.3.3.1)', () => {
  const recipe = [component('Hidrokarbon', 12, [['Asp. Tox. 1', 'H304']]), water(88)];

  it('≥ 10 % and measured viscosity ≤ 20.5 mm²/s gives H304', () => {
    const r = classify(recipe, { ...NEUTRAL, kinematicViscosity40C: 5 });
    expect(find(r, 'aspiration')?.hCodes).toEqual(['H304']);
  });

  it('viscosity above 20.5 mm²/s is not classified', () => {
    const r = classify(recipe, { ...NEUTRAL, kinematicViscosity40C: 30 });
    expect(find(r, 'aspiration')).toBeUndefined();
  });

  it('missing viscosity is undetermined and blocks', () => {
    const r = classify(recipe);
    expect(r.classStatus.aspiration).toBe('undetermined');
    expect(r.canFinalize).toBe(false);
  });
});

describe('physical hazards from measured data only (CLP Annex I Table 2.6.1)', () => {
  const base = [component('Etanol', 30, [['Flam. Liq. 2', 'H225']]), water(70)];

  it('flash point 23–60 °C gives Flam. Liq. 3 (H226)', () => {
    const r = classify(base, { ...NEUTRAL, flashPointC: 30 });
    expect(find(r, 'flammable_liquid')?.hCodes).toEqual(['H226']);
  });

  it('flash point < 23 °C and boiling point > 35 °C gives Flam. Liq. 2 (H225)', () => {
    const r = classify(base, { ...NEUTRAL, flashPointC: 15, initialBoilingPointC: 80 });
    expect(find(r, 'flammable_liquid')?.category).toBe('Flam. Liq. 2');
  });

  it('flash point < 23 °C without boiling point assumes category 1 and blocks', () => {
    const r = classify(base, { ...NEUTRAL, flashPointC: 15 });
    expect(find(r, 'flammable_liquid')?.category).toBe('Flam. Liq. 1');
    expect(r.canFinalize).toBe(false);
  });

  it('flash point > 60 °C is not classified even with a flammable component', () => {
    const r = classify(base, { ...NEUTRAL, flashPointC: 70 });
    expect(r.classStatus.flammable_liquid).toBe('not_classified');
  });

  it('a positive metal corrosion test gives H290; a missing test blocks', () => {
    const positive = classify([water(100)], { ...NEUTRAL, metalCorrosion: 'positive' });
    expect(positive.label.hStatements).toEqual(['H290']);
    const missing = classify([water(100)], { physicalState: 'liquid', flashPointC: 100 });
    expect(missing.classStatus.metal_corrosion).toBe('undetermined');
    expect(missing.canFinalize).toBe(false);
  });

  it('never derives a physical hazard from component percentages', () => {
    const r = classify([component('Asit', 50, [['Met. Corr. 1', 'H290']]), water(50)], {
      physicalState: 'liquid',
      flashPointC: 100,
    });
    expect(r.label.hStatements).not.toContain('H290');
  });
});
