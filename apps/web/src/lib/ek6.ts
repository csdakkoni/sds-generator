import { supabase } from './supabase';

/** A substance's verified SEA Annex 6 classification, as the engine takes it. */
export interface HarmonisedEntry {
  /** "SEA Ek-6 liste no 004-001-00-7", shown in warnings and on the SDS. */
  reference: string;
  classifications: { category: string; hCode: string }[];
}

interface Row {
  cas_number: string;
  classification_profiles: {
    source_reference: string;
    substance_classifications: { category: string; h_code: string | null }[];
  }[];
}

// Ids go in the request URL, so they are looked up a few at a time.
const PART = 30;

/**
 * Looks up the person-verified Annex 6 profiles of the given CAS numbers. Profiles still
 * pending review are never returned, so they cannot reach a calculation.
 */
export async function loadHarmonised(cas: string[]): Promise<Record<string, HarmonisedEntry>> {
  const out: Record<string, HarmonisedEntry> = {};
  const unique = [...new Set(cas)];
  for (let i = 0; i < unique.length; i += PART) {
    const { data, error } = await supabase
      .from('substances')
      .select(
        'cas_number, classification_profiles!inner (source_reference, substance_classifications (category, h_code))',
      )
      .in('cas_number', unique.slice(i, i + PART))
      .eq('classification_profiles.source_type', 'harmonised')
      .eq('classification_profiles.verification_status', 'verified')
      .is('classification_profiles.effective_to', null);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as unknown as Row[]) {
      const profile = row.classification_profiles[0];
      if (!profile) continue;
      out[row.cas_number] = {
        reference: `SEA ${profile.source_reference}`,
        // A class without a hazard statement in the table (pressurised gas) goes on with "—":
        // the engine reports categories it does not evaluate.
        classifications: profile.substance_classifications.map((l) => ({
          category: l.category,
          hCode: l.h_code ?? '—',
        })),
      };
    }
  }
  return out;
}
