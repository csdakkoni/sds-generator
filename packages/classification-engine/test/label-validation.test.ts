import { describe, expect, it } from 'vitest';
import { classify, component, NEUTRAL, warningCodes, water } from './helpers';

describe('label elements derived from the final classification (SEA/CLP Articles 20, 26, 27)', () => {
  it('GHS06 removes GHS07 (Art. 26(1)(b))', () => {
    const r = classify([
      component('A', 40, [['Acute Tox. 3', 'H301']], { ate: { oral: 100 } }),
      component('B', 20, [['Skin Irrit. 2', 'H315']]),
      water(40),
    ]);
    expect(r.label.pictograms).toEqual(['GHS06']);
  });

  it('GHS05 removes GHS07 for irritation but keeps it for skin sensitisation (Art. 26(1)(c))', () => {
    const r = classify([
      component('A', 10, [['Skin Corr. 1B', 'H314']]),
      component('B', 2, [['Skin Sens. 1', 'H317']]),
      water(88),
    ]);
    expect(r.label.pictograms).toEqual(['GHS05', 'GHS07']);
  });

  it('GHS08 for respiratory sensitisation removes GHS07 for skin sensitisation (Art. 26(1)(d))', () => {
    const r = classify([
      component('A', 2, [
        ['Resp. Sens. 1', 'H334'],
        ['Skin Sens. 1', 'H317'],
      ]),
      water(98),
    ]);
    expect(r.label.pictograms).toEqual(['GHS08']);
  });

  it('H318 is not repeated next to H314, while Eye Dam. 1 stays in the classification', () => {
    const r = classify([component('A', 10, [['Skin Corr. 1B', 'H314']]), water(90)]);
    expect(r.label.hStatements).toEqual(['H314']);
    expect(r.classifications.map((c) => c.category)).toContain('Eye Dam. 1');
  });

  it('suggests precautionary statements with the categories behind them', () => {
    const r = classify([component('A', 10, [['Eye Irrit. 2', 'H319']]), water(90)]);
    expect(r.label.pStatementSuggestions.map((p) => p.code)).toEqual([
      'P264',
      'P280',
      'P305+P351+P338',
      'P337+P313',
    ]);
  });

  it('an unclassified, fully known mixture with measured data can be finalised', () => {
    const r = classify([water(100)]);
    expect(r.classifications).toEqual([]);
    expect(r.label.signalWord).toBeNull();
    expect(r.canFinalize).toBe(true);
  });
});

describe('input checks', () => {
  it('blocks on hazard classes the engine does not evaluate', () => {
    const r = classify([component('Oksitleyici', 5, [['Ox. Liq. 2', 'H272']]), water(95)]);
    expect(r.warnings.find((w) => w.code === 'UNSUPPORTED_CATEGORY')?.severity).toBe('blocking');
  });

  it('blocks when the lower bounds add up to more than 100 %', () => {
    const r = classify([component('A', [60, 70], []), water([50, 60])]);
    expect(warningCodes(r)).toContain('COMPOSITION_OVER_100');
  });

  it('flags an incomplete composition', () => {
    const r = classify([water(80)]);
    expect(warningCodes(r)).toContain('COMPOSITION_INCOMPLETE');
  });

  it('rejects an invalid range instead of guessing', () => {
    const r = classify([component('A', [5, 2], [['Eye Dam. 1', 'H318']]), water(95)]);
    expect(warningCodes(r)).toContain('INVALID_CONCENTRATION');
  });

  it('extreme pH is only an indicator: review warning, no classification of its own', () => {
    const r = classify([water(100)], { ...NEUTRAL, pH: 12.5 });
    expect(r.classifications).toEqual([]);
    expect(warningCodes(r)).toContain('EXTREME_PH');
    expect(r.classStatus.skin_corrosion_irritation).toBe('undetermined');
  });

  it('records the engine version on every result', () => {
    expect(classify([water(100)]).engineVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
