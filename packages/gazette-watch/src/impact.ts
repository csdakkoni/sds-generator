/**
 * Impact analysis for a regulation change: recompute every product under the old and the new
 * regulation version (dry run, nothing is stored) and report which products change.
 * The classifier is injected, so classification stays in the engine (CLAUDE.md rule 1); this module
 * only compares two results and prepares draft-revision queue items for the KDU list.
 */

export interface ClassificationSummary {
  hazardCodes: string[];
  signalWord: string | null;
  pictograms: string[];
}

export interface ProductRef {
  id: string;
  organizationId: string;
  name: string;
}

export type Classifier = (product: ProductRef) => ClassificationSummary;

export interface ProductImpact {
  product: ProductRef;
  addedHazardCodes: string[];
  removedHazardCodes: string[];
  signalWordChange: { from: string | null; to: string | null } | null;
  addedPictograms: string[];
  removedPictograms: string[];
}

const diff = (from: string[], to: string[]) => ({
  added: to.filter((x) => !from.includes(x)).sort(),
  removed: from.filter((x) => !to.includes(x)).sort(),
});

export function analyzeImpact(
  products: readonly ProductRef[],
  classifyOld: Classifier,
  classifyNew: Classifier,
): ProductImpact[] {
  const impacts: ProductImpact[] = [];
  for (const product of products) {
    const before = classifyOld(product);
    const after = classifyNew(product);
    const codes = diff(before.hazardCodes, after.hazardCodes);
    const pictograms = diff(before.pictograms, after.pictograms);
    const signalChanged = before.signalWord !== after.signalWord;
    if (
      codes.added.length === 0 &&
      codes.removed.length === 0 &&
      pictograms.added.length === 0 &&
      pictograms.removed.length === 0 &&
      !signalChanged
    )
      continue;
    impacts.push({
      product,
      addedHazardCodes: codes.added,
      removedHazardCodes: codes.removed,
      signalWordChange: signalChanged ? { from: before.signalWord, to: after.signalWord } : null,
      addedPictograms: pictograms.added,
      removedPictograms: pictograms.removed,
    });
  }
  return impacts;
}

/** One draft-revision item per changed product, for the firm's KDU list. */
export function toReviewItems(impacts: readonly ProductImpact[], changeEventId: string) {
  return impacts.map((impact) => ({
    organization_id: impact.product.organizationId,
    item_type: 'draft_revision' as const,
    title: `Taslak revizyon: ${impact.product.name}`,
    product_id: impact.product.id,
    change_event_id: changeEventId,
    detail: {
      added_hazard_codes: impact.addedHazardCodes,
      removed_hazard_codes: impact.removedHazardCodes,
      signal_word_change: impact.signalWordChange,
      added_pictograms: impact.addedPictograms,
      removed_pictograms: impact.removedPictograms,
    },
  }));
}
