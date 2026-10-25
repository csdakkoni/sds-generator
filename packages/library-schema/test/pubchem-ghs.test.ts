import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EXCLUDED_FAMILIES,
  familyOf,
  parseGhs,
  type PugView,
} from '../../../supabase/functions/_shared/pubchem/ghs';

const text = (...s: string[]) => ({ StringWithMarkup: s.map((String) => ({ String })) });

// Shape of PUG-View "GHS Classification" (Safety and Hazards > Hazards Identification).
const ghs: PugView = {
  Record: {
    Section: [
      {
        TOCHeading: 'Safety and Hazards',
        Section: [
          {
            TOCHeading: 'Hazards Identification',
            Section: [
              {
                TOCHeading: 'GHS Classification',
                Information: [
                  { ReferenceNumber: 1, Name: 'Signal', Value: text('Danger') },
                  {
                    ReferenceNumber: 1,
                    Name: 'GHS Hazard Statements',
                    Value: text(
                      'H225 (100%): Highly Flammable liquid and vapor [Danger Flammable liquids]',
                      'H319 (100%): Causes serious eye irritation [Warning Serious eye damage/eye irritation]',
                    ),
                  },
                  {
                    ReferenceNumber: 2,
                    Name: 'GHS Hazard Statements',
                    Value: text(
                      'H225: Highly flammable liquid and vapour',
                      'H300+H310: Fatal if swallowed or in contact with skin',
                      'Something unexpected',
                    ),
                  },
                  {
                    ReferenceNumber: 3,
                    Name: 'GHS Hazard Statements',
                    Value: text('Not Classified'),
                  },
                ],
              },
              {
                TOCHeading: 'Hazard Classes and Categories',
                Information: [{ ReferenceNumber: 2, Value: text('Acute Tox. 2') }],
              },
            ],
          },
        ],
      },
    ],
    Reference: [
      { ReferenceNumber: 1, SourceName: 'European Chemicals Agency (ECHA)', URL: 'https://echa' },
      {
        ReferenceNumber: 2,
        SourceName: 'NITE-CHRIP',
        URL: 'https://nite',
        LicenseNote: 'terms',
        LicenseURL: 'https://nite/terms',
      },
      { ReferenceNumber: 3, SourceName: 'New Zealand EPA (CCID)' },
    ],
  },
};

describe('parseGhs', () => {
  const sources = parseGhs(ghs);
  const nite = sources.find((s) => s.family === 'jp_nite');

  it('groups items by source and keeps each statement code as listed', () => {
    expect(sources.map((s) => s.family)).toEqual(['echa_notifications', 'jp_nite', 'nz_epa']);
    expect(nite?.statements.map((s) => s.hCode)).toEqual(['H225', 'H300+H310']);
    expect(nite?.categoryTexts).toEqual(['Acute Tox. 2']);
    expect(nite?.licenseUrl).toBe('https://nite/terms');
  });

  it('keeps items it cannot read for the KDU instead of guessing', () => {
    expect(nite?.unreadable).toEqual(['Something unexpected']);
  });

  it('records a "not classified" answer as such, not as missing data', () => {
    const nz = sources.find((s) => s.family === 'nz_epa');
    expect(nz?.notClassified).toBe(true);
    expect(nz?.statements).toEqual([]);
  });

  it('excludes ECHA notification aggregates (decision 2026-10-19)', () => {
    expect(EXCLUDED_FAMILIES.has(familyOf('European Chemicals Agency (ECHA)'))).toBe(true);
  });
});

describe('real PubChem data (acetone, 2026-10-24)', () => {
  const acetone = JSON.parse(
    readFileSync(new URL('./fixtures/pubchem-acetone.json', import.meta.url), 'utf8'),
  ) as PugView;
  const sources = parseGhs(acetone);
  const by = (family: string) => sources.find((s) => s.family === family);
  const codes = (family: string) => by(family)?.statements.map((s) => s.hCode);

  it('groups the reports by source and reads each statement code', () => {
    expect(sources.map((s) => s.family).sort()).toEqual([
      'au_hcis',
      'eu_clp_regulation',
      'jp_nite',
      'other:hazardous-substances-data-bank-hsdb',
    ]);
    expect(codes('au_hcis')).toEqual(['H225', 'H319', 'H336']);
    expect(by('au_hcis')?.categoryTexts).toContain('Eye irritation - category 2A');
    expect(by('other:hazardous-substances-data-bank-hsdb')?.categoryTexts).toEqual([]);
  });

  it('keeps every report of a source that published several, and their union', () => {
    const nite = by('jp_nite');
    expect(codes('jp_nite')).toEqual([
      'H225',
      'H320',
      'H335',
      'H336',
      'H361',
      'H372',
      'H305',
      'H373',
    ]);
    expect(nite?.reports.map((r) => [r.name, r.order])).toEqual([
      ['Acetone - FY2014 (Revised classification)', 2014],
      ['Acetone - FY2006 (New/original classication)', 2006],
    ]);
    expect(nite?.reports[0]?.hCodes).toEqual(['H225', 'H320', 'H335', 'H336', 'H361', 'H372']);
    expect(by('au_hcis')?.reports).toEqual([]);
  });

  it('leaves out the copy of the EU CLP table and the ECHA aggregate', () => {
    expect(EXCLUDED_FAMILIES.has('eu_clp_regulation')).toBe(true);
    expect(EXCLUDED_FAMILIES.has('echa_notifications')).toBe(true);
    expect(
      familyOf('Regulation (EC) No 1272/2008 of the European Parliament and of the Council'),
    ).toBe('eu_clp_regulation');
  });
});
