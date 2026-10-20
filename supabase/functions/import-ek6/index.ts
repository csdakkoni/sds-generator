/**
 * Loads SEA Annex 6 substance rows into the global substance library.
 *
 * POST { entries, dryRun } with a platform admin's session. The function checks the caller
 * with is_platform_admin(), then writes as the caller, so RLS on substances stays the
 * authority. The client sends the parsed Ek-6 entries in chunks of at most 500. A dry run
 * only counts what would be created or updated.
 *
 * mode "substances" (default) writes identities. mode "profiles" writes one pending harmonised
 * profile per substance with the raw Annex 6 row in source_snapshot (and the regulation version
 * record they point to). Hazard class lines are not written: they need expert review first.
 */
import { createClient } from '@supabase/supabase-js';
import { buildProfile, EK6_REGULATION, EK6_VERSION, type Ek6Row } from '../_shared/ek6/profile.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_CHUNK = 500;
const LIST_NO = /^\d{3}-\d{3}-\d{2}-[\dX]$/;

interface Ek6Entry extends Ek6Row {
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
    mode?: unknown;
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

  if (body.mode === 'profiles') return importProfiles(supabase, entries, dryRun);

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

type Client = ReturnType<typeof createClient>;

/** Finds (or, outside a dry run, creates) the draft regulation version the profiles point to. */
async function ensureVersion(supabase: Client, dryRun: boolean): Promise<string | null> {
  const { data: found, error } = await supabase
    .from('regulation_versions')
    .select('id')
    .eq('regulation', EK6_REGULATION)
    .eq('gazette_number', EK6_VERSION.gazette_number)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (found) return found.id as string;
  if (dryRun) return null;
  const { data: created, error: insertError } = await supabase
    .from('regulation_versions')
    .insert(EK6_VERSION)
    .select('id')
    .single();
  if (insertError) throw new Error(insertError.message);
  return created.id as string;
}

async function importProfiles(supabase: Client, entries: Ek6Entry[], dryRun: boolean) {
  try {
    const versionId = await ensureVersion(supabase, dryRun);
    const { data: substances, error: substanceError } = await supabase
      .from('substances')
      .select('id, list_no')
      .in(
        'list_no',
        entries.map((e) => e.list_no),
      );
    if (substanceError) throw new Error(substanceError.message);
    const idByListNo = new Map(
      (substances ?? []).map((r) => [r.list_no as string, r.id as string]),
    );
    const missing = entries.filter((e) => !idByListNo.has(e.list_no)).map((e) => e.list_no);

    const { data: existing, error: profileError } = await supabase
      .from('classification_profiles')
      .select('id, substance_id, verification_status')
      .eq('source_type', 'harmonised')
      .is('effective_to', null)
      .in('substance_id', [...idByListNo.values()]);
    if (profileError) throw new Error(profileError.message);
    const profileBySubstance = new Map((existing ?? []).map((p) => [p.substance_id as string, p]));

    let created = 0;
    let updated = 0;
    let kept = 0;
    const inserts: ReturnType<typeof buildProfile>[] = [];
    for (const entry of entries) {
      const substanceId = idByListNo.get(entry.list_no);
      if (!substanceId) continue;
      const current = profileBySubstance.get(substanceId);
      if (!current) {
        created += 1;
        if (!dryRun) inserts.push(buildProfile(entry, substanceId, versionId ?? ''));
      } else if (current.verification_status === 'pending') {
        updated += 1;
        if (!dryRun) {
          const { source_snapshot } = buildProfile(entry, substanceId, versionId ?? '');
          const { error } = await supabase
            .from('classification_profiles')
            .update({ source_snapshot })
            .eq('id', current.id);
          if (error) throw new Error(error.message);
        }
      } else {
        // A profile a person already verified is never overwritten by an import.
        kept += 1;
      }
    }
    if (inserts.length > 0) {
      const { error } = await supabase.from('classification_profiles').insert(inserts);
      if (error) throw new Error(error.message);
    }
    return json({ dryRun, mode: 'profiles', created, updated, kept, missingSubstances: missing });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
}
