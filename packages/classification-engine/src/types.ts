/** Hazard categories the engine evaluates, written as CLP/SEA abbreviations. */
export const HAZARD_CATEGORIES = [
  'Flam. Liq. 1',
  'Flam. Liq. 2',
  'Flam. Liq. 3',
  'Met. Corr. 1',
  'Acute Tox. 1',
  'Acute Tox. 2',
  'Acute Tox. 3',
  'Acute Tox. 4',
  'Skin Corr. 1',
  'Skin Corr. 1A',
  'Skin Corr. 1B',
  'Skin Corr. 1C',
  'Skin Irrit. 2',
  'Eye Dam. 1',
  'Eye Irrit. 2',
  'Resp. Sens. 1',
  'Resp. Sens. 1A',
  'Resp. Sens. 1B',
  'Skin Sens. 1',
  'Skin Sens. 1A',
  'Skin Sens. 1B',
  'Muta. 1A',
  'Muta. 1B',
  'Muta. 2',
  'Carc. 1A',
  'Carc. 1B',
  'Carc. 2',
  'Repr. 1A',
  'Repr. 1B',
  'Repr. 2',
  'Lact.',
  'STOT SE 1',
  'STOT SE 2',
  'STOT SE 3',
  'STOT RE 1',
  'STOT RE 2',
  'Asp. Tox. 1',
  'Aquatic Acute 1',
  'Aquatic Chronic 1',
  'Aquatic Chronic 2',
  'Aquatic Chronic 3',
  'Aquatic Chronic 4',
] as const;

export type HazardCategory = (typeof HAZARD_CATEGORIES)[number];

export type HazardClassId =
  | 'flammable_liquid'
  | 'metal_corrosion'
  | 'acute_toxicity_oral'
  | 'acute_toxicity_dermal'
  | 'acute_toxicity_inhalation'
  | 'skin_corrosion_irritation'
  | 'eye_damage_irritation'
  | 'respiratory_sensitisation'
  | 'skin_sensitisation'
  | 'germ_cell_mutagenicity'
  | 'carcinogenicity'
  | 'reproductive_toxicity'
  | 'lactation'
  | 'stot_single'
  | 'stot_repeated'
  | 'aspiration'
  | 'aquatic_acute'
  | 'aquatic_chronic';

export type Pictogram =
  'GHS01' | 'GHS02' | 'GHS03' | 'GHS04' | 'GHS05' | 'GHS06' | 'GHS07' | 'GHS08' | 'GHS09';

export type SignalWord = 'danger' | 'warning';

/** Concentration in % (w/w). A single value is given as min === max. */
export interface ConcentrationRange {
  min: number;
  max: number;
}

/** One approved classification line of a component, e.g. Skin Corr. 1B / H314. */
export interface ComponentClassification {
  /** CLP abbreviation. Categories the engine does not evaluate are reported, never ignored. */
  category: string;
  hCode: string;
}

/**
 * Specific concentration limit (SCL): from `lowerLimit` % (inclusive) up to `upperLimit` %
 * (exclusive, open-ended when omitted) the component carries `category`.
 */
export interface SpecificConcentrationLimit {
  category: HazardCategory;
  lowerLimit: number;
  upperLimit?: number;
}

export type InhalationForm = 'gas' | 'vapour' | 'dust_mist';

export interface AcuteToxicityEstimates {
  /** mg/kg bw */
  oral?: number;
  /** mg/kg bw */
  dermal?: number;
  /** ppmV for gas, mg/l for vapour and dust/mist */
  inhalation?: number;
}

/**
 * How complete the component's hazard data is:
 * - `classified`: `classifications` is the full approved classification.
 * - `not_classified`: assessed and not classified for any hazard.
 * - `unknown`: no reliable data. Never treated as "no hazard".
 */
export type HazardDataStatus = 'classified' | 'not_classified' | 'unknown';

export interface ComponentInput {
  id: string;
  name: string;
  concentration: ConcentrationRange;
  hazardData: HazardDataStatus;
  classifications: ComponentClassification[];
  specificConcentrationLimits?: SpecificConcentrationLimit[];
  mFactors?: { acute?: number; chronic?: number };
  ate?: AcuteToxicityEstimates;
  /** Physical form relevant for inhalation toxicity; required when classified for inhalation. */
  inhalationForm?: InhalationForm;
  /**
   * The substance's harmonised (SEA Annex 6) classification, already verified by a person.
   * It is a floor for the lines above: see `applyHarmonised`.
   */
  harmonised?: { reference: string; classifications: ComponentClassification[] };
}

/** Laboratory results measured on the mixture itself. */
export interface MixtureMeasurements {
  physicalState?: 'liquid' | 'solid' | 'gas';
  /** Closed-cup flash point, °C */
  flashPointC?: number;
  /** Initial boiling point, °C */
  initialBoilingPointC?: number;
  pH?: number;
  /** Kinematic viscosity at 40 °C, mm²/s */
  kinematicViscosity40C?: number;
  /** Result of the metal corrosion test (UN Test C.1). */
  metalCorrosion?: 'positive' | 'negative';
}

export interface MixtureInput {
  components: ComponentInput[];
  measurements: MixtureMeasurements;
}

export interface TraceEntry {
  /** Turkish, human-readable justification, e.g. "H318, çünkü …". */
  message: string;
  /** Regulatory reference the rule is based on. */
  reference: string;
}

export type ClassStatus = 'classified' | 'not_classified' | 'undetermined';

export interface MixtureClassification {
  hazardClass: HazardClassId;
  category: HazardCategory;
  hCodes: string[];
  /** Category obtained at the lower bound of every concentration range; null if not classified there. */
  lowerBoundCategory: HazardCategory | null;
  trace: TraceEntry[];
}

export type WarningSeverity = 'blocking' | 'review' | 'info';

export interface EngineWarning {
  code: string;
  severity: WarningSeverity;
  message: string;
  hazardClass?: HazardClassId;
  componentIds?: string[];
}

export interface PStatementSuggestion {
  code: string;
  /** Categories that call for this statement. */
  categories: HazardCategory[];
}

export interface SupplementalStatement {
  code: string;
  /** Turkish text or data to fill into the statement, e.g. the component name for EUH208. */
  detail: string;
  trace: TraceEntry;
}

export interface LabelElements {
  pictograms: Pictogram[];
  signalWord: SignalWord | null;
  hStatements: string[];
  /** Suggestions only: the KDU selects the final precautionary statements. */
  pStatementSuggestions: PStatementSuggestion[];
  supplemental: SupplementalStatement[];
  trace: TraceEntry[];
}

export interface AteResult {
  route: 'oral' | 'dermal' | 'inhalation';
  form?: InhalationForm;
  /** ATEmix at the lower and upper bound of the concentration ranges; null when not computable. */
  lower: number | null;
  upper: number | null;
  unit: 'mg/kg' | 'ppmV' | 'mg/l';
}

export interface ClassificationResult {
  engineVersion: string;
  /** Concentration assumption applied to the final result. */
  concentrationAssumption: 'upper_bound';
  classifications: MixtureClassification[];
  classStatus: Record<HazardClassId, ClassStatus>;
  ate: AteResult[];
  label: LabelElements;
  warnings: EngineWarning[];
  /** False while any blocking warning remains: the SDS cannot be finalised. */
  canFinalize: boolean;
}
