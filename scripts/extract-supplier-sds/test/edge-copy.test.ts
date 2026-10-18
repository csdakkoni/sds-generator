import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EDGE_DIR, SHARED } from '../sync-edge.ts';

describe('Edge Function copies', () => {
  it.each(SHARED)('%s matches the CLI source (run npm run sync:edge)', (file) => {
    const source = readFileSync(join(import.meta.dirname, '../src', file), 'utf8');
    expect(readFileSync(join(EDGE_DIR, file), 'utf8')).toBe(source);
  });
});
