import { describe, expect, it } from 'vitest';
import {
  inventoryName,
  PUG,
  resolveCas,
  type Fetcher,
} from '../../../supabase/functions/_shared/pubchem/resolve';

/** A fake PubChem: answers the listed URLs, 404 (null) for everything else. */
const fake =
  (answers: Record<string, unknown>): Fetcher =>
  async (url) =>
    answers[url] ?? null;

const CAS = '69011-36-5';
const syn = (cids: { CID?: number; SID?: number; Synonym: string[] }[]) => ({
  InformationList: { Information: cids },
});
const props = (rows: { CID: number; Title: string }[]) => ({
  PropertyTable: { Properties: rows },
});

describe('inventoryName', () => {
  it('takes the inventory-style name and skips trade names', () => {
    expect(
      inventoryName([
        'Lutensol TO 10',
        'Genapol X 100',
        'Alcohols, C13-iso-, ethoxylated',
        'Poly(oxy-1,2-ethanediyl), .alpha.-isotridecyl-.omega.-hydroxy-',
      ]),
    ).toBe('Alcohols, C13-iso-, ethoxylated');
  });
  it('gives no name when only trade names are listed', () => {
    expect(inventoryName(['Lutensol TO 10®', 'Emulan TO 40', '69011-36-5'])).toBeNull();
  });
  it('falls back to the encoded spelling when it is the only inventory name', () => {
    expect(inventoryName(['Poly(oxy-1,2-ethanediyl), .alpha.-tridecyl-.omega.-hydroxy-'])).toBe(
      'Poly(oxy-1,2-ethanediyl), .alpha.-tridecyl-.omega.-hydroxy-',
    );
  });
});

describe('resolveCas', () => {
  it('uses the name search when it lists the number', async () => {
    const r = await resolveCas(
      '67-64-1',
      fake({
        [`${PUG}/compound/name/67-64-1/synonyms/JSON`]: syn([
          { CID: 180, Synonym: ['acetone', '67-64-1'] },
        ]),
        [`${PUG}/compound/name/67-64-1/property/Title,MolecularFormula,MolecularWeight/JSON`]:
          props([{ CID: 180, Title: 'Acetone' }]),
      }),
    );
    expect(r.identity?.name).toBe('Acetone');
    expect(r.cids).toEqual([180]);
  });

  it('falls back to the registry cross-reference when the name search finds nothing', async () => {
    const r = await resolveCas(
      CAS,
      fake({
        [`${PUG}/compound/xref/RegistryID/${CAS}/cids/JSON`]: {
          IdentifierList: { CID: [111, 222] },
        },
        [`${PUG}/compound/cid/111,222/synonyms/JSON`]: syn([
          { CID: 111, Synonym: ['Alcohols, C13-iso-, ethoxylated', '500-241-6'] },
          { CID: 222, Synonym: ['other'] },
        ]),
        [`${PUG}/compound/cid/111,222/property/Title,MolecularFormula,MolecularWeight/JSON`]: props(
          [{ CID: 111, Title: 'Isotridecanol, ethoxylated' }],
        ),
      }),
    );
    expect(r.identity?.name).toBe('Isotridecanol, ethoxylated');
    expect(r.identity?.ecNumber).toBe('500-241-6');
    expect(r.cids).toEqual([111, 222]);
  });

  it('reaches compounds through depositor substance records', async () => {
    const r = await resolveCas(
      CAS,
      fake({
        [`${PUG}/substance/name/${CAS}/synonyms/JSON`]: syn([
          { SID: 9, Synonym: [CAS, 'Lutensol TO 10', 'Alcohols, C13-iso-, ethoxylated'] },
          { SID: 10, Synonym: ['unrelated'] },
        ]),
        [`${PUG}/substance/sid/9/cids/JSON?cids_type=all`]: {
          InformationList: { Information: [{ SID: 9, CID: [333] }] },
        },
        [`${PUG}/compound/cid/333/synonyms/JSON`]: syn([{ CID: 333, Synonym: ['x'] }]),
        [`${PUG}/compound/cid/333/property/Title,MolecularFormula,MolecularWeight/JSON`]: props([
          { CID: 333, Title: 'Tridecanol ethoxylate' },
        ]),
      }),
    );
    expect(r.identity?.cid).toBe(333);
    expect(r.substanceName).toBe('Alcohols, C13-iso-, ethoxylated');
    expect(r.cids).toEqual([333]);
  });

  it('keeps an inventory name when substance records have no compound', async () => {
    const r = await resolveCas(
      CAS,
      fake({
        [`${PUG}/substance/name/${CAS}/synonyms/JSON`]: syn([
          { SID: 9, Synonym: [CAS, 'Alcohols, C13-iso-, ethoxylated'] },
        ]),
      }),
    );
    expect(r.identity).toBeNull();
    expect(r.cids).toEqual([]);
    expect(r.substanceName).toBe('Alcohols, C13-iso-, ethoxylated');
  });

  it('reports a failing step instead of hiding it', async () => {
    const r = await resolveCas(CAS, async () => {
      throw new Error('PubChem 503');
    });
    expect(r.identity).toBeNull();
    expect(r.errors[0]).toBe('PubChem 503');
  });

  it('finds nothing for a number PubChem does not know', async () => {
    const r = await resolveCas('50-00-0', fake({}));
    expect(r).toMatchObject({ identity: null, cids: [], substanceName: null, errors: [] });
  });
});
