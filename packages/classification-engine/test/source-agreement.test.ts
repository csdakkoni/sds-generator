import { describe, expect, it } from 'vitest';
import { compareSources, type SourceClassification } from '../src';

const src = (
  sourceId: string,
  family: string,
  lines: { category: string; hCode: string }[],
): SourceClassification => ({ sourceId, family, reference: sourceId, lines });

const eye1 = { category: 'Eye Dam. 1', hCode: 'H318' };
const eye2 = { category: 'Eye Irrit. 2', hCode: 'H319' };
const flam2 = { category: 'Flam. Liq. 2', hCode: 'H225' };

describe('compareSources', () => {
  it('reports nothing for no sources', () => {
    expect(compareSources([]).status).toBe('none');
  });

  it('does not count two sources of the same family as a confirmation', () => {
    // PubChem repeats ECHA C&L notifications: one origin, one vote.
    const r = compareSources([
      src('pubchem', 'echa_notifications', [eye1]),
      src('echa-cl', 'echa_notifications', [eye1]),
    ]);
    expect(r.status).toBe('single_family');
  });

  it('agrees when independent families list the same lines', () => {
    const r = compareSources([
      src('pubchem', 'echa_notifications', [flam2, eye2]),
      src('nite', 'nite', [eye2, flam2]),
    ]);
    expect(r.status).toBe('agreed');
    expect(r.families).toBe(2);
  });

  it('is a conflict when a class differs, naming the class and what each family says', () => {
    const r = compareSources([
      src('pubchem', 'echa_notifications', [eye1]),
      src('nite', 'nite', [eye2]),
    ]);
    expect(r.status).toBe('conflict');
    expect(r.differences).toEqual([
      {
        hazardClass: 'eye_damage_irritation',
        byFamily: { echa_notifications: 'Eye Dam. 1 (H318)', nite: 'Eye Irrit. 2 (H319)' },
      },
    ]);
  });

  it('treats a class listed by one family only as a difference, not as agreement', () => {
    const r = compareSources([src('a', 'fam-a', [eye1, flam2]), src('b', 'fam-b', [eye1])]);
    expect(r.status).toBe('conflict');
    expect(r.differences.map((d) => d.hazardClass)).toEqual(['flammable_liquid']);
  });

  it('groups acute toxicity by route', () => {
    const r = compareSources([
      src('a', 'fam-a', [{ category: 'Acute Tox. 4', hCode: 'H302' }]),
      src('b', 'fam-b', [{ category: 'Acute Tox. 4', hCode: 'H312' }]),
    ]);
    expect(r.differences.map((d) => d.hazardClass)).toEqual([
      'acute_toxicity:dermal',
      'acute_toxicity:oral',
    ]);
  });
});
