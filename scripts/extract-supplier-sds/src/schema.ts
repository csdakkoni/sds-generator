/**
 * Output schema of the supplier SDS extraction. Single source of truth: the TypeScript
 * types and the JSON Schema (schema.json, also sent to the model) are both derived from it.
 *
 * Rules carried by the schema:
 * - Every value has the page it came from and a short verbatim quote.
 * - A value not in the document is `null` with status `not_stated`; nothing is guessed.
 * - The raw material's own classification (section 2) and its components' classifications
 *   (section 3) are separate fields.
 * - Concentrations keep both bounds; a single value has min === max.
 * - Anything ambiguous, contradictory or unreadable goes to `flags`.
 */
import { z } from 'zod';

export const SourceRef = z
  .object({
    page: z.number().int().min(1).describe('1-based page number in the PDF'),
    quote: z.string().max(300).describe('Short verbatim quote from the document'),
  })
  .describe('Where the value was read');

/** A single extracted value with its provenance. */
function sourced<T extends z.ZodType>(value: T, description: string) {
  return z
    .object({
      status: z.enum(['found', 'not_stated']),
      value: value.nullable(),
      source: SourceRef.nullable(),
    })
    .describe(`${description}. status "not_stated" ⇒ value and source are null.`);
}

const SourcedText = (d: string) => sourced(z.string(), d);
const SourcedNumber = (d: string) => sourced(z.number(), d);

export const ClassificationLine = z.object({
  hazardClassAsWritten: z.string().describe('Hazard class and category exactly as written'),
  category: z
    .string()
    .nullable()
    .describe('CLP abbreviation, e.g. "Skin Corr. 1B", "Aquatic Chronic 3"'),
  hCode: z.string().nullable().describe('e.g. "H314"; null if not written next to the class'),
  source: SourceRef,
});

export const Concentration = z.object({
  min: z.number().min(0).max(100).nullable().describe('Lower bound in %; null if not stated'),
  max: z.number().min(0).max(100).nullable().describe('Upper bound in %; null if not stated'),
  raw: z.string().describe('As written, e.g. "≥ 10 - < 20 %"'),
  source: SourceRef,
});

export const SpecificConcentrationLimit = z.object({
  category: z.string().describe('CLP abbreviation, e.g. "Skin Irrit. 2"'),
  lowerLimit: z.number().nullable().describe('Inclusive lower limit in %'),
  upperLimit: z.number().nullable().describe('Exclusive upper limit in %; null if open-ended'),
  raw: z.string(),
  source: SourceRef,
});

export const Component = z.object({
  name: SourcedText('Chemical name'),
  cas: SourcedText('CAS number'),
  ec: SourcedText('EC number'),
  registrationNumber: SourcedText('REACH/KKDİK registration number'),
  concentration: Concentration.nullable(),
  classifications: z.array(ClassificationLine).describe('Classification of this component only'),
  specificConcentrationLimits: z.array(SpecificConcentrationLimit),
  mFactorAcute: SourcedNumber('M-factor (acute)'),
  mFactorChronic: SourcedNumber('M-factor (chronic)'),
  ateOral: SourcedNumber('ATE oral, mg/kg'),
  ateDermal: SourcedNumber('ATE dermal, mg/kg'),
  ateInhalation: sourced(
    z.object({ value: z.number(), unit: z.string(), form: z.string().nullable() }),
    'ATE inhalation with unit and form (gas, vapour, dust/mist)',
  ),
});

export const PhysicalProperty = z.object({
  property: z.enum([
    'physical_state',
    'colour',
    'odour',
    'ph',
    'melting_point',
    'boiling_point',
    'flash_point',
    'flammability',
    'explosive_limits',
    'vapour_pressure',
    'density',
    'relative_density',
    'solubility',
    'partition_coefficient',
    'auto_ignition_temperature',
    'decomposition_temperature',
    'viscosity',
    'other',
  ]),
  nameAsWritten: z.string(),
  value: z.string().nullable().describe('As written; null if "no data" / not stated'),
  numericMin: z.number().nullable(),
  numericMax: z.number().nullable(),
  unit: z.string().nullable(),
  conditions: z.string().nullable().describe('e.g. "20 °C", "1 % aqueous solution"'),
  method: z.string().nullable().describe('Test method, e.g. "DIN EN ISO 2719"'),
  source: SourceRef,
});

export const Flag = z.object({
  field: z.string().describe('Path of the field, e.g. "components[2].concentration"'),
  kind: z.enum(['ambiguous', 'conflict', 'unreadable', 'missing_expected', 'other']),
  message: z.string().describe('Turkish explanation for the reviewer'),
  page: z.number().int().nullable(),
});

export const Extraction = z.object({
  identity: z.object({
    tradeName: SourcedText('Trade name'),
    supplier: SourcedText('Supplier company'),
    revisionDate: SourcedText('SDS revision date as written'),
    revisionNumber: SourcedText('SDS revision/version number'),
    language: z.enum(['tr', 'en', 'tr_en', 'other']),
  }),
  productClassification: z.object({
    status: z.enum(['classified', 'not_classified', 'not_stated']),
    lines: z.array(ClassificationLine).describe('Section 2.1 classification of the raw material'),
    statusSource: SourceRef.nullable(),
  }),
  components: z.array(Component).describe('Section 3 components'),
  physicalProperties: z.array(PhysicalProperty).describe('Section 9'),
  transport: z.object({
    unNumber: SourcedText('UN number'),
    transportClass: SourcedText('Transport hazard class'),
    packingGroup: SourcedText('Packing group'),
  }),
  flags: z.array(Flag),
});

export type Extraction = z.infer<typeof Extraction>;

/** What the CLI writes per document: the model output plus run metadata. */
export const ExtractionFile = z.object({
  file: z.string(),
  pageCount: z.number().int(),
  scanned: z.boolean().nullable().describe('True when the PDF has no text layer; null if unknown'),
  provider: z.string(),
  model: z.string(),
  extractedAt: z.string(),
  durationMs: z.number(),
  extraction: Extraction,
});

export type ExtractionFile = z.infer<typeof ExtractionFile>;
