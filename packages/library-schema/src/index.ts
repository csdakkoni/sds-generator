/**
 * Types for the substance library (identity, classification profiles, regulation versions,
 * monitoring and the KDU review queue). They mirror
 * supabase/migrations/20261019020000_library_profiles.sql; a test keeps the enum values in sync.
 * This package holds data shapes only. Classification itself lives in the engine.
 */

export const PROFILE_SOURCE_TYPES = [
  'harmonised',
  'industry_guidance',
  'expert_rule',
  'shared_pool',
  'supplier_sds',
  'research_note',
] as const;
export type ProfileSourceType = (typeof PROFILE_SOURCE_TYPES)[number];

export const CLASSIFICATION_SYSTEMS = ['clp', 'un_ghs'] as const;
export type ClassificationSystem = (typeof CLASSIFICATION_SYSTEMS)[number];

export const VERIFICATION_STATUSES = ['pending', 'verified', 'rejected', 'superseded'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const DATA_LICENSES = [
  'official_public',
  'unverified',
  'firm_owned',
  'kdu_authored',
] as const;
export type DataLicense = (typeof DATA_LICENSES)[number];

export const REGULATION_STATUSES = ['draft', 'active', 'superseded'] as const;
export type RegulationStatus = (typeof REGULATION_STATUSES)[number];

export const CHANGE_EVENT_STATUSES = ['new', 'reviewing', 'dismissed', 'applied'] as const;
export type ChangeEventStatus = (typeof CHANGE_EVENT_STATUSES)[number];

export const REVIEW_ITEM_TYPES = [
  'profile_conflict',
  'supplier_sds_match',
  'profile_draft',
  'regulation_change',
  'draft_revision',
  'data_gap',
] as const;
export type ReviewItemType = (typeof REVIEW_ITEM_TYPES)[number];

export const REVIEW_ITEM_STATUSES = ['open', 'resolved', 'dismissed'] as const;
export type ReviewItemStatus = (typeof REVIEW_ITEM_STATUSES)[number];

/** One impurity or composition condition of a profile, e.g. D4 < 0.1 %. */
export interface ProfileCondition {
  cas: string;
  op: '<' | '<=' | '>' | '>=';
  value: number;
  unit: '%';
}

export interface RegulationVersion {
  id: string;
  jurisdiction: string;
  regulation: string;
  title: string;
  sourceDocument: string;
  gazetteDate: string | null;
  gazetteNumber: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  transitionUntil: string | null;
  status: RegulationStatus;
}

export interface ClassificationProfile {
  id: string;
  substanceId: string;
  /** null = global/shared; otherwise the owning firm. */
  organizationId: string | null;
  sourceType: ProfileSourceType;
  classificationSystem: ClassificationSystem;
  jurisdiction: string;
  regulation: string;
  regulationVersionId: string | null;
  sourceReference: string;
  sourcePage: number | null;
  sourceSnapshot: Record<string, unknown> | null;
  dataLicense: DataLicense;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  verificationStatus: VerificationStatus;
  verifiedBy: string | null;
  verifiedAt: string | null;
  chemicalName: string | null;
  surfactantFamily: string | null;
  carbonChainMin: number | null;
  carbonChainMax: number | null;
  eoPoMin: number | null;
  eoPoMax: number | null;
  activeMin: number | null;
  activeMax: number | null;
  conditionText: string | null;
  conditions: ProfileCondition[];
  rationale: string | null;
  warnings: string[];
}

export interface RegulatorySource {
  id: string;
  name: string;
  kind: string;
  urlTemplate: string;
  keywords: string[];
  enabled: boolean;
  lastCheckedAt: string | null;
  lastStatus: string | null;
}

export interface RegulatoryChangeEvent {
  id: string;
  sourceId: string;
  regulationVersionId: string | null;
  gazetteDate: string;
  title: string;
  url: string;
  matchedKeywords: string[];
  excerpt: string | null;
  status: ChangeEventStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}

export interface KduReviewItem {
  id: string;
  /** null = platform level. */
  organizationId: string | null;
  itemType: ReviewItemType;
  status: ReviewItemStatus;
  title: string;
  detail: Record<string, unknown>;
  substanceId: string | null;
  profileId: string | null;
  rawMaterialId: string | null;
  productId: string | null;
  changeEventId: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

/**
 * Whether a profile may enter a calculation. A research note never does, a UN GHS profile
 * never does (the TR calculation uses CLP only), and everything else needs a verification.
 */
export function isCalculationEligible(
  profile: Pick<
    ClassificationProfile,
    'sourceType' | 'classificationSystem' | 'verificationStatus' | 'effectiveTo'
  >,
  today: string,
): boolean {
  if (profile.sourceType === 'research_note') return false;
  if (profile.classificationSystem !== 'clp') return false;
  if (profile.verificationStatus !== 'verified') return false;
  return profile.effectiveTo === null || profile.effectiveTo >= today;
}
