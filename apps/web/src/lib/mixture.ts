/**
 * Turns a recipe into the classification engine's input. This file only gathers data: every
 * hazard decision is the engine's (CLAUDE.md rule 1). Whatever cannot be passed on faithfully
 * becomes a warning in the same shape as the engine's, so gaps never read as "no hazard".
 */
import {
  hCodeOptions,
  isHazardCategory,
  type ComponentClassification,
  type ComponentInput,
  type EngineWarning,
  type InhalationForm,
  type MixtureInput,
  type MixtureMeasurements,
  type SpecificConcentrationLimit,
} from '@sds/classification-engine';
import type { HarmonisedEntry } from './ek6';
import { agreementLabel, type ConfirmedProfile, type OutsideSummary } from './outside-summary';
import type { ClassificationLine, Extraction, ManualComponent } from './types';

export interface RecipeLine {
  id: string;
  raw_material_id: string;
  percent_min: number;
  percent_max: number;
}

export interface RecipeMaterial {
  id: string;
  trade_name: string;
  /** Extraction of the raw material's KDU-approved supplier SDS; null when none is approved. */
  approvedExtraction: Extraction | null;
  /** Components entered by CAS number when there is no supplier SDS. */
  manualComponents?: ManualComponent[];
}

export interface MeasurementRow {
  property: string;
  value_text: string;
  numeric_min: number | null;
}

/** Mixture measurements the engine uses, with their Turkish labels and units. */
export const MEASUREMENTS = [
  { key: 'physical_state', label: 'Fiziksel hâl', unit: null },
  { key: 'flash_point', label: 'Parlama noktası (kapalı kap)', unit: '°C' },
  { key: 'boiling_point', label: 'Kaynama başlangıç noktası', unit: '°C' },
  { key: 'ph', label: 'pH', unit: null },
  { key: 'kinematic_viscosity_40c', label: 'Kinematik viskozite (40 °C)', unit: 'mm²/s' },
  { key: 'metal_corrosion', label: 'Metal aşındırma testi (UN C.1)', unit: null },
] as const;

export type MeasurementKey = (typeof MEASUREMENTS)[number]['key'];

export function toMeasurements(rows: MeasurementRow[]): MixtureMeasurements {
  const m: MixtureMeasurements = {};
  const num = (key: MeasurementKey) => {
    const v = rows.find((r) => r.property === key)?.numeric_min;
    return v === null || v === undefined ? undefined : Number(v);
  };
  const text = (key: MeasurementKey) => rows.find((r) => r.property === key)?.value_text;

  const state = text('physical_state');
  if (state === 'liquid' || state === 'solid' || state === 'gas') m.physicalState = state;
  const flash = num('flash_point');
  if (flash !== undefined) m.flashPointC = flash;
  const boiling = num('boiling_point');
  if (boiling !== undefined) m.initialBoilingPointC = boiling;
  const ph = num('ph');
  if (ph !== undefined) m.pH = ph;
  const viscosity = num('kinematic_viscosity_40c');
  if (viscosity !== undefined) m.kinematicViscosity40C = viscosity;
  const corrosion = text('metal_corrosion');
  if (corrosion === 'positive' || corrosion === 'negative') m.metalCorrosion = corrosion;
  return m;
}

function warn(severity: EngineWarning['severity'], code: string, message: string): EngineWarning {
  return { code, severity, message };
}

const pct = (n: number) =>
  `%${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 4 }).format(n)}`;

/** Component lines for the engine; lines it cannot use are reported, never dropped silently. */
function mapLines(
  lines: ClassificationLine[],
  label: string,
  notes: EngineWarning[],
): ComponentClassification[] {
  const out: ComponentClassification[] = [];
  for (const line of lines) {
    const category = line.category?.trim();
    if (!category) {
      notes.push(
        warn(
          'blocking',
          'RECIPE_CATEGORY_UNREADABLE',
          `${label}: "${line.hazardClassAsWritten}" sınıfının kısaltması okunamadı. Hammadde incelemesinde düzeltilmeli.`,
        ),
      );
      continue;
    }
    if (line.hCode) {
      out.push({ category, hCode: line.hCode });
      continue;
    }
    // Categories the engine does not evaluate go through so the engine reports them.
    if (!isHazardCategory(category)) {
      out.push({ category, hCode: '—' });
      continue;
    }
    const options = hCodeOptions(category);
    if (options.length === 1) {
      out.push({ category, hCode: options[0] as string });
      notes.push(
        warn(
          'info',
          'RECIPE_H_CODE_FROM_CATEGORY',
          `${label}: ${category} için H kodu belgede yazmıyor; bu kategorinin tek H kodu ${options[0]} kullanıldı (CLP Ek I tabloları).`,
        ),
      );
    } else {
      notes.push(
        warn(
          'blocking',
          'RECIPE_H_CODE_MISSING',
          `${label}: ${category} için H kodu belgede yazmıyor ve kategoriden çıkarılamaz (${options.join(', ')}). KDU hammadde incelemesinde seçmeli; bu satır hesaba katılmadı.`,
        ),
      );
    }
  }
  return out;
}

