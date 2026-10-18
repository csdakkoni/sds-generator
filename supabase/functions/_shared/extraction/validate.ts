/**
 * Schema handling shared by the CLI and the Supabase Edge Function (no Node-only imports).
 */
import { z } from 'zod';
import { Extraction } from './schema.ts';

/** JSON Schema sent to the model. */
export const RESPONSE_SCHEMA = (() => {
  const schema = z.toJSONSchema(Extraction) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
})();

/** Validates model output; throws when it does not match the schema. */
export function parseExtraction(raw: unknown): Extraction {
  const parsed = Extraction.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Model output does not match the schema: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
