import { describe, expect, it } from 'vitest';
import { isValidCas } from './cas';

describe('isValidCas', () => {
  it('accepts numbers whose check digit matches', () => {
    expect(isValidCas('7732-18-5')).toBe(true); // water
    expect(isValidCas('67-64-1')).toBe(true); // acetone
    expect(isValidCas(' 64-17-5 ')).toBe(true); // ethanol
  });
  it('rejects a wrong check digit or shape', () => {
    expect(isValidCas('7732-18-4')).toBe(false);
    expect(isValidCas('67-64')).toBe(false);
    expect(isValidCas('abc')).toBe(false);
  });
});