function inhalationForm(text: string | null | undefined): InhalationForm | undefined {
  const t = (text ?? '').toLowerCase();
  if (/gas|gaz/.test(t)) return 'gas';
  if (/vapou?r|buhar/.test(t)) return 'vapour';
  if (/dust|mist|toz|sis/.test(t)) return 'dust_mist';
  return undefined;
}

type ExtractedComponent = Extraction['components'][number];

function componentDetails(c: ExtractedComponent): Partial<ComponentInput> {
  const details: Partial<ComponentInput> = {};
  const scls: SpecificConcentrationLimit[] = [];
  for (const s of c.specificConcentrationLimits ?? []) {
    if (isHazardCategory(s.category) && s.lowerLimit !== null) {
      scls.push({
        category: s.category,
        lowerLimit: s.lowerLimit,
        ...(s.upperLimit !== null ? { upperLimit: s.upperLimit } : {}),
      });
    }
  }
  if (scls.length > 0) details.specificConcentrationLimits = scls;
  const acute = c.mFactorAcute?.value;
  const chronic = c.mFactorChronic?.value;
  if (acute != null || chronic != null) {
    details.mFactors = {
      ...(acute != null ? { acute } : {}),
      ...(chronic != null ? { chronic } : {}),
    };
  }
  const oral = c.ateOral?.value;
  const dermal = c.ateDermal?.value;
  const inhalation = c.ateInhalation?.value;
  if (oral != null || dermal != null || inhalation) {
    details.ate = {
      ...(oral != null ? { oral } : {}),
      ...(dermal != null ? { dermal } : {}),
      ...(inhalation ? { inhalation: inhalation.value } : {}),
    };
  }
  const form = inhalationForm(inhalation?.form);
  if (form) details.inhalationForm = form;
  return details;
}

interface Collected {
  components: ComponentInput[];
  notes: EngineWarning[];
  cas: Record<string, string | null>;
  ec: Record<string, string | null>;
  names: Record<string, string>;
  sources: Record<string, string>;
}

/** Outside-source data for substances entered by CAS number (see lib/outside.ts). */
export interface OutsideData {
  summaries?: Record<string, OutsideSummary>;
  confirmed?: Record<string, ConfirmedProfile>;
}

/**
 * The Annex 6 entry as the engine takes it. An entry no person has checked yet (note letters,
 * specific limits) is used in the draft, but blocks finalising until it is checked.
 */
function harmonisedFor(
  entry: HarmonisedEntry,
  label: string,
  notes: EngineWarning[],
): { reference: string; classifications: { category: string; hCode: string }[] } {
  if (!entry.verified) {
    notes.push(
      warn(
        'blocking',
        'RECIPE_EK6_UNVERIFIED',
        `${label}: ${entry.reference} kaydı henüz kişi tarafından doğrulanmadı${entry.caveat ? ` (${entry.caveat})` : ''}; taslakta kullanıldı. Kesinleştirmek için Kütüphane'deki madde sayfasında doğrulanmalı.`,
      ),
    );
  }
  return { reference: entry.reference, classifications: entry.classifications };
}

/**
 * A raw material entered by CAS number has no supplier classification. Its hazard data, in
 * order: the Annex 6 entry (always a floor), the firm KDU's confirmed outside-source profile,
 * or, until a KDU confirms, the outside sources' most severe lines as a draft that blocks
 * finalising. With none of these the component stays "unknown" (CLAUDE.md rule 5).
 */
