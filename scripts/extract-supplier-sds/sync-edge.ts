// Copies the extraction modules the Supabase Edge Function shares with this CLI.
// The function cannot import from outside supabase/functions, so it keeps copies;
// test/edge-copy.test.ts fails when they drift.
import { cpSync } from 'node:fs';
import { join } from 'node:path';

export const SHARED: string[] = [
  'schema.ts',
  'prompt.ts',
  'checks.ts',
  'provider.ts',
  'validate.ts',
  'providers/anthropic.ts',
];
export const EDGE_DIR = new URL('../../supabase/functions/_shared/extraction/', import.meta.url)
  .pathname;
const SRC_DIR = new URL('./src/', import.meta.url).pathname;

if (process.argv[1] === new URL(import.meta.url).pathname) {
  for (const file of SHARED) cpSync(join(SRC_DIR, file), join(EDGE_DIR, file));
  console.log(`Copied ${SHARED.length} files to ${EDGE_DIR}`);
}
