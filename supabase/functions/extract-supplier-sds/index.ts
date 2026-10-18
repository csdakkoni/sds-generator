/**
 * Reads an uploaded supplier SDS with the model and stores the structured result.
 *
 * POST { documentId } with the user's session. The caller must be able to edit the
 * document's firm (checked through RLS by acting as the caller). The extraction runs in
 * the background; the client follows raw_material_sds_documents.extraction_status.
 * The API key (SDS_ANTHROPIC_API_KEY) is a function secret, never sent to the browser.
 */
import { Buffer } from 'node:buffer';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { checkExtraction } from '../_shared/extraction/checks.ts';
import { INSTRUCTIONS } from '../_shared/extraction/prompt.ts';
import { createProvider } from '../_shared/extraction/provider.ts';
import type { Extraction } from '../_shared/extraction/schema.ts';
import { parseExtraction, RESPONSE_SCHEMA } from '../_shared/extraction/validate.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

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

interface DocumentRow {
  id: string;
  organization_id: string;
  raw_material_id: string;
  storage_path: string;
  file_name: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'not signed in' }, 401);
  const { documentId } = (await req.json().catch(() => ({}))) as { documentId?: string };
  if (!documentId) return json({ error: 'documentId is required' }, 400);

  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
  });

  // The update only succeeds for members who may edit this firm's data (RLS).
  const { data: doc, error } = await supabase
    .from('raw_material_sds_documents')
    .update({ extraction_status: 'running', extraction_error: null })
    .eq('id', documentId)
    .neq('extraction_status', 'running')
    .select('id, organization_id, raw_material_id, storage_path, file_name')
    .maybeSingle<DocumentRow>();
  if (error) return json({ error: error.message }, 400);
  if (!doc) return json({ error: 'document not found, not editable, or already running' }, 404);

  EdgeRuntime.waitUntil(run(supabase, doc));
  return json({ status: 'running' }, 202);
});

async function run(supabase: SupabaseClient, doc: DocumentRow) {
  try {
    const { data: file, error } = await supabase.storage
      .from('supplier-sds')
      .download(doc.storage_path);
    if (error || !file) throw new Error(`PDF could not be read: ${error?.message ?? 'empty'}`);

    const provider = await createProvider('anthropic', undefined);
    const raw = await provider.extract({
      pdf: Buffer.from(await file.arrayBuffer()),
      fileName: doc.file_name,
      instructions: INSTRUCTIONS,
      responseSchema: RESPONSE_SCHEMA,
    });
    const extraction = parseExtraction(raw);
    // No text layer here, so only the consistency checks run (no quote matching).
    extraction.flags.push(...checkExtraction(extraction, null));
    await store(supabase, doc, extraction, provider.name, provider.model);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabase
      .from('raw_material_sds_documents')
      .update({ extraction_status: 'failed', extraction_error: message.slice(0, 1000) })
      .eq('id', doc.id);
  }
}

async function store(
  supabase: SupabaseClient,
  doc: DocumentRow,
  extraction: Extraction,
  provider: string,
  model: string,
) {
  const identity = extraction.identity;
  const check = (result: { error: { message: string } | null }) => {
    if (result.error) throw new Error(result.error.message);
  };

  check(await supabase.from('raw_material_components').delete().eq('sds_document_id', doc.id));
  if (extraction.components.length > 0) {
    check(
      await supabase.from('raw_material_components').insert(
        extraction.components.map((c) => ({
          organization_id: doc.organization_id,
          raw_material_id: doc.raw_material_id,
          sds_document_id: doc.id,
          name_as_written: c.name.value ?? '(adı okunamadı)',
          cas_number: c.cas.value,
          // Ranges stay ranges; an open bound stays null (rule 4).
          concentration_min: c.concentration?.min ?? null,
          concentration_max: c.concentration?.max ?? null,
          concentration_raw: c.concentration?.raw ?? null,
        })),
      ),
    );
  }
  if (identity.tradeName.value || identity.supplier.value) {
    check(
      await supabase
        .from('raw_materials')
        .update({
          ...(identity.tradeName.value ? { trade_name: identity.tradeName.value } : {}),
          ...(identity.supplier.value ? { supplier_name: identity.supplier.value } : {}),
        })
        .eq('id', doc.raw_material_id),
    );
  }
  check(
    await supabase
      .from('raw_material_sds_documents')
      .update({
        extraction,
        flags: extraction.flags,
        extractor: { provider, model, extractedAt: new Date().toISOString() },
        revision_number: identity.revisionNumber.value,
        revision_date: identity.revisionDate.value,
        extraction_status: 'done',
      })
      .eq('id', doc.id),
  );
}
