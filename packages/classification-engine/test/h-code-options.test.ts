import { describe, expect, it } from 'vitest';
import { hCodeOptions } from '../src';

describe('hazard statement options per category (CLP Annex I tables)', () => {
  it('a category with one statement has exactly that statement (CLP Table 3.3.5)', () => {
    expect(hCodeOptions('Eye Dam. 1')).toEqual(['H318']);
    expect(hCodeOptions('Skin Corr. 1B')).toEqual(['H314']);
  });

  it('acute toxicity depends on the route (CLP Table 3.1.3)', () => {
    expect(hCodeOptions('Acute Tox. 2')).toEqual(['H300', 'H310', 'H330']);
    expect(hCodeOptions('Acute Tox. 4')).toEqual(['H302', 'H312', 'H332']);
  });

  it('STOT SE 3 is either respiratory irritation or narcotic effects (CLP Table 3.8.4)', () => {
    expect(hCodeOptions('STOT SE 3')).toEqual(['H335', 'H336']);
  });
});
