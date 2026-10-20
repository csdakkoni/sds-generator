import { describe, expect, it } from 'vitest';
import { classifyMixture, type ComponentInput } from '../src/index';
import { component, NEUTRAL, water } from './helpers';

const ek6 = (...lines: [string, string][]) => ({
  reference: 'SEA Ek-6',
  classifications: lines.map(([category, hCode]) => ({ category, hCode })),
});

function run(c: ComponentInput) {
  return classifyMixture({ components: [c, water([0, 100])], measurements: NEUTRAL });
}

describe('harmonised classification as a floor (SEA Ek-6, CLP Art. 4(3))', () => {
  it('adds a class the supplier SDS leaves out and reports it for the KDU', () => {
    const c = component('Madde', 50, [['Skin Irrit. 2', 'H315']], {
      harmonised: ek6(['Eye Dam. 1', 'H318']),
    });
    const result = run(c);
    expect(result.classifications.some((x) => x.category === 'Eye Dam. 1')).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain('HARMONISED_ADDED');
  });

  it('raises a lighter supplier category to the harmonised one, never the other way', () => {
    const lighter = run(
      component('Madde', 50, [['Eye Irrit. 2', 'H319']], {
        harmonised: ek6(['Eye Dam. 1', 'H318']),
      }),
    );
    expect(lighter.classifications.some((x) => x.category === 'Eye Dam. 1')).toBe(true);
    expect(lighter.warnings.map((w) => w.code)).toContain('HARMONISED_RAISED');

    const stricter = run(
      component('Madde', 50, [['Eye Dam. 1', 'H318']], {
        harmonised: ek6(['Eye Irrit. 2', 'H319']),
      }),
    );
    expect(stricter.classifications.some((x) => x.category === 'Eye Dam. 1')).toBe(true);
    expect(stricter.warnings.map((w) => w.code)).toContain('HARMONISED_STRICTER_SUPPLIER');
  });

  it('keeps acute toxicity of different routes apart', () => {
    const result = run(
      component('Madde', 50, [['Acute Tox. 4', 'H302']], {
        harmonised: ek6(['Acute Tox. 3', 'H311']),
      }),
    );
    // Oral stays at the supplier's category 4; dermal is added from Annex 6.
    expect(result.warnings.map((w) => w.code)).toContain('HARMONISED_ADDED');
    expect(result.warnings.map((w) => w.code)).not.toContain('HARMONISED_RAISED');
  });

  it('without supplier data it uses Annex 6 but cannot finalise (missing data is not "no hazard")', () => {
    const c: ComponentInput = {
      id: 'x',
      name: 'Madde',
      concentration: { min: 50, max: 50 },
      hazardData: 'unknown',
      classifications: [],
      harmonised: ek6(['Eye Dam. 1', 'H318']),
    };
    const result = run(c);
    expect(result.classifications.some((x) => x.category === 'Eye Dam. 1')).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain('HARMONISED_ONLY');
    expect(result.canFinalize).toBe(false);
  });

  it('does nothing for a component without a harmonised entry', () => {
    const result = run(component('Madde', 50, [['Eye Irrit. 2', 'H319']]));
    expect(result.warnings.some((w) => w.code.startsWith('HARMONISED'))).toBe(false);
  });
});
