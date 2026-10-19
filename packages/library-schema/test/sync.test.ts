import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CHANGE_EVENT_STATUSES,
  CLASSIFICATION_SYSTEMS,
  DATA_LICENSES,
  PROFILE_SOURCE_TYPES,
  REGULATION_STATUSES,
  REVIEW_ITEM_STATUSES,
  REVIEW_ITEM_TYPES,
  VERIFICATION_STATUSES,
  isCalculationEligible,
} from '../src/index';

const sql = readFileSync(
  new URL('../../../supabase/migrations/20261019020000_library_profiles.sql', import.meta.url),
  'utf8',
);

function sqlEnum(name: string): string[] {
  const match = new RegExp(`create type public\\.${name} as enum \\(([^)]*)\\)`).exec(sql);
  if (!match?.[1]) throw new Error(`enum ${name} not found in migration`);
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1] ?? '');
}

describe('TypeScript constants match the migration enums', () => {
  it.each([
    ['profile_source_type', PROFILE_SOURCE_TYPES],
    ['classification_system', CLASSIFICATION_SYSTEMS],
    ['verification_status', VERIFICATION_STATUSES],
    ['data_license', DATA_LICENSES],
    ['regulation_status', REGULATION_STATUSES],
    ['change_event_status', CHANGE_EVENT_STATUSES],
    ['review_item_type', REVIEW_ITEM_TYPES],
    ['review_item_status', REVIEW_ITEM_STATUSES],
  ] as const)('%s', (name, values) => {
    expect(sqlEnum(name)).toEqual([...values]);
  });
});

describe('isCalculationEligible', () => {
  const base = {
    sourceType: 'harmonised',
    classificationSystem: 'clp',
    verificationStatus: 'verified',
    effectiveTo: null,
  } as const;
  it('accepts a verified CLP profile', () => {
    expect(isCalculationEligible(base, '2026-10-19')).toBe(true);
  });
  it('rejects research notes, UN GHS, unverified and expired profiles', () => {
    expect(isCalculationEligible({ ...base, sourceType: 'research_note' }, '2026-10-19')).toBe(
      false,
    );
    expect(isCalculationEligible({ ...base, classificationSystem: 'un_ghs' }, '2026-10-19')).toBe(
      false,
    );
    expect(isCalculationEligible({ ...base, verificationStatus: 'pending' }, '2026-10-19')).toBe(
      false,
    );
    expect(isCalculationEligible({ ...base, effectiveTo: '2026-01-01' }, '2026-10-19')).toBe(false);
  });
});
