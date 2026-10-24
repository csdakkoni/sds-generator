import { loadHarmonised } from './ek6';
import { supabase } from './supabase';

export interface CasInfo {
  /** Name to pre-fill, when one was found. */
  name: string | null;
  /** Where it came from and what is known, in Turkish, shown under the row. */
  message: string;
}

/**
 * Identity of a CAS number: the platform library first, PubChem (through the server) when the
 * library does not have it. Also reports whether a verified SEA Annex 6 classification exists.
 * Identity only; PubChem hazard data is never used.
 */
export async function lookupCas(cas: string): Promise<CasInfo> {
  const { data: substance } = await supabase
    .from('substances')
    .select('name, synonyms')
    .eq('cas_number', cas)
    .maybeSingle();
  let name: string | null = substance?.name ?? null;
  let origin = 'kütüphaneden';
  if (!name) {
    const { data, error } = await supabase.functions.invoke('lookup-cas', { body: { cas } });
    const found = error ? null : (data as { found?: boolean; identity?: { name: string } });
    if (found?.found && found.identity) {
      name = found.identity.name;
      origin = 'PubChem';
    }
  }
  let official = false;
  try {
    official = cas in (await loadHarmonised([cas]));
  } catch {
    // The Annex 6 check is informative here; the recipe screen repeats it.
  }
  const ek6 = official
    ? "SEA Ek-6'da doğrulanmış sınıflandırması var, otomatik kullanılır."
    : "SEA Ek-6'da doğrulanmış sınıflandırması yok; tehlike verisi eksik sayılır, SDS taslak kalır.";
  return {
    name,
    message: name ? `${name} (${origin}). ${ek6}` : `Ad bulunamadı, elle yaz. ${ek6}`,
  };
}
