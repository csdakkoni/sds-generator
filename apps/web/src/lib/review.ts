import type { Flag, MemberRole, Membership, RawMaterial } from './types';

export const FLAG_KIND: Record<Flag['kind'], { label: string; tone: 'bad' | 'warn' | 'info' }> = {
  conflict: { label: 'Çelişki', tone: 'bad' },
  missing_expected: { label: 'Eksik bilgi', tone: 'warn' },
  ambiguous: { label: 'Belirsiz', tone: 'warn' },
  unreadable: { label: 'Okunamadı', tone: 'warn' },
  other: { label: 'Not', tone: 'info' },
};

export function hasRole(m: Pick<Membership, 'role' | 'extra_roles'>, role: MemberRole): boolean {
  return m.role === role || m.extra_roles.includes(role);
}

export function canEdit(m: Pick<Membership, 'role' | 'extra_roles'>): boolean {
  return (['owner', 'editor', 'kdu'] as MemberRole[]).some((r) => hasRole(m, r));
}

export function openFlags(flags: Flag[]): number {
  return flags.filter((f) => !f.resolution).length;
}

/** Trade name placeholder until the extraction fills in the real one. */
export function nameFromFile(fileName: string): string {
  return (
    fileName
      .replace(/\.pdf$/i, '')
      .replace(/[_]+/g, ' ')
      .trim() || fileName
  );
}

export type MaterialState =
  | { kind: 'no_document' }
  | { kind: 'by_cas' }
  | { kind: 'reading' }
  | { kind: 'failed' }
  | { kind: 'questions'; open: number }
  | { kind: 'ready' }
  | { kind: 'approved' };

/** Status of a raw material from its most recent SDS. */
export function materialState(m: RawMaterial): MaterialState {
  const doc = [...m.raw_material_sds_documents].sort((a, b) =>
    b.uploaded_at.localeCompare(a.uploaded_at),
  )[0];
  if (!doc) {
    const manual = m.raw_material_components?.some((c) => c.sds_document_id === null);
    return manual ? { kind: 'by_cas' } : { kind: 'no_document' };
  }
  if (doc.status === 'approved') return { kind: 'approved' };
  if (doc.extraction_status === 'failed') return { kind: 'failed' };
  if (doc.extraction_status !== 'done') return { kind: 'reading' };
  const open = openFlags(doc.flags);
  return open > 0 ? { kind: 'questions', open } : { kind: 'ready' };
}