function addManual(
  line: RecipeLine,
  name: string,
  manual: ManualComponent[],
  harmonised: Record<string, HarmonisedEntry>,
  outside: OutsideData,
  out: Collected,
): void {
  const pMin = Number(line.percent_min);
  const pMax = Number(line.percent_max);
  const counts = { ek6: 0, confirmed: 0, draft: 0, none: 0 };
  manual.forEach((c, i) => {
    const label = `${c.name_as_written} (${name})`;
    let cMin = c.concentration_min;
    let cMax = c.concentration_max;
    if (cMin === null) cMin = 0;
    if (cMax === null) {
      cMax = 100;
      out.notes.push(
        warn(
          'review',
          'RECIPE_OPEN_UPPER_BOUND',
          `${label}: hammaddedeki oranın üst sınırı girilmemiş; üst sınır %100 varsayıldı (seçilmiş varsayım).`,
        ),
      );
    }
    const cas = c.cas_number;
    const official = cas ? harmonised[cas] : undefined;
    const confirmed = cas ? outside.confirmed?.[cas] : undefined;
    const summary = cas ? outside.summaries?.[cas] : undefined;
    let hazardData: ComponentInput['hazardData'] = 'unknown';
    let classifications: ComponentClassification[] = [];

    if (confirmed) {
      counts.confirmed += 1;
      classifications = confirmed.lines;
      hazardData = classifications.length > 0 ? 'classified' : 'not_classified';
    } else if (summary && summary.sources.length > 0) {
      counts.draft += 1;
      classifications = summary.draftLines.map((l) => ({ category: l.category, hCode: l.hCode }));
      const allNotClassified = summary.sources.every((s) => s.record.not_classified);
      hazardData =
        classifications.length > 0 ? 'classified' : allNotClassified ? 'not_classified' : 'unknown';
      const sourceNames = summary.sources.map((s) => s.record.name ?? s.record.source_id);
      const uncertain = summary.draftLines.filter((l) => l.uncertain);
      out.notes.push(
        warn(
          'blocking',
          'RECIPE_OUTSIDE_UNCONFIRMED',
          `${label}: sınıflandırma onaylanmamış dış kaynaklardan (${sourceNames.join(', ')}) taslak olarak alındı; ${agreementLabel(summary)}.${uncertain.length > 0 ? ` Kategorisi kaynakta yazmayan: ${uncertain.map((l) => `${l.hCode} (en ağır varsayıldı: ${l.category})`).join(', ')}.` : ''} Kesinleştirmek için KDU Kütüphane'de onaylamalı.`,
        ),
      );
      const notEvaluated = [...new Set(summary.sources.flatMap((s) => s.notEvaluated))];
      if (notEvaluated.length > 0) {
        out.notes.push(
          warn(
            'review',
            'RECIPE_OUTSIDE_NOT_EVALUATED',
            `${label}: kaynaklar motorun değerlendirmediği sınıflar da bildiriyor (${notEvaluated.join(', ')}); karışımın fiziksel tehlikeleri ölçülmüş veriyle belirlenir, diğerlerini KDU değerlendirmeli.`,
          ),
        );
      }
    } else if (!official) {
      counts.none += 1;
    }
    if (official) counts.ek6 += 1;

    const id = `${line.id}:${i}`;
    out.cas[id] = cas;
    out.names[id] = c.name_as_written;
    out.ec[id] = null;
    out.components.push({
      id,
      name: label,
      concentration: { min: (pMin * cMin) / 100, max: (pMax * cMax) / 100 },
      hazardData,
      classifications,
      ...(official ? { harmonised: harmonisedFor(official, label, out.notes) } : {}),
    });
  });
  const parts = [
    counts.ek6 > 0 && `SEA Ek-6 (${counts.ek6})`,
    counts.confirmed > 0 && `KDU onaylı dış kaynak (${counts.confirmed})`,
    counts.draft > 0 && `dış kaynak, onay bekliyor (${counts.draft})`,
    counts.none > 0 && `veri yok (${counts.none})`,
  ].filter(Boolean);
  out.sources[line.id] = `${parts.join(' + ')}, SDS yok`;
  out.notes.push(
    warn(
      'info',
      'RECIPE_MATERIAL_BY_CAS',
      `${name}: tedarikçi SDS'i yok, bileşenler CAS numarasıyla girildi. Sınıflandırma SEA Ek-6'dan ve dış kaynaklardan geliyor.`,
    ),
  );
}

