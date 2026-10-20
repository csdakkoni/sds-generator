import { describe, expect, it } from 'vitest';
import { buildProfile, EK6_VERSION } from '../../../supabase/functions/_shared/ek6/profile';

const row = {
  list_no: '003-002-00-X',
  classification_text: 'Su-tepk. 1 Piro. Katı 1 Cilt Aşnd. 1A',
  classification_h: ['H260', 'H250', 'H314'],
  euh: ['EUH014'],
};

describe('buildProfile', () => {
  it('makes a pending, global, harmonised profile bound to the version', () => {
    const p = buildProfile(row, 'sub-1', 'ver-1');
    expect(p).toMatchObject({
      source_type: 'harmonised',
      organization_id: null,
      verification_status: 'pending',
      data_license: 'official_public',
      regulation_version_id: 'ver-1',
      source_reference: 'Ek-6 liste no 003-002-00-X',
    });
  });

  it('keeps the raw row values verbatim and never fills missing ones', () => {
    const snapshot = buildProfile(row, 'sub-1', 'ver-1').source_snapshot;
    expect(snapshot.classification_h).toEqual(['H260', 'H250', 'H314']);
    expect(snapshot.note).toBeNull();
    expect(snapshot.label_pictograms).toEqual([]);
  });

  it('records the gazette facts read from the source file header', () => {
    expect(EK6_VERSION.gazette_date).toBe('2020-12-10');
    expect(EK6_VERSION.gazette_number).toContain('31330');
  });
});
