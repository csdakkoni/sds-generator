import { describe, expect, it } from 'vitest';
import { classify, component, find, warningCodes, water } from './helpers';

describe('acute toxicity (CLP Annex I 3.1.3.6, Tables 3.1.1 and 3.1.2)', () => {
  it('uses the ATE mixture formula: 50 % of ATE 500 mg/kg gives ATEmix 1000 → Acute Tox. 4 (H302)', () => {
    const r = classify([
      component('A', 50, [['Acute Tox. 4', 'H302']], { ate: { oral: 500 } }),
      water(50),
    ]);
    expect(r.ate.find((a) => a.route === 'oral')?.upper).toBeCloseTo(1000);
    expect(find(r, 'acute_toxicity_oral')?.hCodes).toEqual(['H302']);
  });

  it('uses the converted ATE of Table 3.1.2 when no ATE is given (Acute Tox. 3 oral → 100 mg/kg)', () => {
    const r = classify([component('A', 20, [['Acute Tox. 3', 'H301']]), water(80)]);
    expect(r.ate.find((a) => a.route === 'oral')?.upper).toBeCloseTo(500);
    expect(find(r, 'acute_toxicity_oral')?.category).toBe('Acute Tox. 4');
  });

  it('reaches category 3 at ATEmix ≤ 300 mg/kg', () => {
    const r = classify([
      component('A', 40, [['Acute Tox. 3', 'H301']], { ate: { oral: 100 } }),
      water(60),
    ]);
    expect(find(r, 'acute_toxicity_oral')?.category).toBe('Acute Tox. 3');
    expect(r.label.pictograms).toEqual(['GHS06']);
  });

  it('corrects the formula when unknown ingredients exceed 10 % (3.1.3.6.2.3)', () => {
    const r = classify([
      component('A', 10, [['Acute Tox. 3', 'H301']], { ate: { oral: 100 } }),
      component('Bilinmeyen', 20, [], { hazardData: 'unknown' }),
      water(70),
    ]);
    // (100 − 20) / ATEmix = 10 / 100 → ATEmix = 800
    expect(r.ate.find((a) => a.route === 'oral')?.upper).toBeCloseTo(800);
    expect(warningCodes(r)).toContain('ACUTE_TOX_UNKNOWN_INGREDIENTS');
  });

  it('handles each route separately', () => {
    const r = classify([component('A', 60, [['Acute Tox. 4', 'H312']]), water(40)]);
    expect(find(r, 'acute_toxicity_dermal')?.hCodes).toEqual(['H312']);
    expect(find(r, 'acute_toxicity_oral')).toBeUndefined();
  });

  it('blocks when an inhalation-toxic ingredient has no physical form', () => {
    const r = classify([component('A', 10, [['Acute Tox. 3', 'H331']]), water(90)]);
    expect(r.warnings.find((w) => w.code === 'ACUTE_TOX_INHALATION_FORM_MISSING')?.severity).toBe(
      'blocking',
    );
  });

  it('computes inhalation ATE for vapours (Acute Tox. 3 vapour → 3 mg/l)', () => {
    const r = classify([
      component('A', 50, [['Acute Tox. 3', 'H331']], { inhalationForm: 'vapour' }),
      water(50),
    ]);
    expect(r.ate.find((a) => a.route === 'inhalation')?.upper).toBeCloseTo(6);
    expect(find(r, 'acute_toxicity_inhalation')?.category).toBe('Acute Tox. 3');
  });
});
