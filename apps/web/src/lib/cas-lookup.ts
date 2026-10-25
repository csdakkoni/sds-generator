import { loadHarmonised, type HarmonisedEntry } from './ek6';
import {
  agreementLabel,
  fetchOutside,
  loadConfirmed,
  loadOutside,
  type ConfirmedProfile,
  type OutsideSummary,
} from './outside';
import { supabase } from './supabase';

export interface CasInfo {
  /** Name to pre-fill, when one was found. */
  name: string | null;
  substanceId: string | null;
  ek6: HarmonisedEntry | null;
  summary: OutsideSummary | null;
  confirmed: ConfirmedProfile | null;
  /** Where the data stands, in Turkish, shown under the row. */
  message: string;
}

/**
 * Everything known about a CAS number: the server first looks it up at PubChem and keeps the
 * identity and each source's record in the library (cached for 30 days), then the library is
 * read with the signed-in person's rights (licence rules apply).
 */
export async function lookupCas(cas: string, organizationId: string): Promise<CasInfo> {
  const fetched = await fetchOutside(cas);
  const [{ data: substance }, ek6, outside, confirmed] = await Promise.all([
    supabase.from('substances').select('id, name').eq('cas_number', cas).maybeSingle(),
    loadHarmonised([cas]).catch(() => ({}) as Record<string, HarmonisedEntry>),
    loadOutside([cas]).catch(() => ({}) as Record<string, OutsideSummary>),
    loadConfirmed(organizationId, [cas]).catch(() => ({}) as Record<string, ConfirmedProfile>),
  ]);
  const name = (substance?.name as string | undefined) ?? fetched.name;
  const entry = ek6[cas] ?? null;
  const summary = outside[cas] ?? null;
  const own = confirmed[cas] ?? null;
  const parts = [
    name
      ? `${name}.`
      : fetched.reason === 'no_name'
        ? "PubChem'de bu CAS için kayıt var ama temiz bir ad yok (yalnızca ticari adlar); adı elle yaz."
        : fetched.reason === 'no_record'
          ? "PubChem'de bu CAS numarasıyla kayıt bulunamadı; adı elle yaz, sınıflandırma için tedarikçi SDS'i yükle."
          : 'Ad bulunamadı, elle yaz.',
    entry
      ? entry.verified
        ? 'SEA Ek-6: doğrulanmış.'
        : `SEA Ek-6: var, henüz doğrulanmadı${entry.caveat ? ` (${entry.caveat})` : ''}.`
      : "SEA Ek-6'da yok.",
    own
      ? 'KDU değerlendirmesi kayıtlı.'
      : `${agreementLabel(summary ?? undefined)}. Sınıflandırma için tedarikçi SDS'i gerekir.`,
  ];
  if (fetched.error) parts.push(`PubChem'e ulaşılamadı (${fetched.error}).`);
  return {
    name,
    substanceId: (substance?.id as string | undefined) ?? null,
    ek6: entry,
    summary,
    confirmed: own,
    message: parts.join(' '),
  };
}
