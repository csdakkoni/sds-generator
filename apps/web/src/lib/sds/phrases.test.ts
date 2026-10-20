import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import phrases from './phrases.json';

const ENGINE_SRC = join(__dirname, '../../../../../packages/classification-engine/src');

/** Every quoted code literal in the engine sources (test-only scan, not product logic). */
function engineCodes(pattern: RegExp): string[] {
  const out = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.ts')) {
        for (const m of readFileSync(path, 'utf8').matchAll(pattern)) out.add(m[1] ?? '');
      }
    }
  };
  walk(ENGINE_SRC);
  return [...out].sort();
}

describe('statement tables', () => {
  it('have the same codes in TR and EN', () => {
    for (const kind of ['H', 'P', 'EUH'] as const) {
      expect(Object.keys(phrases.tr[kind]).sort()).toEqual(Object.keys(phrases.en[kind]).sort());
    }
  });

  it('have no empty statement text', () => {
    for (const lang of ['tr', 'en'] as const) {
      for (const kind of ['H', 'P', 'EUH'] as const) {
        for (const [code, text] of Object.entries(phrases[lang][kind])) {
          expect(text.trim(), `${lang} ${kind} ${code}`).not.toBe('');
        }
      }
    }
  });

  it('cover every H and P code the engine can emit', () => {
    const h = engineCodes(/'(H\d{3}[A-Za-z]?)'/g);
    const p = engineCodes(/'(P\d{3}(?:\+P\d{3})*)'/g);
    expect(h.length).toBeGreaterThan(20);
    expect(p.length).toBeGreaterThan(30);
    for (const lang of ['tr', 'en'] as const) {
      expect(h.filter((c) => !(c in phrases[lang].H))).toEqual([]);
      expect(p.filter((c) => !(c in phrases[lang].P))).toEqual([]);
    }
  });
});
