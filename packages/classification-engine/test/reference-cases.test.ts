// Runs every KDU-verified case in tests/reference-cases. An engine change is not complete
// until all of them pass.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyMixture, type MixtureInput } from '../src/index';

interface ReferenceCase {
  name: string;
  verifiedBy: string;
  verifiedAt: string;
  input: MixtureInput;
  expected: {
    hStatements: string[];
    pictograms: string[];
    signalWord: 'danger' | 'warning' | null;
  };
}

const dir = join(import.meta.dirname, '../../../tests/reference-cases');
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
const cases = files.map((f) => ({
  file: f,
  data: JSON.parse(readFileSync(join(dir, f), 'utf8')) as ReferenceCase,
}));

describe('KDU reference cases', () => {
  it('every case file is complete', () => {
    for (const { file, data } of cases) {
      expect(data.verifiedBy, file).toBeTruthy();
      expect(data.verifiedAt, file).toBeTruthy();
      expect(data.expected, file).toBeDefined();
    }
  });

  for (const { file, data } of cases) {
    it(`${file}: ${data.name}`, () => {
      const result = classifyMixture(data.input);
      expect(result.label.hStatements).toEqual([...data.expected.hStatements].sort());
      expect(result.label.pictograms).toEqual([...data.expected.pictograms].sort());
      expect(result.label.signalWord).toBe(data.expected.signalWord);
    });
  }
});
