/** Reading and writing outside-source data; the pure summary lives in outside-summary.ts. */
import { hazardClassOf } from '@sds/classification-engine';
import {
  agreementLabel,
  summarise,
  type ConfirmedProfile,
  type OutsideRecord,
  type OutsideSummary,
} from './outside-summary';
import { supabase } from './supabase';

export * from './outside-summary';

const PART = 30;

/** Records the signed-in person may see (licence rules apply), summarised per CAS number. */
export async function loadOutside(cas: string[]): Promise<Record<string, OutsideSummary>> {
  const byCas: Record<string, OutsideRecord[]> = {};
  const unique = [...new Set(cas)];
  for (let i = 0; i < unique.length; i += PART) {
    const { data, error } = await supabase
      .from('substance_source_records')
      .select(
        'cas_number, source_id, family, name, reference, lines, category_texts, not_classified, fetched_at, snapshot',
      )
      .in('cas_number', unique.slice(i, i + PART));
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as (OutsideRecord & { cas_number: string })[]) {
      (byCas[row.cas_number] ??= []).push(row);
    }
  }
  return Object.fromEntries(Object.entries(byCas).map(([c, rows]) => [c, summarise(c, rows)]));
}

interface ProfileRow {
  cas_number: string;
  classification_profiles: {
    id: string;
    source_reference: string;
    verified_at: string;
    source_snapshot: { kind?: string } | null;
    substance_classifications: { category: string; h_code: string | null }[];
  }[];
}

/** The firm's confirmed outside-source profiles of the given CAS numbers. */
export async function loadConfirmed(
  organizationId: string,
  cas: string[],
): Promise<Record<string, ConfirmedProfile>> {
  const out: Record<string, ConfirmedProfile> = {};
  const unique = [...new Set(cas)];
  for (let i = 0; i < unique.length; i += PART) {
    const { data, error } = await supabase
      .from('substances')
      .select(
        'cas_number, classification_profiles!inner (id, source_reference, verified_at, source_snapshot, substance_classifications (category, h_code))',
      )
      .in('cas_number', unique.slice(i, i + PART))
      .eq('classification_profiles.organization_id', organizationId)
      .eq('classification_profiles.source_type', 'expert_rule')
      .eq('classification_profiles.verification_status', 'verified')
      .is('classification_profiles.effective_to', null);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as unknown as ProfileRow[]) {
      // Only the KDU's confirmations of outside sources; other expert rules carry conditions the
      // recipe cannot check yet.
      const p = row.classification_profiles
        .filter((x) => x.source_snapshot?.kind === 'outside_sources')
        .sort((a, b) => b.verified_at.localeCompare(a.verified_at))[0];
      if (!p) continue;
      out[row.cas_number] = {
        profileId: p.id,
        reference: p.source_reference,
        lines: p.substance_classifications.map((l) => ({
          category: l.category,
          hCode: l.h_code ?? '—',
        })),
        verifiedAt: p.verified_at,
      };
    }
  }
  return out;
}

/** Asks the server to look the CAS number up at PubChem and store what it finds. */
export async function fetchOutside(
  cas: string,
  refresh = false,
): Promise<{ found: boolean; name: string | null; error?: string }> {
  const { data, error } = await supabase.functions.invoke('lookup-cas', {
    body: { cas, refresh },
  });
  if (error) return { found: false, name: null, error: error.message };
  const r = data as { found?: boolean; name?: string | null };
  return { found: !!r.found, name: r.name ?? null };
}

/**
 * Records the KDU's confirmation as the firm's own profile (source_type expert_rule, linked to
 * the outside records it rests on) and closes the firm's open KDU list items for the substance.
 */
export async function confirmOutside(args: {
  organizationId: string;
  userId: string;
  substanceId: string;
  summary: OutsideSummary;
  lines: { category: string; hCode: string }[];
  choice: string;
}): Promise<string | null> {
  const { summary } = args;
  const names = summary.sources.map((s) => s.record.name ?? s.record.source_id);
  const now = new Date().toISOString();
  const { data: profile, error } = await supabase
    .from('classification_profiles')
    .insert({
      substance_id: args.substanceId,
      organization_id: args.organizationId,
      source_type: 'expert_rule',
      regulation: 'SEA',
      source_reference: `Dış kaynaklar (PubChem üzerinden): ${names.join(', ')}`,
      data_license: 'kdu_authored',
      condition_text: 'Saf madde; dış kaynak karşılaştırmasıyla belirlendi.',
      rationale: `${summary.agreement.trace} KDU seçimi: ${args.choice}.`,
      verification_status: 'verified',
      verified_by: args.userId,
      verified_at: now,
      source_snapshot: {
        kind: 'outside_sources',
        status: summary.agreement.status,
        records: summary.sources.map((s) => ({
          source_id: s.record.source_id,
          fetched_at: s.record.fetched_at,
          lines: s.lines,
        })),
      },
    })
    .select('id')
    .single();
  if (error || !profile) return `Onay kaydedilemedi: ${error?.message}`;
  if (args.lines.length > 0) {
    const { error: lineError } = await supabase.from('substance_classifications').insert(
      args.lines.map((l) => ({
        substance_id: args.substanceId,
        organization_id: args.organizationId,
        profile_id: profile.id,
        hazard_class: hazardClassOf(l.category),
        category: l.category,
        h_code: l.hCode,
        source_type: 'expert',
        source_reference: 'KDU onayı (dış kaynak karşılaştırması)',
        approved_by: args.userId,
        approved_at: now,
      })),
    );
    if (lineError) return `Sınıf satırları kaydedilemedi: ${lineError.message}`;
  }
  await supabase
    .from('kdu_review_queue')
    .update({ status: 'resolved', resolved_by: args.userId, resolved_at: now })
    .eq('organization_id', args.organizationId)
    .eq('substance_id', args.substanceId)
    .eq('status', 'open');
  return null;
}

/** Puts a substance on the firm's KDU list once, unless an open item already exists. */
export async function ensureReviewItem(args: {
  organizationId: string;
  substanceId: string;
  cas: string;
  name: string;
  summary: OutsideSummary | undefined;
}): Promise<void> {
  const { data: open } = await supabase
    .from('kdu_review_queue')
    .select('id')
    .eq('organization_id', args.organizationId)
    .eq('substance_id', args.substanceId)
    .eq('status', 'open')
    .limit(1);
  if (open && open.length > 0) return;
  const conflict = args.summary?.agreement.status === 'conflict';
  await supabase.from('kdu_review_queue').insert({
    organization_id: args.organizationId,
    item_type: conflict ? 'profile_conflict' : 'profile_draft',
    title: `${args.name} (${args.cas}): ${agreementLabel(args.summary)}`,
    substance_id: args.substanceId,
    detail: { url: `#/kutuphane/${args.cas}`, cas: args.cas },
  });
}
