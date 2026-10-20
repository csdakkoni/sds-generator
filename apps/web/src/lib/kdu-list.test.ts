import { describe, expect, it } from 'vitest';
import { openCounts, sortItems, type ReviewItem } from './kdu-list';

const item = (id: string, status: ReviewItem['status'], created_at: string): ReviewItem => ({
  id,
  item_type: id.startsWith('r') ? 'regulation_change' : 'data_gap',
  status,
  title: id,
  detail: {},
  organization_id: null,
  created_at,
});

describe('sortItems', () => {
  it('puts open items first and newest first within a group', () => {
    const sorted = sortItems([
      item('d-old', 'resolved', '2026-10-20'),
      item('r-old', 'open', '2026-10-18'),
      item('r-new', 'open', '2026-10-19'),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(['r-new', 'r-old', 'd-old']);
  });
});

describe('openCounts', () => {
  it('counts only open items per type', () => {
    expect(
      openCounts([
        item('r1', 'open', '2026-10-18'),
        item('r2', 'dismissed', '2026-10-18'),
        item('d1', 'open', '2026-10-18'),
      ]),
    ).toEqual({ regulation_change: 1, data_gap: 1 });
  });
});
