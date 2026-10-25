import { describe, expect, it } from 'vitest';
import { progress } from './progress';
import type { RawMaterial } from './types';

const doc = (
  status: 'approved' | 'pending_review',
  extraction_status: 'done' | 'running',
  open = 0,
) => ({
  id: 'd',
  status,
  extraction_status,
  flags: Array.from({ length: open }, () => ({
    field: 'x',
    kind: 'ambiguous' as const,
    message: '',
    page: 1,
  })),
  uploaded_at: '2026-10-25',
  revision_number: null,
  revision_date: null,
});
const material = (docs: ReturnType<typeof doc>[]): RawMaterial => ({
  id: 'm',
  trade_name: 'x',
  supplier_name: null,
  raw_material_sds_documents: docs,
});

describe('progress', () => {
  it('points a new firm at the upload step', () => {
    const p = progress([], []);
    expect(p.steps.map((s) => s.state)).toEqual(['active', 'todo', 'todo', 'todo']);
    expect(p.steps[0]?.summary).toBe('Henüz hammadde yok');
  });

  it('moves on to approvals once every SDS is read, counting open questions', () => {
    const p = progress(
      [material([doc('approved', 'done')]), material([doc('pending_review', 'done', 2)])],
      [],
    );
    expect(p.steps.map((s) => s.state)).toEqual(['done', 'active', 'todo', 'todo']);
    expect(p.steps[1]?.summary).toBe('1 hammadde bekliyor, 2 soru açık');
  });

  it('keeps the upload step open while an SDS is still being read', () => {
    const p = progress([material([doc('pending_review', 'running')])], []);
    expect(p.steps[0]?.state).toBe('active');
    expect(p.steps[0]?.summary).toBe('1 hammadde, 1 SDS okunuyor');
  });

  it('counts products by their Turkish SDS', () => {
    const p = progress(
      [material([doc('approved', 'done')])],
      [
        { recipe_lines: [{ id: 'a' }], sds_documents: [{ language: 'tr', status: 'published' }] },
        { recipe_lines: [{ id: 'b' }], sds_documents: [{ language: 'tr', status: 'draft' }] },
        { recipe_lines: [], sds_documents: [] },
      ],
    );
    expect(p.steps.map((s) => s.state)).toEqual(['done', 'done', 'active', 'todo']);
    expect(p.steps[3]?.summary).toBe('1 yayında, 1 taslak, 1 başlanmadı');
  });
});
