/**
 * Shapes one SEA Annex 6 row into a harmonised classification profile (pending review).
 * The raw table values are kept verbatim in source_snapshot. They are not turned into
 * hazard class lines here: that needs KDU review first (CLAUDE.md rule 3).
 */

export const EK6_REGULATION = 'SEA Yönetmeliği Ek-6';

export interface Ek6Row {
  list_no: string;
  classification_text?: string | null;
  classification_h?: string[];
  label_pictograms?: string[];
  signal_word?: string | null;
  label_h?: string[];
  euh?: string[];
  note?: string | null;
  scl_m_text?: string | null;
  ec_list?: string[];
  cas_list?: string[];
}

/** Gazette facts read from the Word file's own header: "(Değişik:RG-10/12/2020-31330 Mükerrer)". */
export const EK6_VERSION = {
  jurisdiction: 'TR',
  regulation: EK6_REGULATION,
  title: 'SEA Yönetmeliği Ek-6 (10/12/2020 tarihli değişiklikle yürürlükteki tablo)',
  source_document: 'mevzuat.gov.tr, 7.5.19108-Ek.doc',
  gazette_date: '2020-12-10',
  gazette_number: '31330 (Mükerrer)',
  status: 'draft',
} as const;

export function buildProfile(row: Ek6Row, substanceId: string, versionId: string) {
  return {
    substance_id: substanceId,
    organization_id: null,
    source_type: 'harmonised' as const,
    classification_system: 'clp' as const,
    jurisdiction: 'TR',
    regulation: EK6_REGULATION,
    regulation_version_id: versionId,
    source_reference: `Ek-6 liste no ${row.list_no}`,
    data_license: 'official_public' as const,
    verification_status: 'pending' as const,
    source_snapshot: {
      list_no: row.list_no,
      classification_text: row.classification_text ?? null,
      classification_h: row.classification_h ?? [],
      label_pictograms: row.label_pictograms ?? [],
      signal_word: row.signal_word ?? null,
      label_h: row.label_h ?? [],
      euh: row.euh ?? [],
      note: row.note ?? null,
      scl_m_text: row.scl_m_text ?? null,
      ec_list: row.ec_list ?? [],
      cas_list: row.cas_list ?? [],
    },
  };
}