/**
 * Builds the engine input from recipe lines. A component's share of the mixture is its
 * range in the raw material scaled by the raw material's range in the recipe, both bounds
 * kept (CLAUDE.md rule 4).
 */
export function buildMixture(
  lines: RecipeLine[],
  materials: RecipeMaterial[],
  measurements: MeasurementRow[],
  harmonised: Record<string, HarmonisedEntry> = {},
  outside: OutsideData = {},
): {
  input: MixtureInput;
  notes: EngineWarning[];
  cas: Record<string, string | null>;
  ec: Record<string, string | null>;
  /** Substance name per engine component id for printing; never a trade name. */
  names: Record<string, string>;
  /** One-word source label per recipe line (UX principle 6). */
  sources: Record<string, string>;
} {
  const notes: EngineWarning[] = [];
  const components: ComponentInput[] = [];
  /** CAS number per engine component id, for section 3 of the SDS. */
  const cas: Record<string, string | null> = {};
  /** EC number per engine component id, for section 3 of the SDS. */
  const ec: Record<string, string | null> = {};
  const names: Record<string, string> = {};
  const sources: Record<string, string> = {};

  for (const line of lines) {
    const material = materials.find((m) => m.id === line.raw_material_id);
    const pMin = Number(line.percent_min);
    const pMax = Number(line.percent_max);
    const name = material?.trade_name ?? 'Bilinmeyen hammadde';
    const extraction = material?.approvedExtraction;

    if (!extraction && material?.manualComponents?.length) {
      addManual(line, name, material.manualComponents, harmonised, outside, {
        components,
        notes,
        cas,
        ec,
        names,
        sources,
      });
      continue;
    }

    if (!extraction) {
      sources[line.id] = 'KDU kontrolünde';
      notes.push(
        warn(
          'info',
          'RECIPE_MATERIAL_NOT_APPROVED',
          `${name}: KDU onaylı tedarikçi SDS'i yok, verisi kullanılmadı.`,
        ),
      );
      names[line.id] = 'Bileşimi bilinmeyen madde';
      components.push({
        id: line.id,
        name,
        concentration: { min: pMin, max: pMax },
        hazardData: 'unknown',
        classifications: [],
      });
      continue;
    }

    if (extraction.components.length === 0) {
      // No section 3: the raw material itself is the component (e.g. a single substance).
      sources[line.id] = 'Tedarikçi SDS (onaylı)';
      const pc = extraction.productClassification;
      const classifications = mapLines(pc.lines, name, notes);
      // The SDS names no substance, and the printed SDS must not carry a trade name.
      names[line.id] = 'Madde adı belirtilmemiş';
      notes.push(
        warn(
          'review',
          'RECIPE_SUBSTANCE_NAME_MISSING',
          `${name}: tedarikçi SDS'inde bileşim yok, bu yüzden madde adı ve CAS numarası bilinmiyor. SDS'e ticari ad basılmaz; madde adı ve CAS CAS ile hammadde olarak girilmeli.`,
        ),
      );
      components.push({
        id: line.id,
        name,
        concentration: { min: pMin, max: pMax },
        hazardData:
          pc.status === 'not_stated'
            ? 'unknown'
            : pc.lines.length > 0
              ? 'classified'
              : 'not_classified',
        classifications,
      });
      continue;
    }

    let fromEk6 = 0;
    extraction.components.forEach((c, i) => {
      const label = `${c.name.value ?? `${i + 1}. bileşen`} (${name})`;
      let cMin = c.concentration?.min ?? null;
      let cMax = c.concentration?.max ?? null;
      if (cMin === null) cMin = 0;
      if (cMax === null) {
        cMax = 100;
        notes.push(
          warn(
            'review',
            'RECIPE_OPEN_UPPER_BOUND',
            `${label}: hammaddedeki oranın üst sınırı yazılmamış (${c.concentration?.raw ?? 'oran yok'}); üst sınır %100 varsayıldı (seçilmiş varsayım).`,
          ),
        );
      }
      const min = (pMin * cMin) / 100;
      const max = (pMax * cMax) / 100;
      const classifications = mapLines(c.classifications, label, notes);
      if (c.classifications.length === 0) {
        // TODO(KDU): a component listed in section 3 without any classification is taken as
        // not classified. Confirm, or treat it as missing data.
        notes.push(
          warn(
            'review',
            'RECIPE_COMPONENT_UNCLASSIFIED',
            `${label}: tedarikçi SDS'inde sınıflandırması olmadan listelenmiş; sınıflandırılmamış kabul edildi (${pct(min)}–${pct(max)}).`,
          ),
        );
      }
      const official = c.cas.value ? harmonised[c.cas.value] : undefined;
      if (official) fromEk6 += 1;
      names[`${line.id}:${i}`] = c.name.value ?? `${i + 1}. bileşen`;
      cas[`${line.id}:${i}`] = c.cas.value;
      ec[`${line.id}:${i}`] = c.ec?.value ?? null;
      components.push({
        id: `${line.id}:${i}`,
        name: label,
        concentration: { min, max },
        hazardData: c.classifications.length > 0 ? 'classified' : 'not_classified',
        classifications,
        ...componentDetails(c),
        ...(official ? { harmonised: harmonisedFor(official, label, notes) } : {}),
      });
    });
    sources[line.id] =
      fromEk6 === 0
        ? 'Tedarikçi SDS (onaylı)'
        : fromEk6 === extraction.components.length
          ? 'SEA Ek-6 + tedarikçi SDS'
          : `SEA Ek-6 (${fromEk6}/${extraction.components.length} bileşen) + tedarikçi SDS`;

    const listedMax = extraction.components.reduce((s, c) => s + (c.concentration?.max ?? 100), 0);
    if (listedMax < 100 - 1e-9) {
      notes.push(
        warn(
          'review',
          'RECIPE_MATERIAL_REMAINDER',
          `${name}: tedarikçi SDS'inde listelenen bileşenler en fazla ${pct(listedMax)}; kalan kısım için veri yok.`,
        ),
      );
    }
  }

  const recipeMin = lines.reduce((s, l) => s + Number(l.percent_min), 0);
  const recipeMax = lines.reduce((s, l) => s + Number(l.percent_max), 0);
  if (lines.length > 0 && (recipeMin > 100 + 1e-9 || recipeMax < 100 - 1e-9)) {
    notes.push(
      warn(
        'blocking',
        'RECIPE_TOTAL',
        `Reçete toplamı %100'ü kapsamıyor (alt sınırlar toplamı ${pct(recipeMin)}, üst sınırlar toplamı ${pct(recipeMax)}).`,
      ),
    );
  }

  return {
    input: { components, measurements: toMeasurements(measurements) },
    notes,
    cas,
    ec,
    names,
    sources,
  };
}

