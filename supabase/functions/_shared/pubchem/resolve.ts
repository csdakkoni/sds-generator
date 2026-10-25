/**
 * Finds the PubChem compound record(s) of a CAS number. Several ways are tried in turn because
 * PubChem files substances like polymers and ethoxylates (variable composition) differently from
 * single molecules:
 *  1. name search on the number (works for ordinary substances);
 *  2. the registry-number cross-reference (an exact match PubChem itself made);
 *  3. depositor "substance" records carrying the number, and the compounds they map to.
 * Identity only, like identity.ts: nothing here reads hazard data.
 */
import { parseIdentity, type SubstanceIdentity } from './identity.ts';

export const PUG = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';

/** GET that returns parsed JSON, or null when PubChem says nothing matches (HTTP 404). */
export type Fetcher = (url: string) => Promise<unknown | null>;

interface Synonyms {
  InformationList?: { Information?: { CID?: number; SID?: number; Synonym?: string[] }[] };
}

export interface Resolution {
  identity: SubstanceIdentity | null;
  /** Compound records to read hazard data from, best first (at most MAX_CIDS). */
  cids: number[];
  /** Name taken from depositor records when no compound exists; null when none looks safe. */
  substanceName: string | null;
  /** What each step found, for the function log. */
  steps: string[];
  /** Steps PubChem failed to answer (not "no match"); the answer is then incomplete. */
  errors: string[];
}

const MAX_CIDS = 5;
const MAX_LOOKUP = 20;

/**
 * Picks a name in the style of the chemical inventories ("Alcohols, C13-iso-, ethoxylated",
 * "Benzenesulfonic acid, dodecyl-, sodium salt") out of depositor synonyms. Trade names have no
 * such inverted form, and the library never stores trade names, so a synonym list without one
 * gives no name.
 */
export function inventoryName(synonyms: string[]): string | null {
  const ok = synonyms
    .map((s) => s.trim())
    .filter(
      (s) =>
        s.length >= 6 &&
        s.length <= 150 &&
        /,\s/.test(s) &&
        !/[®™]/.test(s) &&
        !/\d\s*%/.test(s) &&
        !/^[\d\s,.-]+$/.test(s),
    );
  // Plain wording over the encoded ".alpha.-" spelling some depositors use.
  return ok.find((s) => !/\.[a-z]+\./i.test(s)) ?? ok[0] ?? null;
}

const unique = (xs: number[]) => [...new Set(xs)];

export async function resolveCas(cas: string, fetcher: Fetcher): Promise<Resolution> {
  const steps: string[] = [];
  const errors: string[] = [];
  // One failing step must not hide what the others find; it is reported in `errors`.
  const get: Fetcher = async (url) => {
    try {
      return await fetcher(url);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
      return null;
    }
  };
  const key = encodeURIComponent(cas);
  const props = (cids: number[]) =>
    `${PUG}/compound/cid/${cids.join(',')}/property/Title,MolecularFormula,MolecularWeight/JSON`;

  // 1. name search
  const byName = (await get(`${PUG}/compound/name/${key}/synonyms/JSON`)) as Synonyms | null;
  const named = byName?.InformationList?.Information?.filter((i) => i.Synonym?.includes(cas));
  steps.push(
    `name search: ${byName ? `${byName.InformationList?.Information?.length ?? 0} records, ${named?.length ?? 0} list the number` : 'no match'}`,
  );
  if (named && named.length > 0 && byName) {
    const properties = await get(
      `${PUG}/compound/name/${key}/property/Title,MolecularFormula,MolecularWeight/JSON`,
    );
    const identity = parseIdentity(cas, byName, (properties ?? {}) as never);
    if (identity) {
      const others = unique(named.map((i) => i.CID ?? 0).filter(Boolean)).filter(
        (c) => c !== identity.cid,
      );
      return {
        identity,
        cids: [identity.cid, ...others].slice(0, MAX_CIDS),
        substanceName: null,
        steps,
        errors,
      };
    }
  }

  // 2. registry-number cross-reference
  const xref = (await get(`${PUG}/compound/xref/RegistryID/${key}/cids/JSON`)) as {
    IdentifierList?: { CID?: number[] };
  } | null;
  let cids = unique(xref?.IdentifierList?.CID ?? []);
  steps.push(`registry cross-reference: ${cids.length} compounds`);

  // 3. depositor substance records
  let substanceName: string | null = null;
  if (cids.length === 0) {
    const subs = (await get(`${PUG}/substance/name/${key}/synonyms/JSON`)) as Synonyms | null;
    const withCas = (subs?.InformationList?.Information ?? []).filter((i) =>
      i.Synonym?.includes(cas),
    );
    steps.push(`substance records: ${withCas.length}`);
    if (withCas.length > 0) {
      substanceName = inventoryName(withCas.flatMap((i) => i.Synonym ?? []));
      const sids = withCas
        .map((i) => i.SID)
        .filter((s): s is number => !!s)
        .slice(0, MAX_LOOKUP);
      const mapped = sids.length
        ? ((await get(`${PUG}/substance/sid/${sids.join(',')}/cids/JSON?cids_type=all`)) as {
            InformationList?: { Information?: { CID?: number[] }[] };
          } | null)
        : null;
      cids = unique((mapped?.InformationList?.Information ?? []).flatMap((i) => i.CID ?? []));
      steps.push(`compounds of those substances: ${cids.length}`);
    }
  }

  if (cids.length === 0) return { identity: null, cids: [], substanceName, steps, errors };

  const pick = cids.slice(0, MAX_LOOKUP);
  const synonyms = (await get(
    `${PUG}/compound/cid/${pick.join(',')}/synonyms/JSON`,
  )) as Synonyms | null;
  const properties = (await get(props(pick))) ?? {};
  const found = synonyms ? parseIdentity(cas, synonyms, properties as never, true) : null;
  // Depositor-filed records often carry a trade name as their title; the inventory-style name
  // among the synonyms, when there is one, is what the library should show.
  const listed = synonyms?.InformationList?.Information?.find((i) => i.CID === found?.cid);
  const inventory = inventoryName(listed?.Synonym ?? []);
  const identity = found && inventory ? { ...found, name: inventory } : found;
  steps.push(`identity: ${identity ? `CID ${identity.cid}` : 'none'}`);
  const first = identity ? [identity.cid, ...pick.filter((c) => c !== identity.cid)] : pick;
  return { identity, cids: first.slice(0, MAX_CIDS), substanceName, steps, errors };
}
