import { describe, expect, it } from 'vitest';
import { canEdit, hasRole, materialState, nameFromFile, openFlags } from './review';
import type { Flag, RawMaterial } from './types';

const flag = (resolved: boolean): Flag => ({
  field: 'x',
  kind: 'ambiguous',
  message: 'm',
  page: 1,
  ...(resolved ? { resolution: { status: 'accepted', note: null, by: 'u', at: 't' } } : {}),
});

const material = (
  docs: Partial<RawMaterial['raw_material_sds_documents'][number]>[],
): RawMaterial => ({
  id: 'r',
  trade_name: 'T',
  supplier_name: null,
  raw_material_sds_documents: docs.map((d, i) => ({
    id: String(i),
    status: 'pending_review',
    extraction_status: 'done',
    flags: [],
    uploaded_at: `2026-10-1${i}`,
    revision_number: null,
    revision_date: null,
    ...d,
  })),
});

describe('roles', () => {
  it('counts extra roles, so an owner can also be the KDU', () => {
    expect(hasRole({ role: 'owner', extra_roles: ['kdu'] }, 'kdu')).toBe(true);
    expect(hasRole({ role: 'owner', extra_roles: [] }, 'kdu')).toBe(false);
  });
  it('treats viewers as read-only', () => {
    expect(canEdit({ role: 'viewer', extra_roles: [] })).toBe(false);
    expect(canEdit({ role: 'editor', extra_roles: [] })).toBe(true);
  });
});

describe('materialState', () => {
  it('reports open questions from the latest SDS', () => {
    expect(materialState(material([{ flags: [flag(false), flag(true)] }]))).toEqual({
      kind: 'questions',
      open: 1,
    });
  });
  it('is ready when every question is answered, and approved after KDU approval', () => {
    expect(materialState(material([{ flags: [flag(true)] }]))).toEqual({ kind: 'ready' });
    expect(materialState(material([{ status: 'approved' }]))).toEqual({ kind: 'approved' });
  });
  it('shows reading and failed extractions', () => {
    expect(materialState(material([{ extraction_status: 'running' }]))).toEqual({
      kind: 'reading',
    });
    expect(materialState(material([{ extraction_status: 'failed' }]))).toEqual({ kind: 'failed' });
    expect(materialState(material([]))).toEqual({ kind: 'no_document' });
  });
  it('uses the most recent upload', () => {
    expect(
      materialState(material([{ status: 'approved' }, { extraction_status: 'running' }])),
    ).toEqual({ kind: 'reading' });
  });
});

describe('helpers', () => {
  it('derives a placeholder name from the file name', () => {
    expect(nameFromFile('Floranit_40_28_T.PDF')).toBe('Floranit 40 28 T');
  });
  it('counts unanswered questions', () => {
    expect(openFlags([flag(false), flag(true), flag(false)])).toBe(2);
  });
});
