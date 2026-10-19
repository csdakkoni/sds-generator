import { describe, expect, it } from 'vitest';
import { analyzeImpact, toReviewItems, type ClassificationSummary } from '../src/impact';

const a = { id: 'a', organizationId: 'o1', name: 'A' };
const b = { id: 'b', organizationId: 'o2', name: 'B' };
const base: ClassificationSummary = {
  hazardCodes: ['H315'],
  signalWord: 'Dikkat',
  pictograms: ['GHS07'],
};

describe('analyzeImpact', () => {
  it('reports only products whose result changes', () => {
    const impacts = analyzeImpact(
      [a, b],
      () => base,
      (p) =>
        p.id === 'a'
          ? { hazardCodes: ['H315', 'H318'], signalWord: 'Tehlike', pictograms: ['GHS05', 'GHS07'] }
          : base,
    );
    expect(impacts).toHaveLength(1);
    expect(impacts[0]).toMatchObject({
      addedHazardCodes: ['H318'],
      removedHazardCodes: [],
      signalWordChange: { from: 'Dikkat', to: 'Tehlike' },
      addedPictograms: ['GHS05'],
    });
  });

  it('is empty when nothing changes', () => {
    expect(
      analyzeImpact(
        [a],
        () => base,
        () => base,
      ),
    ).toEqual([]);
  });

  it('builds one review item per changed product, scoped to its organisation', () => {
    const impacts = analyzeImpact(
      [a],
      () => base,
      () => ({ ...base, hazardCodes: [] }),
    );
    const items = toReviewItems(impacts, 'evt');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      organization_id: 'o1',
      product_id: 'a',
      change_event_id: 'evt',
    });
    expect(items[0]?.detail.removed_hazard_codes).toEqual(['H315']);
  });
});
