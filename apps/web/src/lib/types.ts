/** Rows and extraction fields the screens read. The full extraction schema lives in
 * scripts/extract-supplier-sds/src/schema.ts. */

export type MemberRole = 'owner' | 'editor' | 'kdu' | 'viewer';

export interface Membership {
  organization_id: string;
  role: MemberRole;
  extra_roles: MemberRole[];
  organizations: { name: string } | null;
}

export interface SourceRef {
  page: number;
  quote: string;
}

export interface Sourced<T> {
  status: 'found' | 'not_stated';
  value: T | null;
  source: SourceRef | null;
}

export interface ClassificationLine {
  hazardClassAsWritten: string;
  category: string | null;
  hCode: string | null;
  source: SourceRef;
}

export interface FlagResolution {
  status: 'accepted' | 'needs_fix';
  note: string | null;
  by: string;
  at: string;
}

export interface Flag {
  field: string;
  kind: 'ambiguous' | 'conflict' | 'unreadable' | 'missing_expected' | 'other';
  message: string;
  page: number | null;
  resolution?: FlagResolution;
}

export interface Extraction {
  identity: {
    tradeName: Sourced<string>;
    supplier: Sourced<string>;
    revisionDate: Sourced<string>;
    revisionNumber: Sourced<string>;
  };
  productClassification: {
    status: 'classified' | 'not_classified' | 'not_stated';
    lines: ClassificationLine[];
  };
  components: {
    name: Sourced<string>;
    cas: Sourced<string>;
    concentration: {
      min: number | null;
      max: number | null;
      raw: string;
      source: SourceRef;
    } | null;
    classifications: ClassificationLine[];
  }[];
  physicalProperties: {
    property: string;
    nameAsWritten: string;
    value: string | null;
    source: SourceRef;
  }[];
}

export type ExtractionStatus = 'queued' | 'running' | 'done' | 'failed';

export interface SdsDocument {
  id: string;
  organization_id: string;
  raw_material_id: string;
  storage_path: string;
  file_name: string;
  revision_number: string | null;
  revision_date: string | null;
  extraction: Extraction | null;
  flags: Flag[];
  status: 'pending_review' | 'approved' | 'rejected';
  extraction_status: ExtractionStatus;
  extraction_error: string | null;
  approved_by: string | null;
  approved_at: string | null;
  uploaded_at: string;
}

export interface RawMaterial {
  id: string;
  trade_name: string;
  supplier_name: string | null;
  raw_material_sds_documents: Pick<
    SdsDocument,
    | 'id'
    | 'status'
    | 'extraction_status'
    | 'flags'
    | 'uploaded_at'
    | 'revision_number'
    | 'revision_date'
  >[];
}
