/**
 * Looks up the identity of a CAS number (name, synonyms, EC, formula) at PubChem.
 *
 * POST { cas } with the user's session. Identity only: no hazard data is read or returned.
 * The CAS check digit is verified before anything leaves the platform.
 */
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

function validCas(cas: string): boolean {
  if (!/^\d{2,7}-\d{2}-\d$/.test(cas)) return false;
  const digits = cas.replace(/-/g, '');
  const body = digits.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) sum += Number(body[body.length - 1 - i]) * (i + 1);
  return sum % 10 === Number(digits.slice(-1));
}

const BASE = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name';

async function get(url: string): Promise<unknown | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`PubChem ${res.status}`);
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!req.headers.get('Authorization')) return json({ error: 'not signed in' }, 401);
  const { cas } = (await req.json().catch(() => ({}))) as { cas?: string };
  const number = cas?.trim() ?? '';
  if (!validCas(number)) return json({ error: 'invalid CAS number' }, 400);

  try {
    const key = encodeURIComponent(number);
    const synonyms = await get(`${BASE}/${key}/synonyms/JSON`);
    if (!synonyms) return json({ found: false });
    const properties = await get(
      `${BASE}/${key}/property/Title,MolecularFormula,MolecularWeight/JSON`,
    );
    const identity = parseIdentity(number, synonyms, properties ?? {});
    return json(identity ? { found: true, identity } : { found: false });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
