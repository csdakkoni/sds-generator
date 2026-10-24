import { describe, expect, it } from 'vitest';
import { parseIdentity } from '../../../supabase/functions/_shared/pubchem/identity';

const synonyms = {
  InformationList: {
    Information: [
      { CID: 180, Synonym: ['acetone', '67-64-1', '2-Propanone', '200-662-2', 'Propan-2-one'] },
    ],
  },
};
const properties = {
  PropertyTable: {
    Properties: [
      { CID: 180, Title: 'Acetone', MolecularFormula: 'C3H6O', MolecularWeight: '58.08' },
    ],
  },
};

describe('parseIdentity', () => {
  it('reads name, EC number, formula and synonyms of the CAS number', () => {
    expect(parseIdentity('67-64-1', synonyms, properties)).toEqual({
      cid: 180,
      name: 'Acetone',
      synonyms: ['acetone', '2-Propanone', 'Propan-2-one'],
      ecNumber: '200-662-2',
      formula: 'C3H6O',
      molecularWeight: 58.08,
    });
  });
  it('rejects a record that does not list the CAS number', () => {
    expect(parseIdentity('64-17-5', synonyms, properties)).toBeNull();
  });
  it('still returns a name when the property answer is missing', () => {
    expect(parseIdentity('67-64-1', synonyms, {})?.name).toBe('acetone');
  });
});