export interface PastedLine {
  rawMaterialId: string;
  min: number;
  max: number;
}

/**
 * Reads recipe rows copied from a spreadsheet: a raw material name, then one percentage or
 * a lower and an upper percentage, separated by tabs or semicolons. Names are matched to the
 * library without regard to case; anything unmatched or unreadable is returned as a problem.
 */
export function parseRecipePaste(
  text: string,
  materials: { id: string; trade_name: string }[],
): { lines: PastedLine[]; problems: string[] } {
  const lines: PastedLine[] = [];
  const problems: string[] = [];
  const norm = (s: string) => s.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
  const num = (s: string | undefined) => {
    if (s === undefined) return NaN;
    const cleaned = s.replace('%', '').replace(',', '.').trim();
    return cleaned === '' ? NaN : Number(cleaned);
  };
  for (const row of text.split(/\r?\n/)) {
    if (!row.trim()) continue;
    const cells = row.split(/\t|;/).map((c) => c.trim());
    const name = cells[0] ?? '';
    const a = num(cells[1]);
    const b = cells.length > 2 && cells[2] !== '' ? num(cells[2]) : a;
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      problems.push(`"${row.trim()}": oran okunamadı.`);
      continue;
    }
    const [min, max] = a <= b ? [a, b] : [b, a];
    if (min < 0 || max > 100) {
      problems.push(`"${row.trim()}": oran 0 ile 100 arasında olmalı.`);
      continue;
    }
    const match =
      materials.find((m) => norm(m.trade_name) === norm(name)) ??
      materials.find((m) => norm(m.trade_name).includes(norm(name)) && norm(name).length > 2);
    if (!match) {
      problems.push(`"${name}": hammadde kütüphanende bulunamadı.`);
      continue;
    }
    lines.push({ rawMaterialId: match.id, min, max });
  }
  return { lines, problems };
}
