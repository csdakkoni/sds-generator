import { isHazardCategory } from './categories';
import { applyHarmonised } from './harmonised';
import { deriveLabel } from './label';
import { classifyAcuteToxicity } from './rules/acute-toxicity';
import { classifyAquatic, classifyAspiration } from './rules/aspiration-aquatic';
import { classifyCmr, classifyStot } from './rules/cmr-stot';
import { classifyPhysical } from './rules/physical';
import { classifySensitisation } from './rules/sensitisation';
import { classifyEye, classifySkin } from './rules/skin-eye';
import type {
  ClassificationResult,
  ClassStatus,
  EngineWarning,
  HazardClassId,
  MixtureInput,
} from './types';
import { type Component, fmt, fmtPctRange, type RuleOutput, toComponent } from './util';
import { ENGINE_VERSION } from './version';

const ALL_CLASSES: HazardClassId[] = [
  'flammable_liquid',
  'metal_corrosion',
  'acute_toxicity_oral',
  'acute_toxicity_dermal',
  'acute_toxicity_inhalation',
  'skin_corrosion_irritation',
  'eye_damage_irritation',
  'respiratory_sensitisation',
  'skin_sensitisation',
  'germ_cell_mutagenicity',
  'carcinogenicity',
  'reproductive_toxicity',
  'lactation',
  'stot_single',
  'stot_repeated',
  'aspiration',
  'aquatic_acute',
  'aquatic_chronic',
];

/**
 * Classifies a mixture from its components' approved classifications and its measured data.
 * Every result carries a trace; every gap shows up as a warning, never as "no hazard".
 */
export function classifyMixture(input: MixtureInput): ClassificationResult {
  const warnings: EngineWarning[] = [];
  const components = validate(input, warnings);
  const m = input.measurements;

  const skin = classifySkin(components);
  const outputs: RuleOutput[] = [
    classifyPhysical(components, m),
    classifyAcuteToxicity(components),
    skin.output,
    classifyEye(components, skin.findings),
    classifySensitisation(components, m.physicalState),
    classifyCmr(components),
    classifyStot(components),
    classifyAspiration(components, m),
    classifyAquatic(components),
  ];

  const classStatus = Object.fromEntries(ALL_CLASSES.map((c) => [c, 'undetermined'])) as Record<
    HazardClassId,
    ClassStatus
  >;
  for (const o of outputs) {
    Object.assign(classStatus, o.status);
    warnings.push(...o.warnings);
  }
  const classifications = outputs.flatMap((o) => o.classifications);
  const supplemental = outputs.flatMap((o) => o.supplemental ?? []);

  checkExtremePh(
    m.pH,
    classStatus,
    classifications.some(
      (c) => c.hazardClass === 'skin_corrosion_irritation' && c.hCodes.includes('H314'),
    ),
    warnings,
  );

  for (const c of classifications) {
    if (c.lowerBoundCategory !== c.category) {
      warnings.push({
        code: 'RANGE_BOUNDS_DIFFER',
        severity: 'review',
        hazardClass: c.hazardClass,
        message: `${c.category}: konsantrasyon aralığının alt sınırında sonuç ${c.lowerBoundCategory ?? 'sınıflandırılmaz'}. Üst sınır varsayımı uygulandı (seçilmiş varsayım, yasal bir zorunluluk değil).`,
      });
    }
  }

  return {
    engineVersion: ENGINE_VERSION,
    concentrationAssumption: 'upper_bound',
    classifications,
    classStatus,
    ate: outputs.flatMap((o) => o.ate ?? []),
    label: deriveLabel(classifications, supplemental),
    warnings,
    canFinalize: !warnings.some((w) => w.severity === 'blocking'),
  };
}

function validate(input: MixtureInput, warnings: EngineWarning[]): Component[] {
  const components: Component[] = [];
  for (const original of input.components) {
    const merged = applyHarmonised(original);
    const raw = merged.component;
    warnings.push(...merged.warnings);
    const { min, max } = raw.concentration;
    if (!(Number.isFinite(min) && Number.isFinite(max) && min >= 0 && min <= max && max <= 100)) {
      warnings.push({
        code: 'INVALID_CONCENTRATION',
        severity: 'blocking',
        componentIds: [raw.id],
        message: `${raw.name}: konsantrasyon aralığı geçersiz (alt ${String(min)}, üst ${String(max)}). Bileşen hesaba katılmadı.`,
      });
      continue;
    }
    const component = toComponent(raw);
    const unsupported = raw.classifications.filter((c) => !isHazardCategory(c.category));
    if (unsupported.length > 0) {
      warnings.push({
        code: 'UNSUPPORTED_CATEGORY',
        severity: 'blocking',
        componentIds: [raw.id],
        message: `${raw.name}: ${unsupported.map((c) => `${c.category} (${c.hCode})`).join(', ')} motorda değerlendirilmiyor. Bu sınıflar karışım için KDU tarafından ayrıca değerlendirilmeli.`,
      });
    }
    if (raw.hazardData !== 'classified' && raw.classifications.length > 0) {
      warnings.push({
        code: 'HAZARD_DATA_CONFLICT',
        severity: 'blocking',
        componentIds: [raw.id],
        message: `${raw.name}: veri durumu "${raw.hazardData}" ama sınıflandırma satırları var. Veri durumu düzeltilmeli.`,
      });
    }
    if (raw.hazardData === 'unknown') {
      warnings.push({
        code: 'COMPONENT_DATA_UNKNOWN',
        severity: 'blocking',
        componentIds: [raw.id],
        message: `${raw.name} (${fmtPctRange(min, max)}) için tehlike verisi yok. Eksik veri "tehlike yok" sayılmaz; ilgili sınıflar "belirlenemedi" olarak işaretlendi.`,
      });
    }
    components.push(component);
  }

  const totalMin = components.reduce((s, c) => s + c.concentration.min, 0);
  const totalMax = components.reduce((s, c) => s + c.concentration.max, 0);
  if (totalMin > 100 + 1e-9) {
    warnings.push({
      code: 'COMPOSITION_OVER_100',
      severity: 'blocking',
      message: `Bileşenlerin alt sınırlarının toplamı %${fmt(totalMin)} > %100. Bileşim tutarsız.`,
    });
  }
  if (totalMax < 100 - 1e-9) {
    warnings.push({
      code: 'COMPOSITION_INCOMPLETE',
      severity: 'review',
      message: `Bileşenlerin üst sınırlarının toplamı %${fmt(totalMax)} < %100; bileşimin bir kısmı tanımsız (TODO(KDU) #19).`,
    });
  }
  return components;
}

/**
 * Extreme pH (≤ 2 or ≥ 11.5) is only an indicator of corrosivity. It never lowers a
 * classification and does not classify on its own (CLAUDE.md rule 2; TODO(KDU) #7).
 */
function checkExtremePh(
  pH: number | undefined,
  status: Record<HazardClassId, ClassStatus>,
  corrosive: boolean,
  warnings: EngineWarning[],
): void {
  if (pH === undefined || corrosive) return;
  if (pH <= 2 || pH >= 11.5) {
    warnings.push({
      code: 'EXTREME_PH',
      severity: 'review',
      hazardClass: 'skin_corrosion_irritation',
      message: `Ölçülen pH ${fmt(pH)} (≤ 2 veya ≥ 11,5) aşındırıcılık göstergesi olabilir; karışım hesapla aşındırıcı çıkmadı. KDU değerlendirmeli (CLP Ek I 3.2.3.1.2).`,
    });
    if (status.skin_corrosion_irritation === 'not_classified') {
      status.skin_corrosion_irritation = 'undetermined';
    }
  }
}
