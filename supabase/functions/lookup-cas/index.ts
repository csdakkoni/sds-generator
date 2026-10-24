/**
 * Looks up a CAS number at PubChem and keeps what it finds in the platform library.
 *
 * POST { cas, refresh? } with a signed-in user's session. Steps:
 *  1. identity (name, EC) -> `substances`, only when the library does not have the CAS yet;
 *  2. each source's GHS record that PubChem republishes -> `substance_source_records`, with the
 *     source in the `outside_sources` registry (licence decided once per source).
 * Pure substance data only: nothing records which firm asked. Sources are re-read after 30 days.
 * The CAS check digit is verified before anything leaves the platform.
 */
import { createClient } from '@supabase/supabase-js';
import { EXCLUDED_FAMILIES, parseGhs, type PugView } from '../_shared/pubchem/ghs.ts';
import { parseIdentity } from '../_shared/pubchem/identity.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function validCas(cas: string): boolean {
  if (!/^\d{2,7}-\d{2}-\d$/.test(cas)) return false;
  const digits = cas.replace(/-/g, '');
  const body = digits.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) sum += Number(body[body.length - 1 - i]) * (i + 1);
  return sum % 10 === Number(digits.slice(-1));
}

const PUG = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';
const VIEW = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound';
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;

async function get(url: string): Promise<unknown | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`PubChem ${res.status}`);
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const url = env('SUPABASE_URL');
  // Only signed-in people may make the server write to the library (an anon key is not enough).
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const caller = createClient(url, env('SUPABASE_ANON_KEY'));
  const { data: user } = await caller.auth.getUser(token);
  if (!token || !user.user) return json({ error: 'not signed in' }, 401);

  const { cas, refresh } = (await req.json().catch(() => ({}))) as {
    cas?: string;
    refresh?: boolean;
  };
  const number = cas?.trim() ?? '';
  if (!validCas(number)) return json({ error: 'invalid CAS number' }, 400);

  const admin = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'));
  try {
    const { data: known } = await admin
      .from('substances')
      .select('id, name, ec_number, outside_checked_at')
      .eq('cas_number', number)
      .maybeSingle();
    const checked = known?.outside_checked_at ? Date.parse(known.outside_checked_at) : 0;
    if (known && !refresh && Date.now() - checked < MAX_AGE_MS) {
      return json({ found: true, substanceId: known.id, name: known.name, cached: true });
    }

    const key = encodeURIComponent(number);
    const synonyms = await get(`${PUG}/compound/name/${key}/synonyms/JSON`);
    const properties = synonyms
      ? await get(
          `${PUG}/compound/name/${key}/property/Title,MolecularFormula,MolecularWeight/JSON`,
        )
      : null;
    const identity = synonyms ? parseIdentity(number, synonyms, properties ?? {}) : null;
    if (!identity && !known) return json({ found: false });

    let substanceId = known?.id as string | undefined;
    if (!substanceId && identity) {
      const { data: inserted, error } = await admin
        .from('substances')
        .insert({ cas_number: number, name: identity.name, ec_number: identity.ecNumber })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      substanceId = inserted.id as string;
    }

    let stored = 0;
    if (identity) {
      const ghs = (await get(
        `${VIEW}/${identity.cid}/JSON?heading=GHS%20Classification`,
      )) as PugView | null;
      const categories = ghs
        ? ((await get(
            `${VIEW}/${identity.cid}/JSON?heading=Hazard%20Classes%20and%20Categories`,
          )) as PugView | null)
        : null;
      const sources = ghs
        ? parseGhs(ghs, categories ?? {}).filter((s) => !EXCLUDED_FAMILIES.has(s.family))
        : [];
      for (const s of sources) {
        // The registry keeps the licence decision; a refetch never resets it.
        const { error: regError } = await admin.from('outside_sources').upsert(
          {
            source_id: s.sourceId,
            name: `${s.sourceName} (PubChem üzerinden)`,
            family: s.family,
            license_note: s.licenseNote,
            license_url: s.licenseUrl,
          },
          { onConflict: 'source_id' },
        );
        if (regError) throw new Error(regError.message);
        const { data: registry } = await admin
          .from('outside_sources')
          .select('data_license')
          .eq('source_id', s.sourceId)
          .single();
        const { error: recError } = await admin.from('substance_source_records').upsert(
          {
            cas_number: number,
            source_id: s.sourceId,
            family: s.family,
            name: s.sourceName,
            reference: s.url ?? `PubChem CID ${identity.cid}`,
            lines: s.statements,
            category_texts: s.categoryTexts,
            not_classified: s.notClassified,
            data_license: registry?.data_license ?? 'unverified',
            snapshot: { cid: identity.cid, unreadable: s.unreadable, ...s.snapshot },
            fetched_at: new Date().toISOString(),
          },
          { onConflict: 'cas_number,source_id' },
        );
        if (recError) throw new Error(recError.message);
        stored += 1;
      }
    }
    if (substanceId) {
      await admin
        .from('substances')
        .update({ outside_checked_at: new Date().toISOString() })
        .eq('id', substanceId);
    }
    return json({
      found: true,
      substanceId,
      name: known?.name ?? identity?.name ?? null,
      sources: stored,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
