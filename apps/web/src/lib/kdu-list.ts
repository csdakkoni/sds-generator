export type ReviewItemType =
  | 'profile_conflict'
  | 'supplier_sds_match'
  | 'profile_draft'
  | 'regulation_change'
  | 'draft_revision'
  | 'data_gap';

export interface ReviewItem {
  id: string;
  item_type: ReviewItemType;
  status: 'open' | 'resolved' | 'dismissed';
  title: string;
  detail: Record<string, unknown>;
  organization_id: string | null;
  created_at: string;
}

export const ITEM_LABEL: Record<ReviewItemType, string> = {
  profile_conflict: 'Profil çelişkisi',
  supplier_sds_match: 'Tedarikçi SDS eşleşmesi',
  profile_draft: 'Profil taslağı',
  regulation_change: 'Mevzuat değişikliği',
  draft_revision: 'Taslak revizyon',
  data_gap: 'Eksik veri',
};

/** Open items first, then newest first; resolved and dismissed items sink to the bottom. */
export function sortItems(items: ReviewItem[]): ReviewItem[] {
  return [...items].sort((a, b) => {
    if ((a.status === 'open') !== (b.status === 'open')) return a.status === 'open' ? -1 : 1;
    return b.created_at.localeCompare(a.created_at);
  });
}

/** Counts of open items per type, for the summary line. */
export function openCounts(items: ReviewItem[]): Partial<Record<ReviewItemType, number>> {
  const counts: Partial<Record<ReviewItemType, number>> = {};
  for (const item of items) {
    if (item.status !== 'open') continue;
    counts[item.item_type] = (counts[item.item_type] ?? 0) + 1;
  }
  return counts;
}
