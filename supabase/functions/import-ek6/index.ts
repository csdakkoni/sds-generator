/**
 * Loads SEA Annex 6 substance rows into the global substance library.
 *
 * POST { entries, dryRun } with a platform admin's session. The function checks the caller
 * with is_platform_admin(), then writes as the caller, so RLS on substances stays the
 * authority. The client sends the parsed Ek-6 entries in chunks of at most 500. A dry run
 * only counts what would be created or updated. Hazard classifications are not written
 * here: they need expert review first.
 */
import { createClient } from '@supabase/supabase-js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_CHUNK = 500;
const LIST_NO = /^\d{3}-\d{3}-\d{2}-[\dX]$/;

interface Ek6Entry {
  list_no: string;
  name_en: string;
  name_tr: string;
  ec: string | null;
  cas: string | null;
}

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

function optionalText(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isEntry(value: unknown): value is Ek6Entry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.list_no === 'string' &&
    LIST_NO.test(e.list_no) &&
    typeof e.name_en === 'string' &&
    e.name_en.trim() !== '' &&
    typeof e.name_tr === 'string' &&
    optionalText(e.ec) &&
    optionalText(e.cas)
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'not signed in' }, 401);

  const body = (await req.json().catch(() => null)) as {
    entries?: unknown;
    dryRun?: unknown;
  } | null;
  if (!body || !Array.isArray(body.entries)) return json({ error: 'entries is required' }, 400);
  if (body.entries.length > MAX_CHUNK)
    return json({ error: `at most ${MAX_CHUNK} entries per call` }, 400);
  if (!body.entries.every(isEntry)) return json({ error: 'an entry is malformed' }, 400);
  const entries: Ek6Entry[] = body.entries;
  const dryRun = body.dryRun === true;

  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
  });

  const { data: isAdmin, error: adminError } = await supabase.rpc('is_platform_admin');
  if (adminError) return json({ error: adminError.message }, 500);
  if (!isAdmin) return json({ error: 'platform admin only' }, 403);

  const { data: existing, error: readError } = await supabase
    .from('substances')
    .select('list_no')
    .in(
      'list_no',
      entries.map((e) => e.list_no),
    );
  if (readError) return json({ error: readError.message }, 400);
  const known = new Set((existing ?? []).map((row) => row.list_no));
  const updated = entries.filter((e) => known.has(e.list_no)).length;
  const created = entries.length - updated;

  if (dryRun) return json({ dryRun: true, created, updated });

  const { error: writeError } = await supabase.from('substances').upsert(
    entries.map((e) => ({
      list_no: e.list_no,
      name: e.name_en,
      synonyms: e.name_tr && e.name_tr !== e.name_en ? [e.name_tr] : [],
      ec_number: e.ec,
      cas_number: e.cas,
    })),
    { onConflict: 'list_no' },
  );
  if (writeError) return json({ error: writeError.message }, 400);
  return json({ dryRun: false, created, updated });
});
