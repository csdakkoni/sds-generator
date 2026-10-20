import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseClassification,
  type Ek6ClassificationRow,
} from '../../../supabase/functions/_shared/ek6/lines';

describe('parseClassification', () => {
  it('splits a row and takes each code from the row H list (CLP table 3.1.3 routes)', () => {
    const r = parseClassification({
      list_no: '004-001-00-7',
      classification_text:
        'Kans. 1B Akut Tok. 2 Akut Tok. 3 BHOT Tekrar.Mrz. 1 Göz Tah. 2 BHOT Tek Mrz. 3 Cilt Tah. 2 Cilt Hassas. 1',
      classification_h: ['H350i', 'H330', 'H301', 'H372', 'H319', 'H335', 'H315', 'H317'],
    });
    expect(r).toEqual({
      ok: true,
      lines: [
        { hazard_class: 'carcinogenicity', category: 'Carc. 1B', h_code: 'H350i' },
        { hazard_class: 'acute_toxicity', category: 'Acute Tox. 2', h_code: 'H330' },
        { hazard_class: 'acute_toxicity', category: 'Acute Tox. 3', h_code: 'H301' },
        { hazard_class: 'stot_repeated', category: 'STOT RE 1', h_code: 'H372' },
        { hazard_class: 'eye_damage_irritation', category: 'Eye Irrit. 2', h_code: 'H319' },
        { hazard_class: 'stot_single', category: 'STOT SE 3', h_code: 'H335' },
        { hazard_class: 'skin_corrosion_irritation', category: 'Skin Irrit. 2', h_code: 'H315' },
        { hazard_class: 'skin_sensitisation', category: 'Skin Sens. 1', h_code: 'H317' },
      ],
    });
  });

  it('keeps pressurised gas without a hazard statement (the row does not carry one)', () => {
    const r = parseClassification({
      list_no: '001-001-00-9',
      classification_text: 'Alev.Gaz 1 Basınç Gaz',
      classification_h: ['H220'],
    });
    expect(r).toEqual({
      ok: true,
      lines: [
        { hazard_class: 'flammable_gas', category: 'Flam. Gas 1', h_code: 'H220' },
        { hazard_class: 'pressurised_gas', category: 'Press. Gas', h_code: null },
      ],
    });
  });

  it('refuses a row whose statements do not match its classes instead of guessing', () => {
    const r = parseClassification({
      list_no: 'x',
      classification_text: 'Cilt Aşnd. 1A',
      classification_h: ['H314', 'H318'],
    });
    expect(r.ok).toBe(false);
  });

  it('refuses an unknown abbreviation', () => {
    expect(
      parseClassification({ list_no: 'x', classification_text: 'Zzz. 1', classification_h: [] }).ok,
    ).toBe(false);
  });
});

describe('the whole Annex 6 table', () => {
  const file = join(__dirname, '../../../apps/web/public/ek6/sea-ek6-substances.json');
  const rows = (JSON.parse(readFileSync(file, 'utf8')) as { entries: Ek6ClassificationRow[] })
    .entries;

  it('splits almost every row; the rest is left for the KDU, never guessed', () => {
    const results = rows.map((r) => parseClassification(r));
    const parsed = results.filter((p) => p.ok).length;
    expect(results.length).toBe(rows.length);
    // 4178 of 4258 at the time of writing; the rest are explosives divisions and typos in the table.
    expect(parsed).toBeGreaterThanOrEqual(4170);
  });
});
