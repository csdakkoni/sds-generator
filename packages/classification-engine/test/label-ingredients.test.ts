import { describe, expect, it } from 'vitest';
import { classifyMixture, labelIngredients, type MixtureInput } from '../src/index';
import { component, NEUTRAL, water } from './helpers';

const run = (input: MixtureInput) => labelIngredients(input, classifyMixture(input));

// CLP Art. 18(3)(b): substances responsible for acute toxicity, skin corrosion or serious eye
// damage, CMR, sensitisation, STOT or aspiration classification are named on the label.
describe('labelIngredients (CLP Art. 18(3)(b))', () => {
  it('names the Eye Dam. 1 component of an Eye Dam. 1 mixture', () => {
    const input = {
      components: [component('Yüzey aktif A', 10, [['Eye Dam. 1', 'H318']]), water(90)],
      measurements: NEUTRAL,
    };
    const named = run(input);
    expect(named.map((n) => n.name)).toEqual(['Yüzey aktif A']);
    expect(named[0]?.hazardClasses).toEqual(['eye_damage_irritation']);
    expect(named[0]?.trace.reference).toMatch(/18\(3\)\(b\)/);
  });

  it('names nobody when the mixture is only an irritant (irritation is not a named class)', () => {
    const input = {
      components: [component('Yüzey aktif A', 2, [['Eye Dam. 1', 'H318']]), water(98)],
      measurements: NEUTRAL,
    };
    // 2 % Eye Dam. 1 (1–3 %) gives Eye Irrit. 2 (CLP Table 3.3.3), which Art. 18(3)(b) does not name.
    expect(run(input)).toEqual([]);
  });

  it('counts a Skin Corr. 1 component towards a serious eye damage classification', () => {
    const input = {
      components: [component('Asit B', 4, [['Skin Corr. 1B', 'H314']]), water(96)],
      measurements: NEUTRAL,
    };
    // 4 % Skin Corr. 1: Skin Irrit. 2 (not named) and Eye Dam. 1 (named), CLP Tables 3.2.3, 3.3.3.
    const named = run(input);
    expect(named.map((n) => n.name)).toEqual(['Asit B']);
    expect(named[0]?.hazardClasses).toEqual(['eye_damage_irritation']);
  });

  it('leaves out components whose classes the mixture does not carry', () => {
    const input = {
      components: [
        component('Duyarlaştırıcı C', 2, [['Skin Sens. 1', 'H317']]),
        component('Çevre D', 1, [['Aquatic Chronic 3', 'H412']]),
        water(97),
      ],
      measurements: NEUTRAL,
    };
    const named = run(input);
    expect(named.map((n) => n.name)).toEqual(['Duyarlaştırıcı C']);
    expect(named[0]?.hazardClasses).toEqual(['skin_sensitisation']);
  });
});
