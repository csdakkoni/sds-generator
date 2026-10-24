import { supabase } from './supabase';

/** A substance's SEA Annex 6 classification, as the engine takes it. */
export interface HarmonisedEntry {
  /** "SEA Ek-6 liste no 004-001-00-7", shown in warnings and on the SDS. */
  reference: string;
  classifications: { category: string; hCode: string }[];
  /** Checked by a person. Unchecked entries only reach drafts, never a finalised SDS. */
  verified: boolean;
  /** Note letter or concentration-limit text of the table row, still to be applied by a KDU. */
  caveat: string | null;
  profileId: string;
}

interface Row {
  cas_number: string;
  classification_profiles: {
    id: string;
    source_reference: string;
    verification_status: 'verified' | 'pending';
    source_snapshot: { note?: string | null; scl_m_text?: string | null } | null;
    substance_classifications: { category: string; h_code: string | null }[];
  }[];
}

// Ids go in the request URL, so they are looked up a few at a time.
const PART = 30;

/**
 * Looks up the current Annex 6 profiles of the given CAS numbers. Verified profiles are used as
 * they are; pending ones (note letters, specific limits) come back marked so the recipe uses them
 * in the draft with a blocking warning instead of ignoring the official list. Rejected profiles
 * and rows without class lines are never returned.
 */
export async function loadHarmonised(cas: string[]): Promise<Record<string, HarmonisedEntry>> {
  const out: Record<string, HarmonisedEntry> = {};
  const unique = [...new Set(cas)];
  for (let i = 0; i < unique.length; i += PART) {
    const { data, error } = await supabase
      .from('substances')
      .select(
        'cas_number, classification_profiles!inner (id, source_reference, verification_status, source_snapshot, substance_classifications (category, h_code))',
      )
      .in('cas_number', unique.slice(i, i + PART))
      .eq('classification_profiles.source_type', 'harmonised')
      .in('classification_profiles.verification_status', ['verified', 'pending'])
      .is('classification_profiles.effective_to', null);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as unknown as Row[]) {
      const profile = row.classification_profiles[0];
      if (!profile || profile.substance_classifications.length === 0) continue;
      const snapshot = profile.source_snapshot ?? {};
      const caveat = [snapshot.note && `Not ${snapshot.note}`, snapshot.scl_m_text]
        .filter(Boolean)
        .join('; ');
      out[row.cas_number] = {
        reference: `SEA ${profile.source_reference}`,
        // A class without a hazard statement in the table (pressurised gas) goes on with "—":
        // the engine reports categories it does not evaluate.
        classifications: profile.substance_classifications.map((l) => ({
          category: l.category,
          hCode: l.h_code ?? '—',
        })),
        verified: profile.verification_status === 'verified',
        caveat: caveat || null,
        profileId: profile.id,
      };
    }
  }
  return out;
}
