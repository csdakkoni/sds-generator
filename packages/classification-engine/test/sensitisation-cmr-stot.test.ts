import { describe, expect, it } from 'vitest';
import { classify, component, find, water } from './helpers';

describe('sensitisation (CLP Annex I Tables 3.4.5 and 3.4.6)', () => {
  it('Skin Sens. 1 ≥ 1 % gives H317', () => {
    const r = classify([component('A', 1, [['Skin Sens. 1', 'H317']]), water(99)]);
    expect(find(r, 'skin_sensitisation')?.hCodes).toEqual(['H317']);
  });

  it('Skin Sens. 1 at 0.5 % is not classified but needs EUH208 (≥ 0.1 %)', () => {
    const r = classify([component('Limonen', 0.5, [['Skin Sens. 1', 'H317']]), water(99.5)]);
    expect(find(r, 'skin_sensitisation')).toBeUndefined();
    expect(r.label.supplemental).toEqual([
      expect.objectContaining({ code: 'EUH208', detail: 'Limonen' }),
    ]);
  });

  it('EUH208 with an SCL starts at one tenth of the SCL', () => {
    const r = classify([
      component('CMIT/MIT', 0.0002, [['Skin Sens. 1A', 'H317']], {
        specificConcentrationLimits: [{ category: 'Skin Sens. 1A', lowerLimit: 0.0015 }],
      }),
      water(99.9998),
    ]);
    expect(r.label.supplemental.map((s) => s.code)).toEqual(['EUH208']);
  });

  it('Resp. Sens. 1 ≥ 1 % gives H334 with GHS08 and DANGER', () => {
    const r = classify([component('A', 1, [['Resp. Sens. 1', 'H334']]), water(99)]);
    expect(r.label.hStatements).toEqual(['H334']);
    expect(r.label.signalWord).toBe('danger');
  });
});

describe('CMR (CLP Annex I Tables 3.5.2, 3.6.2, 3.7.2)', () => {
  it('Carc. 1B ≥ 0.1 % gives H350', () => {
    const r = classify([component('A', 0.1, [['Carc. 1B', 'H350']]), water(99.9)]);
    expect(find(r, 'carcinogenicity')?.hCodes).toEqual(['H350']);
  });

  it('Carc. 2 below 1 % is not classified', () => {
    const r = classify([component('A', 0.5, [['Carc. 2', 'H351']]), water(99.5)]);
    expect(find(r, 'carcinogenicity')).toBeUndefined();
  });

  it('keeps the component hazard statement variant (Repr. 1B H360FD ≥ 0.3 %)', () => {
    const r = classify([component('A', 0.3, [['Repr. 1B', 'H360FD']]), water(99.7)]);
    expect(find(r, 'reproductive_toxicity')?.hCodes).toEqual(['H360FD']);
  });

  it('Muta. 2 ≥ 1 % gives H341 and WARNING', () => {
    const r = classify([component('A', 1, [['Muta. 2', 'H341']]), water(99)]);
    expect(r.label.signalWord).toBe('warning');
  });
});

describe('STOT (CLP Annex I Tables 3.8.3 and 3.9.4)', () => {
  it('STOT SE 1 between 1 % and 10 % gives STOT SE 2 (H371)', () => {
    const r = classify([component('A', 5, [['STOT SE 1', 'H370']]), water(95)]);
    const se = find(r, 'stot_single');
    expect(se?.category).toBe('STOT SE 2');
    expect(se?.hCodes).toEqual(['H371']);
  });

  it('STOT RE 2 ≥ 10 % gives H373', () => {
    const r = classify([component('A', 10, [['STOT RE 2', 'H373']]), water(90)]);
    expect(find(r, 'stot_repeated')?.hCodes).toEqual(['H373']);
  });

  it('STOT SE 3 adds up per effect against 20 % (H335 and H336 kept apart)', () => {
    const r = classify([
      component('A', 12, [['STOT SE 3', 'H335']]),
      component('B', 10, [['STOT SE 3', 'H335']]),
      component('C', 15, [['STOT SE 3', 'H336']]),
      water(63),
    ]);
    const stot = r.classifications.filter((c) => c.hazardClass === 'stot_single');
    expect(stot.map((c) => c.hCodes)).toEqual([['H335']]);
  });
});
