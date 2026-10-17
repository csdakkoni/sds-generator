// The seven cases required by the step 2 brief (docs/baslangic-promptlari.md).
import { describe, expect, it } from 'vitest';
import { categories, classify, component, find, NEUTRAL, warningCodes, water } from './helpers';

describe('required cases', () => {
  it('Eye Dam. 1 at 10–20 % with pH 7 gives H318, GHS05, DANGER; pH does not change it (CLP Table 3.3.3)', () => {
    const recipe = [
      component('Yüzey aktif madde', [10, 20], [['Eye Dam. 1', 'H318']]),
      water([80, 90]),
    ];
    const withPh = classify(recipe, { ...NEUTRAL, pH: 7 });
    const withoutPh = classify(recipe);

    expect(withPh.label.hStatements).toEqual(['H318']);
    expect(withPh.label.pictograms).toEqual(['GHS05']);
    expect(withPh.label.signalWord).toBe('danger');
    const eye = find(withPh, 'eye_damage_irritation');
    expect(eye?.trace[0]?.message).toContain('Eye Dam. 1 bileşenlerin toplamı %10–20 ≥ %3');
    expect(eye?.trace[0]?.reference).toBe('CLP Ek I Tablo 3.3.3');
    expect(withPh.classifications).toEqual(withoutPh.classifications);
    expect(withPh.label).toEqual(withoutPh.label);
  });

  it('STOT RE 1 component at ≥ 10 % gives H372 and DANGER (CLP Table 3.9.4)', () => {
    const result = classify([component('Madde A', 10, [['STOT RE 1', 'H372']]), water(90)]);
    expect(find(result, 'stot_repeated')?.category).toBe('STOT RE 1');
    expect(result.label.hStatements).toContain('H372');
    expect(result.label.signalWord).toBe('danger');
    expect(result.label.pictograms).toEqual(['GHS08']);
  });

  it('CMIT/MIT 0.002 % with SCL Skin Sens. 1A ≥ 0.0015 % gives H317 (CLP Table 3.4.5, SCL)', () => {
    const cmitMit = component('CMIT/MIT (3:1)', 0.002, [['Skin Sens. 1A', 'H317']], {
      specificConcentrationLimits: [{ category: 'Skin Sens. 1A', lowerLimit: 0.0015 }],
    });
    const result = classify([cmitMit, water(99.998)]);
    const sens = find(result, 'skin_sensitisation');
    expect(sens?.category).toBe('Skin Sens. 1A');
    expect(result.label.hStatements).toEqual(['H317']);
    expect(sens?.trace[0]?.message).toContain('SCL %0,0015');
  });

  it('NaOH 2.5 % with SCL Skin Corr. 1B 2–5 % gives H314 (CLP Table 3.2.3, SCL)', () => {
    const naoh = component(
      'Sodyum hidroksit',
      2.5,
      [
        ['Skin Corr. 1A', 'H314'],
        ['Met. Corr. 1', 'H290'],
      ],
      {
        specificConcentrationLimits: [
          { category: 'Skin Corr. 1A', lowerLimit: 5 },
          { category: 'Skin Corr. 1B', lowerLimit: 2, upperLimit: 5 },
          { category: 'Skin Irrit. 2', lowerLimit: 0.5, upperLimit: 2 },
          { category: 'Eye Irrit. 2', lowerLimit: 0.5, upperLimit: 2 },
        ],
      },
    );
    const result = classify([naoh, water(97.5)]);
    expect(find(result, 'skin_corrosion_irritation')?.category).toBe('Skin Corr. 1B');
    expect(result.label.hStatements).toEqual(['H314']);
    expect(result.label.pictograms).toEqual(['GHS05']);
    expect(result.label.signalWord).toBe('danger');
  });

  it('Aquatic Acute 1 component, M = 100, at 0.3 % triggers aquatic classification (CLP Table 4.1.1)', () => {
    const biocide = component('Biyosit', 0.3, [['Aquatic Acute 1', 'H400']], {
      mFactors: { acute: 100 },
    });
    const result = classify([biocide, water(99.7)]);
    const acute = find(result, 'aquatic_acute');
    expect(acute?.category).toBe('Aquatic Acute 1');
    expect(acute?.trace[0]?.message).toContain('Σ(Acute 1 × M) = %30 ≥ %25');
    expect(result.label.hStatements).toEqual(['H400']);
  });

  it('flammable component without a measured flash point: warning, no H22x', () => {
    const result = classify([component('Etanol', 20, [['Flam. Liq. 2', 'H225']]), water(80)], {
      physicalState: 'liquid',
      metalCorrosion: 'negative',
    });
    expect(result.label.hStatements.filter((h) => h.startsWith('H22'))).toEqual([]);
    expect(result.classStatus.flammable_liquid).toBe('undetermined');
    expect(result.warnings.find((w) => w.code === 'FLASH_POINT_MISSING')?.severity).toBe(
      'blocking',
    );
    expect(result.canFinalize).toBe(false);
  });

  it('missing ATE data gives a warning, not a "no hazard" result (CLP Annex I 3.1.3.6)', () => {
    const result = classify([
      component('Bilinmeyen hammadde', 15, [], { hazardData: 'unknown' }),
      water(85),
    ]);
    expect(categories(result)).toEqual([]);
    expect(result.classStatus.acute_toxicity_oral).toBe('undetermined');
    expect(warningCodes(result)).toContain('ACUTE_TOX_UNKNOWN_INGREDIENTS');
    expect(warningCodes(result)).toContain('COMPONENT_DATA_UNKNOWN');
    expect(result.canFinalize).toBe(false);
  });
});
